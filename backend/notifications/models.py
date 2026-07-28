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
