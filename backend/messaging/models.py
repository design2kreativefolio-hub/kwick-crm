from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class Conversation(TimeStampedModel):
    participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="conversations"
    )

    def __str__(self):
        return f"Conversation #{self.pk}"


class Message(TimeStampedModel):
    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_messages"
    )
    body = models.TextField()
    read_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="read_messages"
    )

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Msg<{self.sender_id}>: {self.body[:30]}"
