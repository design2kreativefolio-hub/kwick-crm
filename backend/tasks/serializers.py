from rest_framework import serializers

from .models import Task


class TaskSerializer(serializers.ModelSerializer):
    project_name = serializers.CharField(source="project.name", read_only=True, default="")
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True, default="")
    content_client_id = serializers.IntegerField(
        source="content_item.client_id", read_only=True, allow_null=True, default=None
    )

    class Meta:
        model = Task
        fields = [
            "id",
            "title",
            "description",
            "project",
            "project_name",
            "client_name",
            "assignee",
            "assignee_name",
            "content_item",
            "content_client_id",
            "status",
            "priority",
            "due_date",
            "completed_at",
            "board_status",
            "board_order",
            "created_at",
        ]
        # content_item is set only for a Task auto-created from a client
        # content calendar assignment — never client-writable; that link is
        # only ever created/removed via ContentCalendarItemViewSet.
        read_only_fields = ["completed_at", "created_at", "content_item", "content_client_id"]
        # Not required at the serializer level — perform_create always fills
        # it in (self for employees, self-as-fallback for managers) so a
        # request that simply omits it shouldn't fail validation before
        # perform_create ever gets a chance to run.
        extra_kwargs = {"assignee": {"required": False}}

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Backfill client name for older calendar-synced tasks that predate
        # client_name being written in _sync_assignee_tasks.
        if not (data.get("client_name") or "").strip() and instance.content_item_id:
            client = getattr(getattr(instance, "content_item", None), "client", None)
            if client is not None:
                data["client_name"] = client.name
        return data
