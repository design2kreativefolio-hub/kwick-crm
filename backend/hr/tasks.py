"""Daily staff-renewal reminder scan (spec follow-up: visa/insurance/ILOE
renewal dates nag the manager daily, top priority, starting a 30-day lead
window before the due date — matches the Renewals module's default lead
window (spec §14) — and continuing past due_date until the record is
updated). Scheduled via Celery Beat — see config/celery.py.

evaluate_staff_renewal() is also called directly (not just from the daily
scan) right after a manager edits a renewal date, so the reminder reflects
the new date instantly instead of waiting for tomorrow's scan.
"""
from datetime import date, timedelta

from celery import shared_task

# (StaffProfile field, human label) for each renewal date we track.
RENEWAL_FIELDS = [
    ("visa_renewal_date", "Visa renewal"),
    ("insurance_renewal_date", "Insurance renewal"),
    ("iloe_renewal_date", "ILOE renewal"),
]
RENEWAL_FIELD_LABELS = dict(RENEWAL_FIELDS)

LEAD_DAYS = 30


def renewal_object_ref(user_id: int, field: str) -> str:
    return f"staff_renewal:{user_id}:{field}"


def evaluate_staff_renewal(profile, field: str, label: str) -> None:
    from accounts.models import Module
    from notifications.services import (
        refresh_daily_reminder,
        stop_recurring_reminder,
        users_with_module_access,
    )

    today = date.today()
    lead_cutoff = today + timedelta(days=LEAD_DAYS)
    due_date = getattr(profile, field)
    object_ref = renewal_object_ref(profile.user_id, field)
    name = profile.user.full_name or profile.user.email

    if due_date and due_date <= lead_cutoff:
        overdue = due_date <= today
        refresh_daily_reminder(
            source="staff_renewal",
            title=f"{label} {'overdue' if overdue else 'due soon'}: {name}",
            body=(
                f"{name}'s {label.lower()} was due {due_date.strftime('%b %d, %Y')}. "
                "Update their record once it's renewed."
                if overdue
                else f"{name}'s {label.lower()} is due {due_date.strftime('%b %d, %Y')}."
            ),
            object_ref=object_ref,
            users=users_with_module_access(Module.HR),
        )
    else:
        # Date is unset or outside the lead window — nothing to nag about
        # (also the safety net if an HR edit didn't already stop it).
        stop_recurring_reminder(object_ref=object_ref)


@shared_task
def check_staff_renewals():
    from accounts.models import Role, StaffProfile, UserStatus

    profiles = StaffProfile.objects.select_related("user").filter(
        user__role=Role.EMPLOYEE, user__status=UserStatus.ACTIVE
    )
    for profile in profiles:
        for field, label in RENEWAL_FIELDS:
            evaluate_staff_renewal(profile, field, label)
