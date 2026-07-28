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
