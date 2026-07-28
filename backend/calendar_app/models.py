from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class ManualReminder(TimeStampedModel):
    class Visibility(models.TextChoices):
        PRIVATE = "private", "Private"
        COMPANY = "company", "Company-wide"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reminders"
    )
    title = models.CharField(max_length=200)
    remind_at = models.DateTimeField()
    visibility = models.CharField(
        max_length=10, choices=Visibility.choices, default=Visibility.PRIVATE
    )

    class Meta:
        ordering = ["remind_at"]

    def __str__(self):
        return self.title
