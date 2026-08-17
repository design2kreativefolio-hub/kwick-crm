"""
JWT auth for WebSocket connections. The browser can't set an Authorization
header on a WebSocket, so the access token is passed as ?token=… and resolved
to a user here (spec §12: Channels consumer auth).
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async
from channels.middleware import BaseMiddleware
from django.contrib.auth.models import AnonymousUser


@database_sync_to_async
def _get_user(token: str):
    from rest_framework_simplejwt.exceptions import TokenError
    from rest_framework_simplejwt.tokens import AccessToken

    from accounts.models import User

    try:
        access = AccessToken(token)
        return User.objects.get(pk=access["user_id"])
    except (TokenError, KeyError, User.DoesNotExist):
        return AnonymousUser()


@database_sync_to_async
def _blocked_by_maintenance(user):
    from common.maintenance import is_blocked_by_maintenance

    return is_blocked_by_maintenance(user)


class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        query = parse_qs(scope.get("query_string", b"").decode())
        token = (query.get("token") or [None])[0]
        scope["user"] = await _get_user(token) if token else AnonymousUser()
        if await _blocked_by_maintenance(scope["user"]):
            await send({"type": "websocket.close", "code": 4403})
            return
        return await super().__call__(scope, receive, send)
