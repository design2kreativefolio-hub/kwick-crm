from django.contrib.auth import get_user_model
from rest_framework import serializers

from accounts.models import Role, StaffProfile, UserStatus
from common.media_urls import scrub_media_tree, sign_media_tree, sign_media_url

from .models import EmployeeCollateral, EmployeeRecord, HrLetter, Leave, LeaveBalance, Ticket

User = get_user_model()


class StaffListSerializer(serializers.ModelSerializer):
    job_title = serializers.CharField(source="profile.job_title", read_only=True, default="")
    department = serializers.CharField(source="profile.department", read_only=True, default="")
    phone = serializers.CharField(source="profile.phone", read_only=True, default="")
    date_joined = serializers.DateField(source="profile.date_joined", read_only=True, default=None)
    visa_renewal_date = serializers.DateField(source="profile.visa_renewal_date", read_only=True, default=None)
    insurance_renewal_date = serializers.DateField(
        source="profile.insurance_renewal_date", read_only=True, default=None
    )
    iloe_renewal_date = serializers.DateField(source="profile.iloe_renewal_date", read_only=True, default=None)
    avatar_url = serializers.CharField(source="profile.avatar_url", read_only=True, default="")
    nationality = serializers.CharField(source="profile.nationality", read_only=True, default="")
    emergency_contact_uae = serializers.CharField(
        source="profile.emergency_contact_uae", read_only=True, default=""
    )
    emergency_contact_relation = serializers.CharField(
        source="profile.emergency_contact_relation", read_only=True, default=""
    )
    home_country_address = serializers.CharField(
        source="profile.home_country_address", read_only=True, default=""
    )
    home_country_number = serializers.CharField(
        source="profile.home_country_number", read_only=True, default=""
    )

    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "full_name",
            "role",
            "status",
            "job_title",
            "department",
            "phone",
            "date_joined",
            "visa_renewal_date",
            "insurance_renewal_date",
            "iloe_renewal_date",
            "avatar_url",
            "nationality",
            "emergency_contact_uae",
            "emergency_contact_relation",
            "home_country_address",
            "home_country_number",
        ]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("avatar_url"):
            data["avatar_url"] = sign_media_url(data["avatar_url"])
        return data


class StaffCreateSerializer(serializers.Serializer):
    """
    Manager-created staff: everything an employee would otherwise fill in
    themselves at self-registration — email, phone, a password the manager
    sets directly — plus the HR-only fields. Active immediately (no approval
    step; the manager creating the account IS the approval), and a welcome
    email goes out once created.
    """

    full_name = serializers.CharField()
    email = serializers.EmailField()
    phone = serializers.CharField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8)
    job_title = serializers.CharField(required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    date_joined = serializers.DateField(required=False, allow_null=True)
    visa_renewal_date = serializers.DateField(required=False, allow_null=True)
    insurance_renewal_date = serializers.DateField(required=False, allow_null=True)
    iloe_renewal_date = serializers.DateField(required=False, allow_null=True)

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
            status=UserStatus.ACTIVE,
        )
        StaffProfile.objects.update_or_create(
            user=user,
            defaults={
                "job_title": validated.get("job_title", ""),
                "department": validated.get("department", ""),
                "phone": validated.get("phone", ""),
                "date_joined": validated.get("date_joined"),
                "visa_renewal_date": validated.get("visa_renewal_date"),
                "insurance_renewal_date": validated.get("insurance_renewal_date"),
                "iloe_renewal_date": validated.get("iloe_renewal_date"),
            },
        )
        return user

    def to_representation(self, instance):
        return StaffListSerializer(instance).data


class StaffUpdateSerializer(serializers.Serializer):
    """Manager editing an existing staff member's details (spec follow-up:
    identity + HR fields are manager-owned, not employee self-service)."""

    full_name = serializers.CharField(required=False)
    email = serializers.EmailField(required=False)
    phone = serializers.CharField(required=False, allow_blank=True)
    job_title = serializers.CharField(required=False, allow_blank=True)
    department = serializers.CharField(required=False, allow_blank=True)
    date_joined = serializers.DateField(required=False, allow_null=True)
    visa_renewal_date = serializers.DateField(required=False, allow_null=True)
    insurance_renewal_date = serializers.DateField(required=False, allow_null=True)
    iloe_renewal_date = serializers.DateField(required=False, allow_null=True)
    nationality = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_uae = serializers.CharField(required=False, allow_blank=True)
    emergency_contact_relation = serializers.CharField(required=False, allow_blank=True)
    home_country_address = serializers.CharField(required=False, allow_blank=True)
    home_country_number = serializers.CharField(required=False, allow_blank=True)

    def validate_email(self, value):
        user = self.context["user"]
        if User.objects.exclude(pk=user.pk).filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def save(self):
        user = self.context["user"]
        user_fields = []
        if "full_name" in self.validated_data:
            user.full_name = self.validated_data["full_name"]
            user_fields.append("full_name")
        if "email" in self.validated_data:
            user.email = self.validated_data["email"]
            user_fields.append("email")
        if user_fields:
            user.save(update_fields=user_fields + ["updated_at"])

        profile, _ = StaffProfile.objects.get_or_create(user=user)
        profile_fields = [
            "phone",
            "job_title",
            "department",
            "date_joined",
            "visa_renewal_date",
            "insurance_renewal_date",
            "iloe_renewal_date",
            "nationality",
            "emergency_contact_uae",
            "emergency_contact_relation",
            "home_country_address",
            "home_country_number",
        ]
        changed = [f for f in profile_fields if f in self.validated_data]
        for f in changed:
            setattr(profile, f, self.validated_data[f])
        if changed:
            profile.save(update_fields=changed + ["updated_at"])

        # Touching a renewal date re-checks that field's reminder right now —
        # instantly clears it if the new date is out of the lead window, or
        # instantly (re)shows it if it's still due/overdue, rather than
        # waiting for tomorrow's scan either way (spec follow-up).
        from .tasks import RENEWAL_FIELD_LABELS, evaluate_staff_renewal

        for f in RENEWAL_FIELD_LABELS:
            if f in changed:
                evaluate_staff_renewal(profile, f, RENEWAL_FIELD_LABELS[f])
        return user


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

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("file_url"):
            data["file_url"] = sign_media_url(data["file_url"])
        return data


class EmployeeRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmployeeRecord
        fields = ["id", "staff", "title", "file_url", "uploaded_by", "created_at"]
        read_only_fields = ["file_url", "uploaded_by", "created_at"]

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("file_url"):
            data["file_url"] = sign_media_url(data["file_url"])
        return data


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
        read_only_fields = ["staff", "status", "created_at"]


class LeaveBalanceSerializer(serializers.ModelSerializer):
    remaining = serializers.IntegerField(read_only=True)
    used_this_month = serializers.SerializerMethodField()

    class Meta:
        model = LeaveBalance
        fields = [
            "id",
            "staff",
            "year",
            "annual_allowance",
            "used",
            "pending",
            "remaining",
            "used_this_month",
        ]

    def get_used_this_month(self, obj):
        from datetime import date

        today = date.today()
        paid_types = [Leave.LeaveType.ANNUAL, Leave.LeaveType.OTHER]
        qs = Leave.objects.filter(
            staff=obj.staff,
            leave_type__in=paid_types,
            status=Leave.Status.APPROVED,
            start_date__year=today.year,
            start_date__month=today.month,
        )
        return sum(l.days for l in qs)


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


class HrLetterSerializer(serializers.ModelSerializer):
    staff_name = serializers.SerializerMethodField()
    doc_type_label = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = HrLetter
        fields = [
            "id",
            "doc_type",
            "doc_type_label",
            "title",
            "staff",
            "staff_name",
            "content",
            "status",
            "file_url",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by", "file_url", "created_at", "updated_at"]

    def to_internal_value(self, data):
        ret = super().to_internal_value(data)
        if "content" in ret:
            ret["content"] = scrub_media_tree(ret["content"])
        return ret

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("file_url"):
            data["file_url"] = sign_media_url(data["file_url"])
        if data.get("content"):
            data["content"] = sign_media_tree(data["content"])
        return data

    def get_staff_name(self, obj):
        if not obj.staff_id:
            return (obj.content or {}).get("employee_name", "") or ""
        return obj.staff.full_name or obj.staff.email

    def get_doc_type_label(self, obj):
        from .letter_content import DOC_TYPE_LABELS

        return DOC_TYPE_LABELS.get(obj.doc_type, obj.doc_type)

    def get_created_by_name(self, obj):
        if not obj.created_by:
            return ""
        return obj.created_by.full_name or obj.created_by.email

    def _apply_content(self, validated_data, instance=None):
        from .letter_content import letter_title, merged_content

        doc_type = validated_data.get("doc_type") or (instance.doc_type if instance else None)
        if not doc_type:
            raise serializers.ValidationError({"doc_type": "Required."})
        content = merged_content(doc_type, validated_data.get("content") if "content" in validated_data else (instance.content if instance else None))
        if "content" in validated_data or instance is None:
            validated_data["content"] = content

        # Document name is user-editable. Default only when creating / clearing.
        if "title" in validated_data:
            title = (validated_data.get("title") or "").strip()
            validated_data["title"] = title or letter_title(doc_type, content)
        elif instance is not None and (instance.title or "").strip():
            validated_data["title"] = instance.title
        else:
            validated_data["title"] = letter_title(doc_type, content)

        staff = validated_data.get("staff", serializers.empty)
        if staff is serializers.empty and instance:
            staff = instance.staff
        if doc_type == "offer_letter":
            validated_data["staff"] = None
        elif staff is None or staff is serializers.empty:
            # keep existing on partial update without staff key
            if "staff" in validated_data:
                validated_data["staff"] = None
        return validated_data

    def create(self, validated_data):
        validated_data = self._apply_content(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        if (
            "content" in validated_data
            or "doc_type" in validated_data
            or "staff" in validated_data
            or "title" in validated_data
        ):
            validated_data = self._apply_content(validated_data, instance=instance)
        return super().update(instance, validated_data)
