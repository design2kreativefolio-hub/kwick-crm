from rest_framework import serializers

from .crypto import encrypt_secret
from .models import PasswordAccessLog, PasswordEntry


class PasswordEntrySerializer(serializers.ModelSerializer):
    client_display = serializers.SerializerMethodField()
    has_password = serializers.SerializerMethodField()
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PasswordEntry
        fields = [
            "id",
            "client",
            "client_name",
            "client_display",
            "platform",
            "username",
            "password",
            "has_password",
            "link",
            "security_question",
            "start_date",
            "expiry_date",
            "comment",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_by", "created_by_name", "created_at", "updated_at"]

    def get_client_display(self, obj):
        return obj.display_client()

    def get_has_password(self, obj):
        return bool(obj.password_encrypted)

    def get_created_by_name(self, obj):
        if not obj.created_by_id:
            return ""
        return obj.created_by.full_name or obj.created_by.email

    def validate(self, attrs):
        client = attrs.get("client", getattr(self.instance, "client", None) if self.instance else None)
        client_name = (
            attrs.get("client_name")
            if "client_name" in attrs
            else getattr(self.instance, "client_name", "")
        ) or ""
        if not client and not client_name.strip():
            raise serializers.ValidationError(
                {"client_name": "Select a client or enter a client name."}
            )
        platform = (attrs.get("platform") if "platform" in attrs else getattr(self.instance, "platform", "")) or ""
        if not platform.strip():
            raise serializers.ValidationError({"platform": "Platform is required."})
        attrs["platform"] = platform.strip()
        if client:
            attrs["client_name"] = ""
        else:
            attrs["client_name"] = client_name.strip()
        return attrs

    def create(self, validated_data):
        raw_password = validated_data.pop("password", "")
        entry = PasswordEntry(**validated_data)
        if raw_password:
            entry.password_encrypted = encrypt_secret(raw_password)
        entry.save()
        return entry

    def update(self, instance, validated_data):
        raw_password = validated_data.pop("password", None)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        if raw_password is not None and raw_password != "":
            instance.password_encrypted = encrypt_secret(raw_password)
        instance.save()
        return instance


class PasswordRevealSerializer(serializers.Serializer):
    password = serializers.CharField()


class VaultUnlockSerializer(serializers.Serializer):
    pin = serializers.CharField(max_length=4)


class VaultPinChangeSerializer(serializers.Serializer):
    current_pin = serializers.CharField(max_length=4)
    new_pin = serializers.CharField(max_length=4)


class PasswordAccessLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    action_label = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = PasswordAccessLog
        fields = [
            "id",
            "user_name",
            "action",
            "action_label",
            "client_label",
            "platform",
            "detail",
            "created_at",
        ]

    def get_user_name(self, obj):
        if not obj.user_id:
            return "Unknown"
        return obj.user.full_name or obj.user.email
