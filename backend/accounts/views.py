from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from common.permissions import IsActive, IsManager

from .models import User, UserStatus
from .serializers import (
    AvatarUploadSerializer,
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    InviteCodeCreateSerializer,
    KwickTokenObtainPairSerializer,
    RegisterSerializer,
    SetPasswordSerializer,
    UpdateProfileSerializer,
    UserSerializer,
    VerifyInviteSerializer,
)
from .tasks import send_approval_email


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "id": user.id,
                "email": user.email,
                "role": user.role,
                "status": user.status,
                "detail": (
                    "Registered. Awaiting manager approval."
                    if user.status == UserStatus.AWAITING_APPROVAL
                    else "Registered and active."
                ),
            },
            status=status.HTTP_201_CREATED,
        )


class VerifyInviteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = VerifyInviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = serializer.validated_data["invite_obj"]
        return Response({"valid": True, "role_for": code.role_for})


class LoginView(TokenObtainPairView):
    serializer_class = KwickTokenObtainPairSerializer


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


class InviteCodeCreateView(APIView):
    permission_classes = [IsManager]

    def post(self, request):
        serializer = InviteCodeCreateSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        instance = serializer.save()
        return Response(serializer.to_representation(instance), status=status.HTTP_201_CREATED)


class ApproveUserView(APIView):
    permission_classes = [IsManager]

    def post(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        user.status = UserStatus.ACTIVE
        user.save(update_fields=["status", "updated_at"])
        # Approval email is email-only (no push) per spec §4. Self-registered
        # employees already have a password and just get notified; employees
        # added via HR (no password yet) get a set-password link instead.
        send_approval_email.delay(user.id)
        return Response({"id": user.id, "status": user.status})


class RejectUserView(APIView):
    """Manager declines a self-registered signup still awaiting approval.
    There's nothing worth keeping for a request that was never active, so
    this removes the account outright rather than adding a new status value."""

    permission_classes = [IsManager]

    def post(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id, status=UserStatus.AWAITING_APPROVAL)
        except User.DoesNotExist:
            return Response(
                {"detail": "User not found or not awaiting approval."},
                status=status.HTTP_404_NOT_FOUND,
            )
        user.delete()
        return Response({"detail": "Registration rejected."})


class ForgotPasswordView(APIView):
    """Public: 'forgot my password' request from the login page."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # Same response whether or not the email matched an account.
        return Response({"detail": "If an account exists for that email, a reset link has been sent."})


class SetPasswordView(APIView):
    """Public: employee sets their password via the link from the approval email."""

    permission_classes = [AllowAny]

    def post(self, request):
        serializer = SetPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password set. You can now log in."})
