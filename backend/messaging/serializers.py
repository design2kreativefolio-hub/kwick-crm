from rest_framework import serializers

from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.full_name", read_only=True, default="")

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation",
            "sender",
            "sender_name",
            "body",
            "attachment_url",
            "attachment_type",
            "attachment_name",
            "created_at",
        ]
        read_only_fields = ["sender", "attachment_url", "attachment_type", "attachment_name", "created_at"]


class ConversationSerializer(serializers.ModelSerializer):
    last_message = serializers.SerializerMethodField()
    other_participant = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    participants_detail = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = [
            "id",
            "participants",
            "is_group",
            "name",
            "last_message",
            "other_participant",
            "unread_count",
            "participants_detail",
            "created_at",
        ]
        read_only_fields = ["participants", "is_group"]

    def get_last_message(self, obj):
        msg = obj.messages.last()
        return MessageSerializer(msg).data if msg else None

    def get_other_participant(self, obj):
        if obj.is_group:
            return None
        request = self.context.get("request")
        if not request:
            return None
        other = obj.participants.exclude(pk=request.user.pk).first()
        if not other:
            return None
        return {"id": other.id, "full_name": other.full_name, "email": other.email}

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if not request:
            return 0
        return obj.messages.exclude(sender=request.user).exclude(read_by=request.user).count()

    def get_participants_detail(self, obj):
        if not obj.is_group:
            return None
        return [
            {"id": p.id, "full_name": p.full_name, "email": p.email} for p in obj.participants.all()
        ]
