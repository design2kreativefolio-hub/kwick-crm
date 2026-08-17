from rest_framework import serializers

from common.media_urls import user_avatar_url

from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.full_name", read_only=True, default="")
    sender_avatar_url = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = [
            "id",
            "conversation",
            "sender",
            "sender_name",
            "sender_avatar_url",
            "body",
            "is_system",
            "attachment_url",
            "attachment_type",
            "attachment_name",
            "created_at",
        ]
        read_only_fields = [
            "sender",
            "sender_avatar_url",
            "is_system",
            "attachment_url",
            "attachment_type",
            "attachment_name",
            "created_at",
        ]

    def get_sender_avatar_url(self, obj):
        return user_avatar_url(obj.sender)


def _participant_payload(user):
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "avatar_url": user_avatar_url(user),
    }


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
        msg = obj.messages.select_related("sender__profile").last()
        return MessageSerializer(msg).data if msg else None

    def get_other_participant(self, obj):
        if obj.is_group:
            return None
        request = self.context.get("request")
        if not request:
            return None
        other = obj.participants.select_related("profile").exclude(pk=request.user.pk).first()
        if not other:
            return None
        return _participant_payload(other)

    def get_unread_count(self, obj):
        request = self.context.get("request")
        if not request:
            return 0
        return (
            obj.messages.exclude(is_system=True)
            .exclude(sender=request.user)
            .exclude(read_by=request.user)
            .count()
        )

    def get_participants_detail(self, obj):
        if not obj.is_group:
            return None
        return [
            _participant_payload(p)
            for p in obj.participants.select_related("profile").all()
        ]
