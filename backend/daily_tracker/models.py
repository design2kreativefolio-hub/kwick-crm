from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class DailyTrackerEntry(TimeStampedModel):
    """
    Lightweight, ad-hoc task log — intentionally minimal (spec §9):
    no project link, no status field.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="daily_entries"
    )
    task_name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    date = models.DateField()

    def __str__(self):
        return f"{self.task_name} ({self.date})"


class TimeLog(TimeStampedModel):
    """One start→stop work session from the dashboard Time Tracker.
    `ended_at` is null while the timer is running (at most one per user)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="time_logs"
    )
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-started_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user"], condition=models.Q(ended_at__isnull=True), name="one_running_timer_per_user"
            )
        ]

    def __str__(self):
        return f"{self.user_id} {self.started_at:%Y-%m-%d %H:%M}"
