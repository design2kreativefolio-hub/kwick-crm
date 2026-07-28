import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

# Initialise Django's ASGI application early so apps are loaded before importing
# anything that touches the ORM (Channels auth middleware, consumers).
django_asgi_app = get_asgi_application()

from channels.auth import AuthMiddlewareStack  # noqa: E402
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402

from messaging.middleware import JWTAuthMiddleware  # noqa: E402
import messaging.routing  # noqa: E402
import notifications.routing  # noqa: E402

websocket_urlpatterns = (
    messaging.routing.websocket_urlpatterns + notifications.routing.websocket_urlpatterns
)

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": JWTAuthMiddleware(URLRouter(websocket_urlpatterns)),
    }
)
