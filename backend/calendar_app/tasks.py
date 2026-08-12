"""Celery jobs for calendar reminder alerts (day-of high priority + 1 hour before)."""
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from notifications.services import notify_user

from .models import ManualReminder
from .services import is_meeting_link


def _recipients(reminder: ManualReminder):
    users = {reminder.owner}
    users.update(reminder.assignees.all())
    return users


@shared_task
def send_calendar_reminder_alerts():
    """
    Runs frequently (every 5 minutes).

    - Day-of: high-priority alert once on the morning of the reminder day
      (or as soon as we notice if the process starts later).
    - 1 hour before: alert once when remind_at is within the next 60 minutes.
    """
    now = timezone.now()
    today = timezone.localdate()

    # --- Day-of high priority ---
    day_qs = (
        ManualReminder.objects.filter(
            done=False,
            day_alert_sent=False,
            remind_at__date=today,
        )
        .select_related("owner")
        .prefetch_related("assignees")
    )
    for rem in day_qs:
        local = timezone.localtime(rem.remind_at)
        body = f"High priority — happening today at {local.strftime('%I:%M %p').lstrip('0')}."
        if rem.description:
            body = f"{body}\n{rem.description[:180]}"
        if rem.meeting_url and is_meeting_link(rem.meeting_url):
            body = f"{body}\nJoin: {rem.meeting_url}"
        for user in _recipients(rem):
            notify_user(
                user=user,
                source="calendar",
                title=f"🔔 High priority: {rem.title}",
                body=body,
                object_ref=f"reminder-day:{rem.id}:{today.isoformat()}",
            )
        rem.day_alert_sent = True
        rem.save(update_fields=["day_alert_sent", "updated_at"])

    # --- 1 hour before ---
    window_end = now + timedelta(hours=1)
    hour_qs = (
        ManualReminder.objects.filter(
            done=False,
            hour_alert_sent=False,
            remind_at__gt=now,
            remind_at__lte=window_end,
        )
        .select_related("owner")
        .prefetch_related("assignees")
    )
    for rem in hour_qs:
        local = timezone.localtime(rem.remind_at)
        mins = max(1, int((rem.remind_at - now).total_seconds() // 60))
        body = f"Starts in about {mins} minute{'s' if mins != 1 else ''} ({local.strftime('%I:%M %p').lstrip('0')})."
        if rem.meeting_url and is_meeting_link(rem.meeting_url):
            body = f"{body}\nGo to meeting: {rem.meeting_url}"
        for user in _recipients(rem):
            notify_user(
                user=user,
                source="calendar",
                title=f"⏰ Starting soon: {rem.title}",
                body=body,
                object_ref=f"reminder-hour:{rem.id}:{rem.remind_at.isoformat()}",
            )
        rem.hour_alert_sent = True
        rem.save(update_fields=["hour_alert_sent", "updated_at"])
