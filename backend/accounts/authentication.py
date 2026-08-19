"""JWT auth that also reads the HttpOnly access cookie."""

from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import AuthenticationFailed, InvalidToken

from common.jwt_cookies import ACCESS_COOKIE


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
            return self.get_user(validated), validated
        except InvalidToken:
            return None

    def get_user(self, validated_token):
        user = super().get_user(validated_token)
        if not getattr(user, "can_login", False):
            raise AuthenticationFailed("Account is not active.")
        return user
