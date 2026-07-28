from datetime import date, timedelta

from django.utils.dateparse import parse_date
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsActive
from notifications.services import notify_user
from todos.models import TodoItem

from .models import ManualReminder
from .serializers import ManualReminderSerializer
from .services import build_agenda


class AgendaView(APIView):
    """GET /api/calendar/agenda?from=&to=&scope= (scope=all is manager-only, spec §10)."""

    permission_classes = [IsActive]

    def get(self, request):
        today = date.today()
        dt_from = parse_date(request.query_params.get("from", "")) or today
        dt_to = parse_date(request.query_params.get("to", "")) or (today + timedelta(days=30))
        scope = request.query_params.get("scope", "self")
        items = build_agenda(user=request.user, dt_from=dt_from, dt_to=dt_to, scope=scope)
        return Response({"from": dt_from, "to": dt_to, "scope": scope, "items": items})


class ManualReminderViewSet(viewsets.ModelViewSet):
    serializer_class = ManualReminderSerializer
    permission_classes = [IsActive]

    def get_queryset(self):
        from django.db.models import Q

        return ManualReminder.objects.filter(
            Q(owner=self.request.user) | Q(visibility=ManualReminder.Visibility.COMPANY)
        )

    def perform_create(self, serializer):
        reminder = serializer.save(owner=self.request.user)
        # A calendar reminder is also personal follow-up work — mirror it into
        # the owner's To-Do list and the Reminders/Notifications feed so it
        # isn't only visible by opening the calendar itself.
        TodoItem.objects.create(owner=self.request.user, text=reminder.title)
        notify_user(
            user=self.request.user,
            source="calendar",
            title=reminder.title,
            body=f"Reminder for {reminder.remind_at.strftime('%b %d, %Y')}",
            object_ref=f"reminder:{reminder.id}",
        )
