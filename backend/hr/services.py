"""HR domain helpers."""

from __future__ import annotations

import uuid
from urllib.parse import urlparse

from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone

from accounts.models import ModuleAccess, Role, StaffProfile, UserStatus


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
    former_label = (user.full_name or "").strip() or "Former employee"
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

    # Anonymize login identity. Tasks/projects keep pointing at this pk.
    user.email = f"deleted-{user.pk}-{uuid.uuid4().hex[:8]}@removed.local"
    user.full_name = "Former employee"
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
