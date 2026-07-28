from rest_framework import serializers

from .models import ManualReminder


class ManualReminderSerializer(serializers.ModelSerializer):
    class Meta:
        model = ManualReminder
        fields = ["id", "owner", "title", "remind_at", "visibility", "created_at"]
        read_only_fields = ["owner", "created_at"]
