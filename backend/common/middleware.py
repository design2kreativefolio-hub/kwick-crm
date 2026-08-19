"""HTTP gates: maintenance mode, admin login throttle, media cookie helpers."""
from django.core.cache import cache
from django.http import HttpResponse

from common.maintenance import is_allowlisted, maintenance_enabled, maintenance_response
from common.media_auth import user_from_jwt

_EXEMPT_EXACT = {
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/logout",
}
_EXEMPT_PREFIXES = (
    "/static/",
    "/media/",
    "/admin/login",
)


def _path(request) -> str:
    return (request.path or "/").rstrip("/") or "/"


def _is_exempt(request) -> bool:
    if request.method == "OPTIONS":
        return True
    path = _path(request)
    if path in _EXEMPT_EXACT:
        return True
    if path == "/api/maintenance" and request.method in {"GET", "HEAD"}:
        return True
    return any(path.startswith(prefix.rstrip("/")) for prefix in _EXEMPT_PREFIXES)


def _user_from_jwt(request):
    return user_from_jwt(request)


def _resolve_user(request):
    user = getattr(request, "user", None)
    if user is not None and getattr(user, "is_authenticated", False):
        return user
    return _user_from_jwt(request)


def _client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR") or ""
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or "unknown"


class AdminLoginThrottleMiddleware:
    """Cap Django admin password guesses (8 per minute per IP)."""

    rate = 8
    window = 60

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = (request.path or "").rstrip("/")
        if request.method == "POST" and path.endswith("/admin/login"):
            key = f"throttle:admin-login:{_client_ip(request)}"
            count = cache.get(key) or 0
            if count >= self.rate:
                return HttpResponse(
                    "Too many login attempts. Try again in a minute.",
                    status=429,
                    content_type="text/plain",
                )
            cache.set(key, count + 1, self.window)
        return self.get_response(request)


class MaintenanceMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not maintenance_enabled() or _is_exempt(request):
            return self.get_response(request)
        user = _resolve_user(request)
        if is_allowlisted(user):
            return self.get_response(request)
        return maintenance_response()
