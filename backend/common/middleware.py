"""HTTP gates: maintenance mode, and a /media/ auth cookie for <img> tags."""
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
