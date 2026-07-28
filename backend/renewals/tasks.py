"""
Renewal reminders (spec §14). Celery Beat runs `scan_renewals` daily:
  - flags renewals inside the lead windows (default 30/14/7/1 days) and pushes
    a notification to every active manager;
  - auto-flips status to `overdue` past due_date.
"""
from datetime import date

from celery import shared_task
from django.conf import settings

from notifications.services import notify_user


@shared_task
def scan_renewals():
    from accounts.models import Role, UserStatus, User
    from .models import Renewal

    today = date.today()
    windows = sorted(settings.RENEWAL_LEAD_WINDOWS_DAYS)  # e.g. [1, 7, 14, 30]
    managers = list(User.objects.filter(role=Role.MANAGER, status=UserStatus.ACTIVE))

    # 1) Overdue flip.
    Renewal.objects.filter(
        due_date__lt=today, status=Renewal.Status.UPCOMING
    ).update(status=Renewal.Status.OVERDUE)

    # 2) Lead-window notifications.
    for renewal in Renewal.objects.filter(status=Renewal.Status.UPCOMING):
        days_left = (renewal.due_date - today).days
        if days_left not in windows:
            continue
        # Don't re-notify for a window we've already covered.
        if renewal.last_notified_window == days_left:
            continue
        subject = (
            renewal.client.name
            if renewal.subject_type == Renewal.SubjectType.CLIENT and renewal.client
            else (renewal.staff.full_name if renewal.staff else "—")
        )
        for manager in managers:
            notify_user(
                user=manager,
                source="renewal",
                title=f"{renewal.get_renewal_type_display()} renewal in {days_left} day(s)",
                body=f"{subject}: {renewal.get_renewal_type_display()} due {renewal.due_date}.",
                object_ref=f"renewal:{renewal.id}:{days_left}",
            )
        renewal.last_notified_window = days_left
        renewal.save(update_fields=["last_notified_window", "updated_at"])
