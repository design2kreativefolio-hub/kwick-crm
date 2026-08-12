from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class ManualReminder(TimeStampedModel):
    class Visibility(models.TextChoices):
        PRIVATE = "private", "Private"
        COMPANY = "company", "Company-wide"

    class Recurrence(models.TextChoices):
        NONE = "none", "Does not repeat"
        DAILY = "daily", "Daily"
        WEEKLY = "weekly", "Weekly"
        MONTHLY = "monthly", "Monthly"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reminders"
    )
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    meeting_url = models.URLField(max_length=500, blank=True)
    remind_at = models.DateTimeField()
    visibility = models.CharField(
        max_length=10, choices=Visibility.choices, default=Visibility.PRIVATE
    )
    assignees = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="assigned_reminders"
    )
    recurrence = models.CharField(
        max_length=10, choices=Recurrence.choices, default=Recurrence.NONE
    )
    recurrence_end = models.DateField(null=True, blank=True)
    done = models.BooleanField(default=False)
    done_at = models.DateTimeField(null=True, blank=True)
    # Alert bookkeeping so day-of / 1-hour-before notifications fire once per occurrence.
    day_alert_sent = models.BooleanField(default=False)
    hour_alert_sent = models.BooleanField(default=False)

    class Meta:
        ordering = ["remind_at"]

    def save(self, *args, **kwargs):
        from django.utils import timezone

        if self.done and self.done_at is None:
            self.done_at = timezone.now()
        elif not self.done:
            self.done_at = None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title
