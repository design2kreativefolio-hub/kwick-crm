"""Shared cross-app helpers (spec follow-up: manager activity log)."""


def log_activity(*, actor, action: str) -> None:
    """Record one line in the manager-visible activity log. Synchronous —
    this is a single small DB write, no need for Celery here."""
    from .models import ActivityLog

    ActivityLog.objects.create(actor=actor, action=action)
