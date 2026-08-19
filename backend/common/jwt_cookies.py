"""HttpOnly JWT cookies so the browser never stores tokens in localStorage."""

from __future__ import annotations

from datetime import timedelta

from django.conf import settings

ACCESS_COOKIE = "kwick_access"
REFRESH_COOKIE = "kwick_refresh"


def _secure(request=None) -> bool:
    if request is not None and request.is_secure():
        return True
    return bool(getattr(settings, "SESSION_COOKIE_SECURE", False))


def _cookie_kwargs(request=None) -> dict:
    return {
        "httponly": True,
        "secure": _secure(request),
        "samesite": "Lax",
        "path": "/",
    }


def _access_max_age() -> int:
    lifetime = settings.SIMPLE_JWT.get("ACCESS_TOKEN_LIFETIME") or timedelta(minutes=30)
    return int(lifetime.total_seconds())


def _refresh_max_age() -> int:
    lifetime = settings.SIMPLE_JWT.get("REFRESH_TOKEN_LIFETIME") or timedelta(days=7)
    return int(lifetime.total_seconds())


def set_jwt_cookies(response, *, access: str, refresh: str, request=None):
    kwargs = _cookie_kwargs(request)
    response.set_cookie(ACCESS_COOKIE, access, max_age=_access_max_age(), **kwargs)
    response.set_cookie(REFRESH_COOKIE, refresh, max_age=_refresh_max_age(), **kwargs)
    return response


def clear_jwt_cookies(response):
    kwargs = {"path": "/", "samesite": "Lax"}
    response.delete_cookie(ACCESS_COOKIE, **kwargs)
    response.delete_cookie(REFRESH_COOKIE, **kwargs)
    return response


def attach_auth_cookies(response, request, user=None):
    """Move access/refresh from the JSON body onto HttpOnly cookies."""
    data = response.data if isinstance(response.data, dict) else None
    if data:
        access = data.get("access")
        refresh = data.get("refresh")
        if access and refresh:
            set_jwt_cookies(response, access=access, refresh=refresh, request=request)
        elif access:
            kwargs = _cookie_kwargs(request)
            response.set_cookie(ACCESS_COOKIE, access, max_age=_access_max_age(), **kwargs)
        data.pop("access", None)
        data.pop("refresh", None)
    if user is not None:
        from common.media_auth import set_media_auth_cookie

        set_media_auth_cookie(response, user, request)
    return response


def refresh_token_from_request(request) -> str:
    data = request.data if hasattr(request, "data") else {}
    raw = (data or {}).get("refresh") if isinstance(data, dict) else None
    if raw:
        return str(raw)
    return request.COOKIES.get(REFRESH_COOKIE) or ""
