from django.contrib.auth import get_user_model
from rest_framework import serializers

from accounts.models import Role, StaffProfile, UserStatus

from .models import EmployeeCollateral, Leave, LeaveBalance, Ticket

User = get_user_model()


class StaffListSerializer(serializers.ModelSerializer):
    job_title = serializers.CharField(source="profile.job_title", read_only=True, default="")
    department = serializers.CharField(source="profile.department", read_only=True, default="")

    class Meta:
        model = User
        fields = ["id", "email", "full_name", "role", "status", "job_title", "department"]


class StaffCreateSerializer(serializers.Serializer):
    full_name = serializers.CharField()
    email = serializers.EmailField()
    job_title = serializers.CharField(required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    date_joined = serializers.DateField(required=False, allow_null=True)

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def create(self, validated):
        # Created by a manager; starts awaiting_approval until the employee sets a password.
        user = User.objects.create_user(
            email=validated["email"],
            password=None,
            full_name=validated["full_name"],
            role=Role.EMPLOYEE,
            status=UserStatus.AWAITING_APPROVAL,
        )
        user.set_unusable_password()
        user.save(update_fields=["password"])
        StaffProfile.objects.update_or_create(
            user=user,
            defaults={
                "job_title": validated.get("job_title", ""),
                "department": validated.get("department", ""),
                "date_joined": validated.get("date_joined"),
            },
        )
        return user

    def to_representation(self, instance):
        return StaffListSerializer(instance).data


class EmployeeCollateralSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeCollateral
        fields = [
            "id",
            "staff",
            "category",
            "doc_type",
            "file_url",
            "generated_at",
            "generated_by",
            "created_at",
        ]
        read_only_fields = ["category", "file_url", "generated_at", "generated_by", "created_at"]


class LeaveSerializer(serializers.ModelSerializer):
    days = serializers.IntegerField(read_only=True)

    class Meta:
        model = Leave
        fields = [
            "id",
            "staff",
            "leave_type",
            "start_date",
            "end_date",
            "days",
            "status",
            "reason",
            "created_at",
        ]
        read_only_fields = ["status", "created_at"]


class LeaveBalanceSerializer(serializers.ModelSerializer):
    remaining = serializers.IntegerField(read_only=True)

    class Meta:
        model = LeaveBalance
        fields = ["id", "staff", "year", "annual_allowance", "used", "pending", "remaining"]


class TicketSerializer(serializers.ModelSerializer):
    class Meta:
        model = Ticket
        fields = [
            "id",
            "raised_by",
            "date",
            "description",
            "urgency",
            "status",
            "created_at",
        ]
        read_only_fields = ["raised_by", "status", "created_at"]
