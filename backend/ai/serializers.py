from rest_framework import serializers

from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ("id", "role", "content", "links", "cards", "attachments", "created_at")


class ConversationListSerializer(serializers.ModelSerializer):
    preview = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = ("id", "title", "preview", "created_at", "updated_at")

    def get_preview(self, obj):
        last = obj.messages.order_by("-created_at").first()
        if not last:
            return ""
        text = (last.content or "").strip().replace("\n", " ")
        return text[:80] + ("…" if len(text) > 80 else "")


class ConversationDetailSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta:
        model = Conversation
        fields = ("id", "title", "created_at", "updated_at", "messages")
