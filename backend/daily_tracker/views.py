from datetime import timedelta

from django.db import IntegrityError
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsActive, is_superadmin

from .models import DailyTrackerEntry, TimeLog
from .serializers import DailyTrackerEntrySerializer


class DailyTrackerViewSet(viewsets.ModelViewSet):
    """Own entries only; manager can filter by ?user= (spec §9)."""

    serializer_class = DailyTrackerEntrySerializer
    permission_classes = [IsActive]
    filterset_fields = ["date"]

    def get_queryset(self):
        qs = DailyTrackerEntry.objects.select_related("user")
        if is_superadmin(self.request.user):
            user = self.request.query_params.get("user")
            return qs.filter(user_id=user) if user else qs
        return qs.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class TimeTrackerView(APIView):
    """Dashboard Time Tracker. GET = state, POST start, POST stop.
    The running session lives on the server, so it survives reloads and
    shows the same time on every device."""

    permission_classes = [IsActive]

    @staticmethod
    def _state(user):
        now = timezone.now()
        today = timezone.localdate()
        running = TimeLog.objects.filter(user=user, ended_at__isnull=True).first()
        total = 0
        for log in TimeLog.objects.filter(user=user, started_at__date__gte=today - timedelta(days=1)):
            if timezone.localtime(log.started_at).date() != today:
                continue
            end = log.ended_at or now
            total += max(0, int((end - log.started_at).total_seconds()))
        return {
            "running": bool(running),
            "started_at": running.started_at.isoformat() if running else None,
            "today_seconds": total,
            "server_now": now.isoformat(),
        }

    def get(self, request):
        return Response(self._state(request.user))

    def post(self, request, action=None):
        if action == "start":
            if not TimeLog.objects.filter(user=request.user, ended_at__isnull=True).exists():
                try:
                    TimeLog.objects.create(user=request.user, started_at=timezone.now())
                except IntegrityError:
                    pass  # double-click race: a timer is already running
        elif action == "stop":
            TimeLog.objects.filter(user=request.user, ended_at__isnull=True).update(
                ended_at=timezone.now(), updated_at=timezone.now()
            )
        else:
            return Response({"detail": "Unknown action."}, status=400)
        return Response(self._state(request.user))
