"""JWT auth that also reads the HttpOnly access cookie."""

from urllib.parse import urlparse

from django.conf import settings
from rest_framework.exceptions import PermissionDenied
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken

from common.jwt_cookies import ACCESS_COOKIE


_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _origin_of(value: str) -> str:
    parsed = urlparse(value or "")
    return f"{parsed.scheme}://{parsed.netloc}".lower() if parsed.scheme and parsed.netloc else ""


def enforce_trusted_origin(request):
    """CSRF defence for cookie-authenticated writes: the browser always sends
    Origin (or Referer) on these, and it must be one of our own frontends."""
    if request.method in _SAFE_METHODS:
        return
    origin = _origin_of(request.META.get("HTTP_ORIGIN", "")) or _origin_of(request.META.get("HTTP_REFERER", ""))
    allowed = {o.lower().rstrip("/") for o in getattr(settings, "CORS_ALLOWED_ORIGINS", [])}
    allowed |= {o.lower().rstrip("/") for o in getattr(settings, "CSRF_TRUSTED_ORIGINS", [])}
    if not origin or origin not in allowed:
        raise PermissionDenied("Cross-site request blocked.")


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            return super().authenticate(request)
        raw = request.COOKIES.get(ACCESS_COOKIE)
        if not raw:
            return None
        try:
            validated = self.get_validated_token(raw)
            user = self.get_user(validated)
        except InvalidToken:
            return None
        enforce_trusted_origin(request)
        return user, validated

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if not getattr(user, "can_login", False):
            raise AuthenticationFailed("Account is not active.")
        return user
