from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class Conversation(TimeStampedModel):
    """One EDITH chat thread per user. Purged after 15 days of inactivity."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ai_conversations",
    )
    title = models.CharField(max_length=160, blank=True, default="New chat")

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"{self.title} ({self.user_id})"


class Message(TimeStampedModel):
    class Role(models.TextChoices):
        USER = "user", "User"
        ASSISTANT = "assistant", "Assistant"

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    role = models.CharField(max_length=16, choices=Role.choices)
    content = models.TextField(blank=True, default="")
    links = models.JSONField(default=list, blank=True)
    # [{ "mime": "image/jpeg", "url": "data:image/jpeg;base64,..." }] — small previews only
    attachments = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.role}: {(self.content or '')[:40]}"
