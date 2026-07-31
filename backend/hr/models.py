from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class EmployeeCollateral(TimeStampedModel):
    class DocType(models.TextChoices):
        EXPERIENCE_LETTER = "experience_letter", "Experience letter"
        RELIEVING_LETTER = "relieving_letter", "Relieving letter"
        SALARY_CERTIFICATE = "salary_certificate", "Salary certificate"

    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="collaterals"
    )
    category = models.CharField(max_length=60, default="Employee Collaterals")
    doc_type = models.CharField(max_length=30, choices=DocType.choices)
    file_url = models.URLField(blank=True)
    generated_at = models.DateTimeField(null=True, blank=True)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="generated_collaterals",
    )

    def __str__(self):
        return f"{self.get_doc_type_display()} for {self.staff_id}"


class Leave(TimeStampedModel):
    class LeaveType(models.TextChoices):
        ANNUAL = "annual", "Annual"
        SICK = "sick", "Sick"
        UNPAID = "unpaid", "Unpaid"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="leaves"
    )
    leave_type = models.CharField(max_length=20, choices=LeaveType.choices)
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    reason = models.TextField(blank=True)

    @property
    def days(self) -> int:
        return (self.end_date - self.start_date).days + 1

    def __str__(self):
        return f"{self.leave_type} {self.start_date}→{self.end_date} ({self.status})"


class LeaveBalance(TimeStampedModel):
    """UAE default: 30 paid days/year (spec §5.4)."""

    staff = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="leave_balances"
    )
    year = models.PositiveIntegerField()
    annual_allowance = models.PositiveIntegerField(
        default=settings.LEAVE_ANNUAL_ALLOWANCE_DEFAULT
    )
    used = models.PositiveIntegerField(default=0)
    pending = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("staff", "year")
        ordering = ["-year"]

    @property
    def remaining(self) -> int:
        return self.annual_allowance - self.used - self.pending

    def __str__(self):
        return f"Balance {self.staff_id} {self.year}: {self.remaining} left"


class Ticket(TimeStampedModel):
    class Urgency(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED = "resolved", "Resolved"

    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tickets"
    )
    date = models.DateField()
    description = models.TextField()
    urgency = models.CharField(max_length=10, choices=Urgency.choices, default=Urgency.MEDIUM)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)

    def __str__(self):
        return f"Ticket #{self.pk} ({self.urgency}/{self.status})"
