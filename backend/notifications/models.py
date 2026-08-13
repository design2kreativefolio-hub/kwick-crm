from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class PushSubscription(TimeStampedModel):
    """Browser web-push subscription (spec §13)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions"
    )
    endpoint = models.URLField(max_length=500, unique=True)
    keys = models.JSONField(default=dict)  # {"p256dh": ..., "auth": ...}

    def __str__(self):
        return f"PushSub<{self.user_id}>"


class NotificationEvent(TimeStampedModel):
    class Source(models.TextChoices):
        RENEWAL = "renewal", "Renewal"
        CALENDAR = "calendar", "Calendar"
        TASK = "task", "Task"
        LEAVE_REQUEST = "leave_request", "Leave request"
        TICKET = "ticket", "Ticket"
        DOCUMENT = "document", "Document"
        STAFF_RENEWAL = "staff_renewal", "Staff Renewal"
        REGISTRATION = "registration", "Registration"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    source = models.CharField(max_length=20, choices=Source.choices)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    # recurring-until-actioned (leave requests / tickets, spec §13)
    recurring = models.BooleanField(default=False)
    last_sent_at = models.DateTimeField(null=True, blank=True)
    # opaque handle used to stop a recurring reminder once actioned, e.g. "leave:12"
    object_ref = models.CharField(max_length=120, blank=True, db_index=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.source}: {self.title}"


class DashboardCardDismiss(TimeStampedModel):
    """Hide an item from the dashboard Reminders card without marking it done/read.

    Reminders page / calendar / todo keep their own status (read_at / done).
    Daily nudges clear these rows so open items surface again.
    """

    class Kind(models.TextChoices):
        NOTIFICATION = "notification", "Notification"
        REMINDER = "reminder", "Calendar reminder"
        TODO = "todo", "To-do"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="dashboard_card_dismissals",
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    object_id = models.PositiveIntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["user", "kind", "object_id"],
                name="uniq_dashboard_card_dismiss",
            )
        ]
        indexes = [
            models.Index(fields=["user", "kind"]),
        ]

    def __str__(self):
        return f"{self.kind}:{self.object_id} → user {self.user_id}"
