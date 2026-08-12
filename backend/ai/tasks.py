"""Purge EDITH chats older than 15 days."""

from datetime import timedelta

from celery import shared_task
from django.utils import timezone


@shared_task
def purge_old_ai_conversations():
    from .models import Conversation

    cutoff = timezone.now() - timedelta(days=15)
    deleted, _ = Conversation.objects.filter(updated_at__lt=cutoff).delete()
    return {"deleted": deleted}
