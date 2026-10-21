"""HR domain helpers."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from urllib.parse import urlparse

from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone

from accounts.models import ModuleAccess, Role, StaffProfile, UserStatus


def _anniversary(joined: date, year: int) -> date:
    try:
        return joined.replace(year=year)
    except ValueError:  # 29 Feb in a non-leap year
        return date(year, 2, 28)


def leave_cycle(staff, on: date | None = None) -> tuple[date, date]:
    """The staff member's current annual-leave year: from their joining
    anniversary to the day before the next one (e.g. joined 10 Jun 2024 →
    10 Jun 2026 – 9 Jun 2027). Falls back to the calendar year when no joining
    date is recorded. Before the joining date, the first cycle is returned."""
    on = on or date.today()
    profile = getattr(staff, "profile", None)
    joined = getattr(profile, "date_joined", None)
    if not joined:
        return date(on.year, 1, 1), date(on.year, 12, 31)
    if joined > on:
        start = joined
    else:
        start = _anniversary(joined, on.year)
        if start > on:
            start = _anniversary(joined, on.year - 1)
    end = _anniversary(joined, start.year + 1) - timedelta(days=1)
    return start, end


def recalc_leave_balance(staff):
    """Net approved paid leave starting inside the current leave cycle against
    the allowance (pending is recorded but not deducted). Used may exceed the allowance (remaining can
    go negative). The balance row is keyed by the calendar year the cycle began."""
    from hr.models import Leave, LeaveBalance

    start, end = leave_cycle(staff)
    balance, _ = LeaveBalance.objects.get_or_create(staff=staff, year=start.year)
    paid_types = [Leave.LeaveType.ANNUAL, Leave.LeaveType.OTHER]
    leaves = Leave.objects.filter(
        staff=staff, leave_type__in=paid_types, start_date__gte=start, start_date__lte=end
    )
    balance.used = sum(l.days for l in leaves if l.status == Leave.Status.APPROVED)
    balance.pending = sum(l.days for l in leaves if l.status == Leave.Status.PENDING)
    balance.save(update_fields=["used", "pending", "updated_at"])
    return balance


def month_leave_breakdown(staff, on: date | None = None) -> dict:
    """Leave days falling inside the current calendar month, by type.

    Approved leave is "taken"; pending is reported separately. A leave that
    straddles months only counts the days inside this month. Every leave type
    is included (sick/unpaid too) — this is a monthly activity view, not the
    annual-allowance maths."""
    import calendar

    from hr.models import Leave

    on = on or date.today()
    month_start = date(on.year, on.month, 1)
    month_end = date(on.year, on.month, calendar.monthrange(on.year, on.month)[1])
    leaves = Leave.objects.filter(
        staff=staff,
        status__in=[Leave.Status.APPROVED, Leave.Status.PENDING],
        start_date__lte=month_end,
        end_date__gte=month_start,
    )
    taken = {t.value: 0 for t in Leave.LeaveType}
    pending = 0
    for lv in leaves:
        days = (min(lv.end_date, month_end) - max(lv.start_date, month_start)).days + 1
        if lv.status == Leave.Status.APPROVED:
            taken[lv.leave_type] = taken.get(lv.leave_type, 0) + days
        else:
            pending += days
    return {"label": month_start.strftime("%B %Y"), "taken": taken, "pending": pending}


def _delete_storage_url(url: str) -> None:
    if not url:
        return
    path = urlparse(url).path
    # MEDIA urls look like /media/<key>; strip the prefix when present.
    marker = "/media/"
    key = path.split(marker, 1)[-1] if marker in path else path.lstrip("/")
    if key and default_storage.exists(key):
        default_storage.delete(key)


@transaction.atomic
def purge_staff_account(*, user, actor) -> None:
    """Remove personal details for a disabled employee while preserving work
    history (tasks, projects, content calendar, chat messages).

    The User row is kept (anonymized) so ForeignKeys that CASCADE on delete
    — notably Task.assignee — do not wipe historical work records.
    """
    from ai.models import Conversation
    from calendar_app.models import ManualReminder
    from daily_tracker.models import DailyTrackerEntry
    from hr.models import EmployeeCollateral, EmployeeRecord, Leave, LeaveBalance, Ticket
    from notifications.models import NotificationEvent, PushSubscription
    from renewals.models import Renewal
    from todos.models import TodoItem

    if user.role != Role.EMPLOYEE:
        raise ValueError("Only employee accounts can be deleted.")
    if user.purged_at is not None:
        raise ValueError("This account has already been deleted.")
    if user.status != UserStatus.DISABLED:
        raise ValueError("Disable the account before deleting it.")
    if actor and actor.pk == user.pk:
        raise ValueError("You cannot delete your own account.")

    # Personal HR documents / leave / tickets — go with the person.
    for collateral in EmployeeCollateral.objects.filter(staff=user):
        _delete_storage_url(collateral.file_url)
        collateral.delete()
    for record in EmployeeRecord.objects.filter(staff=user):
        _delete_storage_url(record.file_url)
        record.delete()
    Leave.objects.filter(staff=user).delete()
    LeaveBalance.objects.filter(staff=user).delete()
    Ticket.objects.filter(raised_by=user).delete()

    # Detach HR letters (keep the document, drop the staff link).
    user.hr_letters.update(staff=None)

    # Staff-subject renewals become anonymous "other" subjects so the reminder
    # row can stay without exposing personal identity.
    original_name = (user.full_name or "").strip()
    former_label = (
        f"Former employee · {original_name}" if original_name else "Former employee"
    )
    for renewal in Renewal.objects.filter(staff=user):
        renewal.subject_type = Renewal.SubjectType.OTHER
        renewal.subject_name = former_label
        renewal.staff = None
        renewal.save(update_fields=["subject_type", "subject_name", "staff", "updated_at"])

    # Personal productivity / AI / calendar owned solely by them.
    TodoItem.objects.filter(owner=user).delete()
    DailyTrackerEntry.objects.filter(user=user).delete()
    ManualReminder.objects.filter(owner=user).delete()
    Conversation.objects.filter(user=user).delete()

    # Access + notification channels.
    ModuleAccess.objects.filter(user=user).delete()
    PushSubscription.objects.filter(user=user).delete()
    NotificationEvent.objects.filter(user=user).delete()

    # Wipe StaffProfile PII + avatar file.
    try:
        profile = user.profile
    except StaffProfile.DoesNotExist:
        profile = None
    if profile:
        _delete_storage_url(profile.avatar_url)
        profile.job_title = ""
        profile.department = ""
        profile.date_joined = None
        profile.phone = ""
        profile.avatar_url = ""
        profile.visa_renewal_date = None
        profile.insurance_renewal_date = None
        profile.iloe_renewal_date = None
        profile.nationality = ""
        profile.emergency_contact_uae = ""
        profile.emergency_contact_relation = ""
        profile.home_country_address = ""
        profile.home_country_number = ""
        profile.save()

    # Anonymize login identity but keep the real name for work history labels.
    # Tasks/projects keep pointing at this pk.
    original_name = (user.full_name or "").strip()
    user.email = f"deleted-{user.pk}-{uuid.uuid4().hex[:8]}@removed.local"
    user.full_name = (
        f"Former employee · {original_name}" if original_name else "Former employee"
    )
    user.status = UserStatus.DISABLED
    user.is_active = False
    user.purged_at = timezone.now()
    user.set_unusable_password()
    user.save(
        update_fields=[
            "email",
            "full_name",
            "status",
            "is_active",
            "purged_at",
            "password",
            "updated_at",
        ]
    )
