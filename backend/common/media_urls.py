"""Helpers for absolute media URLs (avatars, chat attachments, logos)."""

from django.conf import settings


def absolute_media_url(request, storage_url: str) -> str:
    """Turn a storage URL into a browser-reachable absolute URL.

    Prefer PUBLIC_API_URL / NEXT_PUBLIC_API_BASE_URL when set (correct on VPS
    even if the ASGI worker sees an internal host). Otherwise fall back to
    request.build_absolute_uri (works when nginx forwards Host + Proto).
    """
    if not storage_url:
        return ""
    if storage_url.startswith("http://") or storage_url.startswith("https://"):
        return storage_url
    path = storage_url if storage_url.startswith("/") else f"/{storage_url}"
    public = (getattr(settings, "PUBLIC_API_URL", "") or "").rstrip("/")
    if public:
        return f"{public}{path}"
    if request is not None:
        return request.build_absolute_uri(path)
    return path


def user_avatar_url(user) -> str:
    profile = getattr(user, "profile", None)
    if profile is None:
        return ""
    return (getattr(profile, "avatar_url", None) or "").strip()
