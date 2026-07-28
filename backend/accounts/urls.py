from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ApproveUserView,
    InviteCodeCreateView,
    LoginView,
    MeView,
    RegisterView,
    SetPasswordView,
    VerifyInviteView,
)

urlpatterns = [
    path("register", RegisterView.as_view(), name="auth-register"),
    path("verify-invite", VerifyInviteView.as_view(), name="auth-verify-invite"),
    path("login", LoginView.as_view(), name="auth-login"),
    path("refresh", TokenRefreshView.as_view(), name="auth-refresh"),
    path("me", MeView.as_view(), name="auth-me"),
    path("invite-codes", InviteCodeCreateView.as_view(), name="auth-invite-codes"),
    path("approve/<int:user_id>", ApproveUserView.as_view(), name="auth-approve"),
    path("set-password", SetPasswordView.as_view(), name="auth-set-password"),
]
