"""
Notification dispatch (spec §13).

Every push mirrors as a WebSocket event for an instant in-app toast. Leave
requests / tickets are recurring-until-actioned. Approval/account emails never
go through this module (that's accounts.tasks).

These helpers are safe to call synchronously from request handlers; the actual
web-push send is deferred to Celery (notifications.tasks) so the request never
blocks on network I/O.
"""
from __future__ import annotations


def _managers():
    from accounts.models import Role, UserStatus, User

    return User.objects.filter(role=Role.MANAGER, status=UserStatus.ACTIVE)


def notify_user(*, user, source, title, body="", recurring=False, object_ref=""):
    """Create a NotificationEvent, push it, and mirror it over WebSocket."""
    from .models import NotificationEvent
    from .tasks import deliver_notification

    event = NotificationEvent.objects.create(
        user=user,
        source=source,
        title=title,
        body=body,
        recurring=recurring,
        object_ref=object_ref,
        active=True,
    )
    deliver_notification.delay(event.id)
    return event


def start_recurring_reminder(*, source, title, body="", object_ref=""):
    """
    Fan a recurring-until-actioned reminder out to every active manager
    (leave requests / tickets, spec §5.4 / §13). Idempotent per (manager, object_ref).
    """
    from .models import NotificationEvent

    events = []
    for manager in _managers():
        event, _ = NotificationEvent.objects.get_or_create(
            user=manager,
            object_ref=object_ref,
            defaults={
                "source": source,
                "title": title,
                "body": body,
                "recurring": True,
                "active": True,
            },
        )
        events.append(event)
    return events


def stop_recurring_reminder(*, object_ref):
    """Deactivate a recurring reminder the instant a manager actions it (spec §5.5)."""
    from django.utils import timezone

    from .models import NotificationEvent

    NotificationEvent.objects.filter(object_ref=object_ref, active=True).update(
        active=False, read_at=timezone.now()
    )
