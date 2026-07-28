from django.utils import timezone
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import InviteCode, Role, StaffProfile, User, UserStatus


class StaffProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StaffProfile
        fields = [
            "job_title",
            "department",
            "date_joined",
            "phone",
            "avatar_url",
        ]


class UserSerializer(serializers.ModelSerializer):
    profile = StaffProfileSerializer(read_only=True)

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "role", "status", "profile"]
        read_only_fields = ["id", "role", "status"]


class VerifyInviteSerializer(serializers.Serializer):
    """
    Both managers and employees register via invite code (spec §4): a code is
    only valid for the role it was issued for.
    """

    invite_code = serializers.CharField()
    role = serializers.ChoiceField(choices=Role.choices, default=Role.EMPLOYEE)

    def validate(self, attrs):
        try:
            code = InviteCode.objects.get(code_hash=InviteCode.hash_code(attrs["invite_code"]))
        except InviteCode.DoesNotExist:
            raise serializers.ValidationError({"invite_code": "Invalid invite code."})
        if not code.is_valid_for(attrs["role"]):
            raise serializers.ValidationError(
                {"invite_code": "Invite code is expired, used, or not valid for this role."}
            )
        attrs["invite_obj"] = code
        return attrs


class RegisterSerializer(serializers.Serializer):
    """
    Public self-registration for both roles via invite code (spec §4).
    Manager: skips approval, active immediately. Employee: awaiting_approval
    until a manager approves — approval triggers an email to the employee.
    """

    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    full_name = serializers.CharField()
    role = serializers.ChoiceField(choices=Role.choices, default=Role.EMPLOYEE)
    invite_code = serializers.CharField()

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def validate(self, attrs):
        try:
            code = InviteCode.objects.get(code_hash=InviteCode.hash_code(attrs["invite_code"]))
        except InviteCode.DoesNotExist:
            raise serializers.ValidationError({"invite_code": "Invalid invite code."})
        if not code.is_valid_for(attrs["role"]):
            raise serializers.ValidationError(
                {"invite_code": "Invite code is expired, used, or not valid for this role."}
            )
        attrs["invite_obj"] = code
        return attrs

    def create(self, validated):
        code = validated["invite_obj"]
        role = validated["role"]
        # Manager self-registering with a valid code skips approval entirely (spec §4).
        status = UserStatus.ACTIVE if role == Role.MANAGER else UserStatus.AWAITING_APPROVAL
        user = User.objects.create_user(
            email=validated["email"],
            password=validated["password"],
            full_name=validated["full_name"],
            role=role,
            status=status,
        )
        StaffProfile.objects.create(user=user)
        code.mark_used(user)
        return user


class InviteCodeCreateSerializer(serializers.Serializer):
    """Manager issues an invite code for either role (spec §4)."""

    role_for = serializers.ChoiceField(choices=Role.choices, default=Role.EMPLOYEE)
    expires_in_days = serializers.IntegerField(default=7, min_value=1, max_value=90)

    def create(self, validated):
        expires_at = timezone.now() + timezone.timedelta(days=validated["expires_in_days"])
        instance, raw = InviteCode.issue(
            issued_by=self.context["request"].user,
            role_for=validated["role_for"],
            expires_at=expires_at,
        )
        # raw code returned exactly once — never stored in cleartext.
        self._raw = raw
        return instance

    def to_representation(self, instance):
        return {
            "id": instance.id,
            "code": getattr(self, "_raw", None),
            "role_for": instance.role_for,
            "expires_at": instance.expires_at,
        }


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


class KwickTokenObtainPairSerializer(TokenObtainPairSerializer):
    """JWT login that also blocks non-active users and returns role/status."""

    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.can_login:
            raise serializers.ValidationError(
                "Account is not active yet. A manager must approve it before you can log in."
            )
        data["user"] = UserSerializer(self.user).data
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["status"] = user.status
        return token
