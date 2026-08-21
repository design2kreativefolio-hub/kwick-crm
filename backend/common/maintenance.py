"""Maintenance mode + developer system accounts.

Turn maintenance on/off from the app (allowlisted user), Django admin, or:

    python manage.py maintenance on|off|status

MAINTENANCE_ALLOW_EMAIL must be set. If it is empty, maintenance cannot
engage — that avoids locking everyone out with no key.

Those same allowlisted emails are treated as system/developer accounts and
are hidden from Chat directory, Staff, assignee pickers, and people lists —
while retaining full app access when signed in.
"""
from django.conf import settings
from django.http import JsonResponse
from rest_framework.exceptions import APIException

MAINTENANCE_MESSAGE = (
    "Kwick is under maintenance. Only the developer account can sign in right now."
)
class SiteInMaintenance(APIException):
    status_code = 503
    default_detail = MAINTENANCE_MESSAGE
    default_code = "maintenance"


def allowlist_emails() -> set[str]:
    raw = getattr(settings, "MAINTENANCE_ALLOW_EMAILS", None)
    if raw is None:
        raw = []
    return {item.strip().lower() for item in raw if item and item.strip()}


def is_allowlisted(user) -> bool:
    if not user or not getattr(user, "is_authenticated", False):
        return False
    email = (getattr(user, "email", None) or "").strip().lower()
    return bool(email) and email in allowlist_emails()


def is_system_account(user) -> bool:
    """Developer / maintenance allowlisted accounts — hidden from people pickers."""
    return is_allowlisted(user)


def exclude_system_accounts(qs):
    """Drop allowlisted developer emails from colleague / staff / assignee lists."""
    emails = allowlist_emails()
    if not emails:
        return qs
    return qs.exclude(email__in=emails)


def reject_system_user_ids(user_ids) -> list[int]:
    """Filter out system-account PKs from an id list (for chat/group adds)."""
    from accounts.models import User

    emails = allowlist_emails()
    if not emails or not user_ids:
        return list(user_ids or [])
    blocked = set(
        User.objects.filter(pk__in=list(user_ids), email__in=emails).values_list("id", flat=True)
    )
    return [int(uid) for uid in user_ids if int(uid) not in blocked]


_MAINT_CACHE_KEY = "kwick:maintenance_on"


def get_site_config():
    from common.models import SiteConfig

    obj, _ = SiteConfig.objects.get_or_create(
        pk=1,
        defaults={"maintenance_mode": bool(getattr(settings, "MAINTENANCE_MODE", False))},
    )
    return obj


def maintenance_enabled() -> bool:
    if not allowlist_emails():
        return False
    from django.core.cache import cache

    cached = cache.get(_MAINT_CACHE_KEY)
    if cached is not None:
        return bool(cached)
    try:
        on = bool(get_site_config().maintenance_mode)
    except Exception:
        on = bool(getattr(settings, "MAINTENANCE_MODE", False))
    cache.set(_MAINT_CACHE_KEY, on, 5)
    return on


def set_maintenance_enabled(on: bool) -> bool:
    if on and not allowlist_emails():
        raise ValueError(
            "Set MAINTENANCE_ALLOW_EMAIL to the developer account before turning maintenance on."
        )
    cfg = get_site_config()
    cfg.maintenance_mode = bool(on)
    cfg.save(update_fields=["maintenance_mode", "updated_at"])
    from django.core.cache import cache

    cache.set(_MAINT_CACHE_KEY, bool(on), 5)
    return cfg.maintenance_mode


def is_blocked_by_maintenance(user) -> bool:
    if not maintenance_enabled():
        return False
    return not is_allowlisted(user)


def maintenance_payload() -> dict:
    return {"detail": MAINTENANCE_MESSAGE, "code": "maintenance"}


def maintenance_response() -> JsonResponse:
    return JsonResponse(maintenance_payload(), status=503)
