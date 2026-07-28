from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsActive

from .models import NotificationEvent, PushSubscription
from .serializers import NotificationEventSerializer, PushSubscriptionSerializer


class PushSubscribeView(APIView):
    permission_classes = [IsActive]

    def post(self, request):
        serializer = PushSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sub, _ = PushSubscription.objects.update_or_create(
            endpoint=serializer.validated_data["endpoint"],
            defaults={"user": request.user, "keys": serializer.validated_data["keys"]},
        )
        return Response(PushSubscriptionSerializer(sub).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        endpoint = request.data.get("endpoint")
        PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationListView(APIView):
    permission_classes = [IsActive]

    def get(self, request):
        qs = NotificationEvent.objects.filter(user=request.user)[:100]
        return Response(NotificationEventSerializer(qs, many=True).data)


class NotificationMarkReadView(APIView):
    """Mark a single notification read (bell dropdown / notifications page)."""

    permission_classes = [IsActive]

    def post(self, request, pk):
        event = get_object_or_404(NotificationEvent, pk=pk, user=request.user)
        if event.read_at is None:
            event.read_at = timezone.now()
            event.save(update_fields=["read_at", "updated_at"])
        return Response(NotificationEventSerializer(event).data)


class NotificationMarkAllReadView(APIView):
    permission_classes = [IsActive]

    def post(self, request):
        NotificationEvent.objects.filter(user=request.user, read_at__isnull=True).update(
            read_at=timezone.now()
        )
        return Response({"detail": "ok"})


class NotificationMarkUnreadView(APIView):
    """Undo a read — lets a user flag a notification for later follow-up."""

    permission_classes = [IsActive]

    def post(self, request, pk):
        event = get_object_or_404(NotificationEvent, pk=pk, user=request.user)
        if event.read_at is not None:
            event.read_at = None
            event.save(update_fields=["read_at", "updated_at"])
        return Response(NotificationEventSerializer(event).data)
