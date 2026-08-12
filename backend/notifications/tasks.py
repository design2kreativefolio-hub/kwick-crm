"""Web-push delivery + WebSocket mirror (spec §13). Runs on Celery."""
import json

from asgiref.sync import async_to_sync
from celery import shared_task
from channels.layers import get_channel_layer
from django.conf import settings
from django.utils import timezone


def _push_group(user_id: int) -> str:
    return f"notify_{user_id}"


@shared_task
def deliver_notification(event_id: int):
    from .models import NotificationEvent

    try:
        event = NotificationEvent.objects.select_related("user").get(pk=event_id)
    except NotificationEvent.DoesNotExist:
        return

    payload = {
        "id": event.id,
        "source": event.source,
        "title": event.title,
        "body": event.body,
        "created_at": event.created_at.isoformat(),
    }

    # 1) Mirror over WebSocket for an instant in-app toast.
    layer = get_channel_layer()
    if layer is not None:
        async_to_sync(layer.group_send)(
            _push_group(event.user_id),
            {"type": "notify.event", "payload": payload},
        )

    # 2) Desktop web push via pywebpush + VAPID.
    _send_web_push(event.user, payload)

    event.sent_at = timezone.now()
    event.last_sent_at = timezone.now()
    event.save(update_fields=["sent_at", "last_sent_at", "updated_at"])


def _send_web_push(user, payload):
    if not (settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY):
        return  # keys not configured yet — WebSocket mirror still fires.
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:  # pragma: no cover
        return

    for sub in user.push_subscriptions.all():
        try:
            webpush(
                subscription_info={"endpoint": sub.endpoint, "keys": sub.keys},
                data=json.dumps(payload),
                vapid_private_key=settings.VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.VAPID_ADMIN_EMAIL},
            )
        except WebPushException:
            # 404/410 => subscription expired; prune it.
            sub.delete()


@shared_task
def send_web_push_payload(user_id: int, payload: dict):
    """Send a raw web-push payload to one user (e.g. chat) without creating a NotificationEvent."""
    from accounts.models import User

    try:
        user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return
    _send_web_push(user, payload)


@shared_task
def refire_recurring_reminders():
    """
    Re-fire active recurring reminders (leave/ticket) so they nag daily while
    pending, and stop once actioned (active flipped off). Scheduled via Celery Beat.
    """
    from .models import NotificationEvent

    for event in NotificationEvent.objects.filter(recurring=True, active=True):
        deliver_notification.delay(event.id)
