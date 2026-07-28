from rest_framework import serializers

from .models import DailyTrackerEntry


class DailyTrackerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = DailyTrackerEntry
        fields = ["id", "user", "task_name", "description", "date", "created_at"]
        read_only_fields = ["user", "created_at"]
