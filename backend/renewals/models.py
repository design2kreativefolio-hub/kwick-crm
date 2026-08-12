from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class Renewal(TimeStampedModel):
    class SubjectType(models.TextChoices):
        CLIENT = "client", "Client"
        STAFF = "staff", "Staff"
        OTHER = "other", "Other"

    class RenewalType(models.TextChoices):
        HOSTING = "hosting", "Hosting"
        DOMAIN = "domain", "Domain"
        CONTRACT = "contract", "Contract"
        VISA = "visa", "Visa"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        UPCOMING = "upcoming", "Upcoming"
        RENEWED = "renewed", "Renewed"
        OVERDUE = "overdue", "Overdue"

    subject_type = models.CharField(max_length=10, choices=SubjectType.choices)
    client = models.ForeignKey(
        "sales.Client", on_delete=models.CASCADE, null=True, blank=True, related_name="renewals"
    )
    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="renewals",
    )
    # Free-text subject when subject_type == other (e.g. vendor, office lease).
    subject_name = models.CharField(max_length=200, blank=True, default="")
    renewal_type = models.CharField(max_length=20, choices=RenewalType.choices)
    # Free-text type label when renewal_type == other.
    renewal_type_detail = models.CharField(max_length=120, blank=True, default="")
    due_date = models.DateField()
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.UPCOMING)
    # Track which lead windows we've already pushed for, so we don't re-notify.
    last_notified_window = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["due_date"]

    def __str__(self):
        return f"{self.subject_type} {self.renewal_type} due {self.due_date}"

    def display_subject(self) -> str:
        if self.subject_type == self.SubjectType.CLIENT and self.client_id:
            return self.client.name
        if self.subject_type == self.SubjectType.STAFF and self.staff_id:
            return self.staff.full_name or self.staff.email or "Staff"
        return (self.subject_name or "").strip() or "Other"

    def display_type(self) -> str:
        if self.renewal_type == self.RenewalType.OTHER:
            detail = (self.renewal_type_detail or "").strip()
            return detail or "Other"
        return self.get_renewal_type_display()
