from rest_framework import status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from common.maintenance import (
    SiteInMaintenance,
    allowlist_emails,
    is_allowlisted,
    is_blocked_by_maintenance,
    maintenance_enabled,
    set_maintenance_enabled,
)
from common.permissions import IsActive, IsSuperadmin
from common.services import log_activity
from notifications.services import refresh_daily_reminder, stop_recurring_reminder

from .models import ModuleAccess, Role, User, UserStatus
from .serializers import (
    AvatarUploadSerializer,
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    KwickTokenObtainPairSerializer,
    ModuleAccessSerializer,
    RegisterSerializer,
    SetPasswordSerializer,
    UpdateProfileSerializer,
    UserSerializer,
)
from .tasks import dispatch_email_task, send_approval_email


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        name = user.full_name or user.email
        refresh_daily_reminder(
            source="registration",
            title="New signup awaiting approval",
            body=f"{name} ({user.email}) registered and is waiting for approval.",
            object_ref=f"registration:{user.id}",
        )
        return Response(
            {
                "id": user.id,
                "email": user.email,
                "role": user.role,
                "status": user.status,
                "detail": "Registered. Awaiting approval.",
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    serializer_class = KwickTokenObtainPairSerializer


class KwickTokenRefreshView(TokenRefreshView):
    """Reject leftover refresh tokens while maintenance is on."""

    def post(self, request, *args, **kwargs):
        if maintenance_enabled():
            from rest_framework_simplejwt.exceptions import TokenError
            from rest_framework_simplejwt.tokens import RefreshToken

            raw = (request.data or {}).get("refresh")
            if raw:
                try:
                    token = RefreshToken(raw)
                    user = User.objects.filter(pk=token["user_id"]).first()
                    if is_blocked_by_maintenance(user):
                        raise SiteInMaintenance()
                except TokenError:
                    pass
        return super().post(request, *args, **kwargs)


class MaintenanceView(APIView):
    """GET is public (login page banner). POST is the allowlisted developer."""

    permission_classes = [AllowAny]

    def get(self, request):
        user = request.user if request.user and request.user.is_authenticated else None
        return Response(
            {
                "enabled": maintenance_enabled(),
                "can_bypass": is_allowlisted(user) if user else False,
                "allowlist_configured": bool(allowlist_emails()),
            }
        )

    def post(self, request):
        user = request.user
        if not user or not user.is_authenticated or not is_allowlisted(user):
            return Response(
                {"detail": "Only the developer account can change maintenance mode."},
                status=status.HTTP_403_FORBIDDEN,
            )
        enabled = request.data.get("enabled")
        if enabled is None:
            return Response({"detail": "Send {\"enabled\": true|false}."}, status=400)
        try:
            on = set_maintenance_enabled(bool(enabled))
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        log_activity(
            actor=user,
            action=f"{'enabled' if on else 'disabled'} maintenance mode",
        )
        return Response(
            {
                "enabled": on,
                "can_bypass": True,
                "allowlist_configured": bool(allowlist_emails()),
            }
        )


class MeView(APIView):
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        serializer = UpdateProfileSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [IsActive]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password changed."})


class AvatarUploadView(APIView):
    permission_classes = [IsActive]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        serializer = AvatarUploadSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        avatar_url = serializer.save()
        return Response({"avatar_url": avatar_url})

    def delete(self, request):
        from urllib.parse import urlparse

        from django.core.files.storage import default_storage

        from .models import StaffProfile

        try:
            profile = request.user.profile
        except StaffProfile.DoesNotExist:
            return Response({"avatar_url": ""})

        url = profile.avatar_url or ""
        if url:
            path = urlparse(url).path
            marker = "/media/"
            key = path.split(marker, 1)[-1] if marker in path else path.lstrip("/")
            # Drop query string leftovers from cache-bust params if any leaked into path.
            key = key.split("?", 1)[0]
            if key and default_storage.exists(key):
                default_storage.delete(key)

        profile.avatar_url = ""
        profile.save(update_fields=["avatar_url", "updated_at"])
        return Response({"avatar_url": ""})


class ApproveUserView(APIView):
    permission_classes = [IsSuperadmin]

    def post(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        user.status = UserStatus.ACTIVE
        user.save(update_fields=["status", "updated_at"])
        stop_recurring_reminder(object_ref=f"registration:{user.id}")
        # Approval email is email-only (no push) per spec §4. Self-registered
        # employees already have a password and just get notified; employees
        # added via HR (no password yet) get a set-password link instead.
        dispatch_email_task(send_approval_email, user.id)
        return Response({"id": user.id, "status": user.status})


class RejectUserView(APIView):
    """Superadmin declines a self-registered signup still awaiting approval.
    There's nothing worth keeping for a request that was never active, so
    this removes the account outright rather than adding a new status value."""

    permission_classes = [IsSuperadmin]

    def post(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id, status=UserStatus.AWAITING_APPROVAL)
        except User.DoesNotExist:
            return Response(
                {"detail": "User not found or not awaiting approval."},
                status=status.HTTP_404_NOT_FOUND,
            )
        stop_recurring_reminder(object_ref=f"registration:{user.id}")
        user.delete()
        return Response({"detail": "Registration rejected."})


class EmployeeListView(APIView):
    """GET /api/auth/employees — superadmin-only lightweight list of active
    employees, used to populate the 'grant module access' picker on the
    HR/Sales/Renewals/Reports pages."""

    permission_classes = [IsSuperadmin]

    def get(self, request):
        employees = User.objects.filter(
            role=Role.EMPLOYEE, status=UserStatus.ACTIVE, purged_at__isnull=True
        ).order_by("full_name")
        return Response(
            [
                {"id": e.id, "full_name": e.full_name, "email": e.email}
                for e in employees
            ]
        )


class ModuleAccessViewSet(viewsets.ModelViewSet):
    """Superadmin grants/revokes an employee's access to a normally
    superadmin-only module (HR, Sales, Renewals, Reports) — the replacement
    for the old blanket manager role."""

    queryset = ModuleAccess.objects.select_related("user").all()
    serializer_class = ModuleAccessSerializer
    permission_classes = [IsSuperadmin]
    filterset_fields = ["module", "user"]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def perform_create(self, serializer):
        access = serializer.save(granted_by=self.request.user)
        log_activity(
            actor=self.request.user,
            action=f"gave {access.user.full_name or access.user.email} access to {access.get_module_display()}",
        )

    def perform_destroy(self, instance):
        log_activity(
            actor=self.request.user,
            action=f"removed {instance.user.full_name or instance.user.email}'s access to {instance.get_module_display()}",
        )
        instance.delete()


class ForgotPasswordView(APIView):
    """Public: 'forgot my password' request from the login page."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "A password reset link has been sent to your email."})


class SetPasswordView(APIView):
    """Public: employee sets their password via the link from the approval email."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password set. You can now log in."})
