"""Short-lived HttpOnly cookie so <img src> / window.open can load /media/."""

from __future__ import annotations

from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner

COOKIE_NAME = "kwick_media"
COOKIE_PATH = "/media/"
SIGNING_SALT = "kwick.media-auth"


def _max_age() -> int:
    return int(getattr(settings, "MEDIA_AUTH_MAX_AGE", 12 * 60 * 60))


def _signer() -> TimestampSigner:
    return TimestampSigner(salt=SIGNING_SALT)


def set_media_auth_cookie(response, user, request=None):
    if not user or not getattr(user, "can_login", False):
        return response
    secure = bool(getattr(settings, "SESSION_COOKIE_SECURE", False))
    if request is not None and request.is_secure():
        secure = True
    response.set_cookie(
        COOKIE_NAME,
        _signer().sign(str(user.pk)),
        max_age=_max_age(),
        httponly=True,
        secure=secure,
        samesite="Lax",
        path=COOKIE_PATH,
    )
    return response


def clear_media_auth_cookie(response):
    response.delete_cookie(COOKIE_NAME, path=COOKIE_PATH, samesite="Lax")
    return response


def user_from_jwt(request):
    raw = ""
    header = request.META.get("HTTP_AUTHORIZATION") or ""
    if header.lower().startswith("bearer "):
        raw = header.split(" ", 1)[1].strip()
    if not raw:
        from common.jwt_cookies import ACCESS_COOKIE

        raw = request.COOKIES.get(ACCESS_COOKIE) or ""
    if not raw:
        return None
    try:
        from rest_framework_simplejwt.tokens import AccessToken

        from accounts.models import User

        token = AccessToken(raw)
        user = User.objects.filter(pk=token["user_id"]).first()
        if user is not None and not getattr(user, "can_login", False):
            return None
        return user
    except Exception:
        return None


def user_from_media_cookie(request):
    raw = request.COOKIES.get(COOKIE_NAME)
    if not raw:
        return None
    try:
        from accounts.models import User

        user_id = _signer().unsign(raw, max_age=_max_age())
        return User.objects.filter(pk=int(user_id)).first()
    except (BadSignature, SignatureExpired, ValueError, TypeError):
        return None


def media_user(request):
    """Active user allowed to fetch /media/, or None."""
    for candidate in (user_from_media_cookie(request), user_from_jwt(request)):
        if candidate is not None and getattr(candidate, "can_login", False):
            return candidate
    return None
