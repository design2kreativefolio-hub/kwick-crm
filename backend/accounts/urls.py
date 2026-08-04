from django.urls import path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    ApproveUserView,
    AvatarUploadView,
    ChangePasswordView,
    EmployeeListView,
    ForgotPasswordView,
    LoginView,
    MeView,
    ModuleAccessViewSet,
    RegisterView,
    RejectUserView,
    SetPasswordView,
)

router = DefaultRouter(trailing_slash=False)
router.register("module-access", ModuleAccessViewSet, basename="module-access")

urlpatterns = [
    path("register", RegisterView.as_view(), name="auth-register"),
    path("login", LoginView.as_view(), name="auth-login"),
    path("refresh", TokenRefreshView.as_view(), name="auth-refresh"),
    path("me", MeView.as_view(), name="auth-me"),
    path("me/password", ChangePasswordView.as_view(), name="auth-change-password"),
    path("me/avatar", AvatarUploadView.as_view(), name="auth-avatar"),
    path("employees", EmployeeListView.as_view(), name="auth-employees"),
    path("approve/<int:user_id>", ApproveUserView.as_view(), name="auth-approve"),
    path("reject/<int:user_id>", RejectUserView.as_view(), name="auth-reject"),
    path("forgot-password", ForgotPasswordView.as_view(), name="auth-forgot-password"),
    path("set-password", SetPasswordView.as_view(), name="auth-set-password"),
]
urlpatterns += router.urls
