from django.conf import settings
from django.db import models

from common.models import TimeStampedModel


class Conversation(TimeStampedModel):
    participants = models.ManyToManyField(
        settings.AUTH_USER_MODEL, related_name="conversations"
    )
    is_group = models.BooleanField(default=False)
    # Only used for group chats — 1:1 threads derive their display name from
    # `other_participant` in the serializer instead.
    name = models.CharField(max_length=120, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="created_conversations",
    )

    def __str__(self):
        return self.name or f"Conversation #{self.pk}"


class Message(TimeStampedModel):
    class AttachmentType(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        DOCUMENT = "document", "Document"

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="sent_messages"
    )
    body = models.TextField(blank=True)
    # Centered WhatsApp-style notices ("X added Y") — not a normal chat bubble.
    is_system = models.BooleanField(default=False)
    attachment_url = models.URLField(max_length=500, blank=True)
    attachment_type = models.CharField(
        max_length=10, choices=AttachmentType.choices, blank=True
    )
    attachment_name = models.CharField(max_length=255, blank=True)
    read_by = models.ManyToManyField(
        settings.AUTH_USER_MODEL, blank=True, related_name="read_messages"
    )

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"Msg<{self.sender_id}>: {self.body[:30]}"
