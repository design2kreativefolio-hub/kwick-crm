"""Who may read a stored /media/ object. Anonymous internet users never can."""

from __future__ import annotations

from common.permissions import has_module_access, is_superadmin


def user_can_read_media(user, key: str) -> bool:
    """True if this logged-in user may fetch `key`. False for anyone else."""
    if not user or not getattr(user, "can_login", False):
        return False
    if is_superadmin(user):
        return True

    parts = [p for p in (key or "").split("/") if p]
    prefix = parts[0] if parts else ""

    if prefix in {"avatars", "client-logos"}:
        return True

    if prefix == "chat_attachments":
        return _chat_participant(user, _int_part(parts, 1))

    if prefix in {
        "client-files",
        "proposal-assets",
        "proposal-exports",
        "invoice-exports",
        "estimate-exports",
    }:
        return has_module_access(user, "sales")

    if prefix in {"collaterals", "employee-records"}:
        staff_id = _int_part(parts, 1)
        if staff_id and staff_id == getattr(user, "pk", None):
            return True
        return has_module_access(user, "hr")

    if prefix == "hr-letters":
        return _hr_letter_access(user, _int_part(parts, 1))

    if prefix == "report-exports":
        return has_module_access(user, "reports")

    # Projects, content calendar, and anything else internal staff use.
    return True


def _int_part(parts: list[str], index: int) -> int | None:
    if index >= len(parts):
        return None
    try:
        return int(parts[index])
    except (TypeError, ValueError):
        return None


def _chat_participant(user, conversation_id: int | None) -> bool:
    if not conversation_id:
        return False
    from messaging.models import Conversation

    return Conversation.objects.filter(pk=conversation_id, participants=user).exists()


def _hr_letter_access(user, letter_id: int | None) -> bool:
    if has_module_access(user, "hr"):
        return True
    if not letter_id:
        return False
    from hr.models import HrLetter

    return HrLetter.objects.filter(pk=letter_id, staff_id=user.pk).exists()
