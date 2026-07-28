from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import TimeStampedModel


class TodoItem(TimeStampedModel):
    """Personal checklist, unrelated to the shared Tasks/Projects module."""

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="todo_items"
    )
    text = models.CharField(max_length=500)
    done = models.BooleanField(default=False)
    done_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]

    def save(self, *args, **kwargs):
        # Stamp / clear done_at automatically as `done` flips (mirrors Task.completed_at).
        if self.done and self.done_at is None:
            self.done_at = timezone.now()
        elif not self.done:
            self.done_at = None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.text
