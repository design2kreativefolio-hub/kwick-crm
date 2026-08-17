from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import PasswordAccessLogView, PasswordEntryViewSet, VaultPinView, VaultUnlockView

router = DefaultRouter(trailing_slash=False)
router.register("passwords", PasswordEntryViewSet, basename="passwords")

urlpatterns = [
    path("passwords/vault/unlock", VaultUnlockView.as_view()),
    path("passwords/vault/pin", VaultPinView.as_view()),
    path("passwords/access-logs", PasswordAccessLogView.as_view()),
    *router.urls,
]
