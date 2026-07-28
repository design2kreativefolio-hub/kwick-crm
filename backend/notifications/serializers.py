from rest_framework import serializers

from .models import NotificationEvent, PushSubscription


class PushSubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushSubscription
        fields = ["id", "endpoint", "keys"]


class NotificationEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = NotificationEvent
        fields = [
            "id",
            "source",
            "title",
            "body",
            "sent_at",
            "read_at",
            "recurring",
            "active",
            "created_at",
        ]
