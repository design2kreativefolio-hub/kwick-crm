"""
JWT auth for WebSocket connections.

Browsers send the HttpOnly access cookie on the handshake. A ?token= query
param is still accepted for non-browser clients so it is not logged from the
app itself.
"""
from http.cookies import SimpleCookie
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser

from common.jwt_cookies import ACCESS_COOKIE


def _access_token_from_scope(scope) -> str:
    headers = dict(scope.get("headers") or [])
    raw_cookie = headers.get(b"cookie", b"").decode("latin-1")
    if raw_cookie:
        jar = SimpleCookie()
        try:
            jar.load(raw_cookie)
            morsel = jar.get(ACCESS_COOKIE)
            if morsel and morsel.value:
                return morsel.value
        except Exception:
            pass
    query = parse_qs(scope.get("query_string", b"").decode())
    return (query.get("token") or [""])[0] or ""


@database_sync_to_async
def _get_user(token: str):
    from django.db import close_old_connections
    from rest_framework_simplejwt.exceptions import TokenError
    from rest_framework_simplejwt.tokens import AccessToken

    from accounts.models import User

    close_old_connections()
    try:
        access = AccessToken(token)
        user = User.objects.get(pk=access["user_id"])
        if not user.can_login:
            return AnonymousUser()
        return user
    except (TokenError, KeyError, User.DoesNotExist):
        return AnonymousUser()
    finally:
        close_old_connections()


@database_sync_to_async
def _blocked_by_maintenance(user):
    from common.maintenance import is_blocked_by_maintenance

    return is_blocked_by_maintenance(user)


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        token = _access_token_from_scope(scope)
        scope["user"] = await _get_user(token) if token else AnonymousUser()
        if await _blocked_by_maintenance(scope["user"]):
            await send({"type": "websocket.close", "code": 4403})
            return
        return await super().__call__(scope, receive, send)
