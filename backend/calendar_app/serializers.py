from rest_framework import serializers

from accounts.models import User, UserStatus

from .models import ManualReminder


class ManualReminderSerializer(serializers.ModelSerializer):
    assignee_ids = serializers.PrimaryKeyRelatedField(
        source="assignees",
        many=True,
        queryset=User.objects.filter(status=UserStatus.ACTIVE),
        required=False,
    )
    assignee_names = serializers.SerializerMethodField()
    recurrence_end = serializers.DateField(required=False, allow_null=True)
    meeting_url = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = ManualReminder
        fields = [
            "id",
            "owner",
            "title",
            "description",
            "meeting_url",
            "remind_at",
            "visibility",
            "assignee_ids",
            "assignee_names",
            "recurrence",
            "recurrence_end",
            "done",
            "done_at",
            "created_at",
        ]
        read_only_fields = ["owner", "done_at", "created_at"]

    def get_assignee_names(self, obj):
        return [{"id": u.id, "name": u.full_name or u.email} for u in obj.assignees.all()]

    def create(self, validated_data):
        assignees = validated_data.pop("assignees", [])
        reminder = ManualReminder.objects.create(**validated_data)
        if assignees:
            reminder.assignees.set(assignees)
        return reminder

    def update(self, instance, validated_data):
        assignees = validated_data.pop("assignees", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if assignees is not None:
            instance.assignees.set(assignees)
        return instance
