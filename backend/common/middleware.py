"""HTTP gate for maintenance mode. JWT is resolved here because DRF auth
runs later than Django middleware — without this, leftover access tokens
would keep working for everyone else.
"""
from common.maintenance import is_allowlisted, maintenance_enabled, maintenance_response

_EXEMPT_EXACT = {
    "/api/auth/login",
    "/api/auth/refresh",
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
    header = request.META.get("HTTP_AUTHORIZATION") or ""
    if not header.lower().startswith("bearer "):
        return None
    raw = header.split(" ", 1)[1].strip()
    if not raw:
        return None
    try:
        from rest_framework_simplejwt.tokens import AccessToken

        from accounts.models import User

        token = AccessToken(raw)
        return User.objects.filter(pk=token["user_id"]).first()
    except Exception:
        return None


def _resolve_user(request):
    user = getattr(request, "user", None)
    if user is not None and getattr(user, "is_authenticated", False):
        return user
    return _user_from_jwt(request)


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
