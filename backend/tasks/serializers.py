from rest_framework import serializers

from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True, default="")
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True, default="")

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "project",
            "project_name",
            "assignee",
            "assignee_name",
            "status",
            "priority",
            "due_date",
            "completed_at",
            "board_status",
            "board_order",
            "created_at",
        ]
        read_only_fields = ["completed_at", "created_at"]
