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


@shared_task
def send_open_item_nudges():
    """
    Remind each user about open (not done) calendar reminders and to-dos.

    Beat: 09:15 / 14:30 / 17:00 Asia/Dubai, Monday–Saturday (UTC crontabs).
    Offline users still get the NotificationEvent and see it on next login.
    Clears dashboard-card dismissals so items reappear on the card.
    """
    from accounts.models import User
    from calendar_app.models import ManualReminder
    from todos.models import TodoItem

    from .models import DashboardCardDismiss, NotificationEvent

    now = timezone.localtime()
    if now.weekday() == 6:  # Sunday
        return {"skipped": "sunday"}

    today = now.date()
    slot = now.strftime("%H:%M")

    rem_qs = (
        ManualReminder.objects.filter(done=False)
        .select_related("owner")
        .prefetch_related("assignees")
    )
    user_reminders: dict[int, list] = {}
    for rem in rem_qs:
        for uid in {rem.owner_id, *rem.assignees.values_list("id", flat=True)}:
            user_reminders.setdefault(uid, []).append(rem)

    user_todos: dict[int, list] = {}
    for todo in TodoItem.objects.filter(done=False).select_related("owner"):
        user_todos.setdefault(todo.owner_id, []).append(todo)

    nudged = 0
    for uid in set(user_reminders) | set(user_todos):
        rems = user_reminders.get(uid, [])
        todos = user_todos.get(uid, [])
        try:
            user = User.objects.get(pk=uid)
        except User.DoesNotExist:
            continue

        if rems:
            DashboardCardDismiss.objects.filter(
                user=user,
                kind=DashboardCardDismiss.Kind.REMINDER,
                object_id__in=[r.id for r in rems],
            ).delete()
        if todos:
            DashboardCardDismiss.objects.filter(
                user=user,
                kind=DashboardCardDismiss.Kind.TODO,
                object_id__in=[t.id for t in todos],
            ).delete()

        parts = []
        if rems:
            parts.append(f"{len(rems)} open reminder{'s' if len(rems) != 1 else ''}")
        if todos:
            parts.append(f"{len(todos)} open to-do{'s' if len(todos) != 1 else ''}")
        body = "You still have " + " and ".join(parts) + " pending."
        titles = [r.title for r in rems[:3]] + [t.text[:60] for t in todos[:3]]
        if titles:
            body = body + "\n• " + "\n• ".join(titles)
            extra = (len(rems) + len(todos)) - len(titles)
            if extra > 0:
                body = f"{body}\n…and {extra} more"

        object_ref = f"open-nudge:{uid}:{today.isoformat()}:{slot}"
        event, created = NotificationEvent.objects.get_or_create(
            user=user,
            object_ref=object_ref,
            defaults={
                "source": NotificationEvent.Source.CALENDAR,
                "title": "Pending reminders",
                "body": body,
                "recurring": False,
                "active": True,
            },
        )
        if not created:
            event.title = "Pending reminders"
            event.body = body
            event.active = True
            event.read_at = None
            event.save(update_fields=["title", "body", "active", "read_at", "updated_at"])

        DashboardCardDismiss.objects.filter(
            user=user,
            kind=DashboardCardDismiss.Kind.NOTIFICATION,
            object_id=event.id,
        ).delete()
        deliver_notification.delay(event.id)
        nudged += 1

    return {"nudged_users": nudged, "slot": slot, "date": today.isoformat()}
