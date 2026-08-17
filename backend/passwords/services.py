"""Vault PIN, unlock sessions, and audit logging."""
from __future__ import annotations

from django.contrib.auth.hashers import check_password, make_password
from django.core.cache import cache

from .models import PasswordAccessLog, PasswordEntry, VaultSettings

VAULT_UNLOCK_TTL = 30 * 60
MAX_PIN_ATTEMPTS = 5
PIN_LOCKOUT_TTL = 15 * 60


def _unlock_key(user_id: int) -> str:
    return f"vault_unlock:{user_id}"


def _fail_key(user_id: int) -> str:
    return f"vault_pin_fails:{user_id}"


def _lock_key(user_id: int) -> str:
    return f"vault_locked:{user_id}"


def is_vault_unlocked(user) -> bool:
    return cache.get(_unlock_key(user.id)) is True


def vault_unlock_ttl(user) -> int:
    key = _unlock_key(user.id)
    if not cache.get(key):
        return 0
    return cache.ttl(key) if hasattr(cache, "ttl") else VAULT_UNLOCK_TTL


def set_vault_unlocked(user) -> None:
    cache.set(_unlock_key(user.id), True, VAULT_UNLOCK_TTL)


def clear_vault_unlock(user) -> None:
    cache.delete(_unlock_key(user.id))


def verify_pin(user, pin: str) -> tuple[bool, str]:
    if cache.get(_lock_key(user.id)):
        return False, "Too many incorrect attempts. Try again in 15 minutes."

    pin = (pin or "").strip()
    if not pin.isdigit() or len(pin) != 4:
        return False, "Enter the 4-digit vault PIN."

    settings_row = VaultSettings.get_solo()
    if check_password(pin, settings_row.pin_hash):
        cache.delete(_fail_key(user.id))
        cache.delete(_lock_key(user.id))
        set_vault_unlocked(user)
        return True, ""

    fails = int(cache.get(_fail_key(user.id), 0)) + 1
    cache.set(_fail_key(user.id), fails, PIN_LOCKOUT_TTL)
    if fails >= MAX_PIN_ATTEMPTS:
        cache.set(_lock_key(user.id), True, PIN_LOCKOUT_TTL)
        return False, "Too many incorrect attempts. Try again in 15 minutes."
    return False, "Incorrect PIN."


def change_vault_pin(*, actor, current_pin: str, new_pin: str) -> tuple[bool, str]:
    new_pin = (new_pin or "").strip()
    if not new_pin.isdigit() or len(new_pin) != 4:
        return False, "New PIN must be exactly 4 digits."

    settings_row = VaultSettings.get_solo()
    if not check_password((current_pin or "").strip(), settings_row.pin_hash):
        return False, "Current PIN is incorrect."

    settings_row.pin_hash = make_password(new_pin)
    settings_row.updated_by = actor
    settings_row.save(update_fields=["pin_hash", "updated_by", "updated_at"])
    log_password_access(
        user=actor,
        action=PasswordAccessLog.Action.PIN_CHANGED,
        detail="Vault PIN updated",
    )
    return True, ""


def log_password_access(
    *,
    user,
    action: str,
    entry: PasswordEntry | None = None,
    detail: str = "",
) -> None:
    client_label = ""
    platform = ""
    if entry is not None:
        client_label = entry.display_client()
        platform = entry.platform
    PasswordAccessLog.objects.create(
        user=user,
        action=action,
        entry=entry,
        client_label=client_label,
        platform=platform,
        detail=detail[:300],
    )


def access_log_message(log: PasswordAccessLog) -> str:
    who = (log.user.full_name or log.user.email) if log.user_id and log.user else "Unknown"
    parts = [who, log.get_action_display()]
    if log.client_label:
        parts.append(f"— {log.client_label}")
    if log.platform:
        parts.append(f"({log.platform})")
    if log.detail:
        parts.append(f"· {log.detail}")
    return " ".join(parts)
