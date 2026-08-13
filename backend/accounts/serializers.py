from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import ModuleAccess, Role, StaffProfile, User, UserStatus


class StaffProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffProfile
        fields = [
            "job_title",
            "department",
            "date_joined",
            "phone",
            "avatar_url",
            "visa_renewal_date",
            "insurance_renewal_date",
            "iloe_renewal_date",
        ]


class UserSerializer(serializers.ModelSerializer):
    profile = StaffProfileSerializer(read_only=True)
    module_access = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "role", "status", "profile", "module_access"]
        read_only_fields = ["id", "role", "status"]

    def get_module_access(self, obj):
        return list(obj.module_access.values_list("module", flat=True))


class RegisterSerializer(serializers.Serializer):
    """
    Public self-registration. There is only ever one superadmin (created via
    the bootstrap_superadmin management command) — every self-registered
    account is an employee, and always lands in awaiting_approval until the
    superadmin approves it (which triggers an email notification).
    """

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    full_name = serializers.CharField()

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def create(self, validated):
        user = User.objects.create_user(
            email=validated["email"],
            password=validated["password"],
            full_name=validated["full_name"],
            role=Role.EMPLOYEE,
            status=UserStatus.AWAITING_APPROVAL,
        )
        StaffProfile.objects.create(user=user)
        return user


class ForgotPasswordSerializer(serializers.Serializer):
    """Public self-service reset. Only sends mail when the email belongs to
    a registered, active account — otherwise the API returns an error so the
    UI can tell the user to contact an admin."""

    email = serializers.EmailField()

    def validate_email(self, value):
        email = (value or "").strip()
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            raise serializers.ValidationError(
                "No registered account for this email. Please contact your admin."
            )
        if user.status != UserStatus.ACTIVE or not user.is_active:
            raise serializers.ValidationError(
                "This account is not active yet. Please contact your admin."
            )
        self.context["reset_user"] = user
        return email

    def save(self):
        from .tasks import send_forgot_password_email

        user = self.context.get("reset_user")
        if not user:
            user = User.objects.get(email__iexact=self.validated_data["email"])
        send_forgot_password_email.delay(user.id)


class SetPasswordSerializer(serializers.Serializer):
    """
    Lets an employee added directly via HR (StaffCreateSerializer, no invite
    code, no password set yet) finish setup via the emailed token link once
    approved. Self-registered employees already have a password and never
    need this — send_approval_email only includes the link when it applies.
    """

    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        from django.utils.encoding import force_str
        from django.utils.http import urlsafe_base64_decode

        from .tokens import employee_set_password_token

        try:
            user_id = force_str(urlsafe_base64_decode(attrs["uid"]))
            user = User.objects.get(pk=user_id)
        except (User.DoesNotExist, ValueError, TypeError, OverflowError):
            raise serializers.ValidationError({"uid": "Invalid link."})
        if not employee_set_password_token.check_token(user, attrs["token"]):
            raise serializers.ValidationError({"token": "This link is invalid or has expired."})
        attrs["user_obj"] = user
        return attrs

    def save(self):
        user = self.validated_data["user_obj"]
        user.set_password(self.validated_data["password"])
        user.save(update_fields=["password", "updated_at"])
        return user


class UpdateProfileSerializer(serializers.Serializer):
    """
    Self-service profile edit — role is intentionally never accepted here.
    Employees' identity fields (name/email) are superadmin-owned (edited from
    the HR staff page instead); only the superadmin editing their own account
    may change them here. Phone stays self-service for everyone.
    """

    full_name = serializers.CharField(required=False)
    email = serializers.EmailField(required=False)
    phone = serializers.CharField(required=False, allow_blank=True)

    def validate_email(self, value):
        user = self.context["request"].user
        if User.objects.exclude(pk=user.pk).filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def save(self):
        user = self.context["request"].user
        if user.role == Role.SUPERADMIN:
            if "full_name" in self.validated_data:
                user.full_name = self.validated_data["full_name"]
            if "email" in self.validated_data:
                user.email = self.validated_data["email"]
            user.save(update_fields=["full_name", "email", "updated_at"])

        if "phone" in self.validated_data:
            profile, _ = StaffProfile.objects.get_or_create(user=user)
            profile.phone = self.validated_data["phone"]
            profile.save(update_fields=["phone", "updated_at"])
        return user


class ChangePasswordSerializer(serializers.Serializer):
    """Requires the current password — prevents a hijacked session from locking out the real owner."""

    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)

    def validate_current_password(self, value):
        user = self.context["request"].user
        if not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def save(self):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])
        return user


class AvatarUploadSerializer(serializers.Serializer):
    file = serializers.ImageField()

    def save(self):
        request = self.context["request"]
        user = request.user
        profile, _ = StaffProfile.objects.get_or_create(user=user)

        from django.core.files.storage import default_storage

        upload = self.validated_data["file"]
        ext = upload.name.rsplit(".", 1)[-1].lower() if "." in upload.name else "jpg"
        key = f"avatars/{user.pk}.{ext}"
        # Overwrite any previous avatar file at the same deterministic path.
        if default_storage.exists(key):
            default_storage.delete(key)
        saved_path = default_storage.save(key, upload)
        # default_storage.url() is host-relative for local FileSystemStorage
        # (e.g. "/media/avatars/1.jpg") — fine when frontend and backend share
        # an origin, but this project serves them from different ports/domains
        # in dev, so a bare relative URL resolves against the WRONG origin in
        # the browser. build_absolute_uri() fixes that; it's a no-op for S3
        # URLs, which are already absolute.
        # Cache-bust so browsers/CDN pick up an overwrite at the same path.
        from time import time

        base = request.build_absolute_uri(default_storage.url(saved_path))
        profile.avatar_url = f"{base}{'&' if '?' in base else '?'}v={int(time())}"
        profile.save(update_fields=["avatar_url", "updated_at"])
        return profile.avatar_url


class KwickTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT login that also blocks non-active users and returns role/status."""

    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.can_login:
            raise serializers.ValidationError(
                "Account is not active yet. The superadmin must approve it before you can log in."
            )
        data["user"] = UserSerializer(self.user).data
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["status"] = user.status
        return token


class ModuleAccessSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.full_name", read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)

    class Meta:
        model = ModuleAccess
        fields = ["id", "user", "user_name", "user_email", "module", "created_at"]
        read_only_fields = ["created_at"]

    def validate_user(self, value):
        if value.role == Role.SUPERADMIN:
            raise serializers.ValidationError("The superadmin already has full access.")
        return value
