from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Task, TaskUpdate


class TaskSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True, default="")
    assignee_name = serializers.SerializerMethodField()
    assignee_ids = serializers.ListField(child=serializers.IntegerField(), required=False, write_only=True)
    assignee_names = serializers.SerializerMethodField()
    content_client_id = serializers.IntegerField(
        source="content_item.client_id", read_only=True, allow_null=True, default=None
    )
    from_todo = serializers.SerializerMethodField()

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "project",
            "project_name",
            "client_name",
            "client",
            "assignee",
            "assignee_name",
            "assignee_ids",
            "assignee_names",
            "content_item",
            "content_client_id",
            "from_todo",
            "status",
            "priority",
            "due_date",
            "due_time",
            "completed_at",
            "board_status",
            "board_order",
            "created_at",
        ]
        # content_item is set only for a Task auto-created from a client
        # content calendar assignment — never client-writable; that link is
        # only ever created/removed via ContentCalendarItemViewSet.
        read_only_fields = [
            "completed_at",
            "created_at",
            "content_item",
            "content_client_id",
            "from_todo",
            "assignee_name",
            "assignee_names",
        ]
        extra_kwargs = {
            "assignee": {"required": False},
            "client": {"required": False, "allow_null": True},
        }

    def validate_assignee_ids(self, value):
        if not value:
            return value
        User = get_user_model()
        existing = set(User.objects.filter(pk__in=value, is_active=True).values_list("id", flat=True))
        missing = set(value) - existing
        if missing:
            raise serializers.ValidationError("One or more assignees were not found.")
        return value

    def get_assignee_ids(self, obj):
        ids = list(obj.assignees.values_list("id", flat=True))
        if ids:
            return ids
        return [obj.assignee_id] if obj.assignee_id else []

    def get_assignee_names(self, obj):
        names = []
        for u in obj.assignees.all():
            names.append({"id": u.id, "name": (u.full_name or u.email or "").strip()})
        if names:
            return names
        if obj.assignee_id:
            return [
                {
                    "id": obj.assignee_id,
                    "name": (obj.assignee.full_name or obj.assignee.email or "").strip(),
                }
            ]
        return []

    def get_from_todo(self, obj):
        return False

    def get_assignee_name(self, obj):
        names = []
        for u in obj.assignees.all():
            names.append((u.full_name or u.email or "").strip())
        names = [n for n in names if n]
        if names:
            return ", ".join(names)
        if obj.assignee_id:
            return (obj.assignee.full_name or obj.assignee.email or "").strip()
        return ""

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["assignee_ids"] = self.get_assignee_ids(instance)
        if not (data.get("client_name") or "").strip() and instance.content_item_id:
            client = getattr(getattr(instance, "content_item", None), "client", None)
            if client is not None:
                data["client_name"] = client.name
        return data


class TaskUpdateSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = TaskUpdate
        fields = ["id", "author", "author_name", "body", "created_at"]
        read_only_fields = ["author", "author_name", "created_at"]

    def validate_body(self, value):
        text = (value or "").strip()
        if not text:
            raise serializers.ValidationError("Update cannot be empty.")
        if len(text) > 4000:
            raise serializers.ValidationError("Update is too long.")
        return text

    def get_author_name(self, obj):
        return (obj.author.full_name or obj.author.email or "").strip()
