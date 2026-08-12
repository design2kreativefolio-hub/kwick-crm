from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.permissions import IsActive, is_superadmin
from common.services import log_activity
from notifications.services import notify_user

from .models import Task
from .serializers import TaskSerializer


class TaskViewSet(viewsets.ModelViewSet):
    """
    Manager + Employee. Employees only ever see their own tasks — enforced in
    get_queryset so GET /tasks/{id} never leaks another employee's task (spec §8).
    """

    serializer_class = TaskSerializer
    permission_classes = [IsActive]
    filterset_fields = ["status", "priority", "project", "assignee", "board_status"]
    search_fields = ["title", "description", "client_name"]

    def get_queryset(self):
        qs = Task.objects.select_related("project", "assignee", "content_item__client")
        if is_superadmin(self.request.user):
            return qs
        return qs.filter(assignee=self.request.user)

    def destroy(self, request, *args, **kwargs):
        # A task mirrored from a client content calendar assignment isn't
        # independently deletable here — the calendar item is the source of
        # truth, so removing the assignment (or the item itself) there is
        # what deletes it (spec follow-up).
        instance = self.get_object()
        if instance.content_item_id:
            return Response(
                {"detail": "This task comes from a client content calendar assignment — remove it there instead."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    def perform_create(self, serializer):
        # Employees can only create tasks assigned to themselves. Managers
        # may pick anyone, or leave it unset — falls back to self rather
        # than erroring, since assignee is a required (non-nullable) field
        # on the model.
        if is_superadmin(self.request.user):
            task = serializer.save(assignee=serializer.validated_data.get("assignee") or self.request.user)
        else:
            task = serializer.save(assignee=self.request.user)
        log_activity(actor=self.request.user, action=f"added task \"{task.title}\"")
        self._notify_assignee(task)

    def perform_update(self, serializer):
        before_assignee_id = serializer.instance.assignee_id
        before_status = serializer.instance.status
        task = serializer.save()
        log_activity(actor=self.request.user, action=f"edited task \"{task.title}\"")
        if task.assignee_id != before_assignee_id:
            self._notify_assignee(task)
        if task.content_item_id and task.status != before_status:
            self._sync_content_item_status(task)

    def _sync_content_item_status(self, task):
        """Reverse of ContentCalendarItemViewSet._sync_assignee_tasks — marking
        this task done/in-progress from the Tasks page should reflect back
        onto its client's content calendar item too."""
        from projects.models import ContentCalendarItem

        status_map = {
            Task.Status.TODO: ContentCalendarItem.Status.PLANNED,
            Task.Status.IN_PROGRESS: ContentCalendarItem.Status.IN_PROGRESS,
            Task.Status.COMPLETED: ContentCalendarItem.Status.DONE,
        }
        new_status = status_map.get(task.status)
        if new_status:
            ContentCalendarItem.objects.filter(pk=task.content_item_id).update(status=new_status)

    def _notify_assignee(self, task):
        if task.assignee_id == self.request.user.id:
            return
        actor = self.request.user
        notify_user(
            user=task.assignee,
            source="task",
            title=f"You've been assigned to \"{task.title}\"",
            body=f"{actor.full_name or actor.email} assigned you this task.",
            object_ref=f"task:{task.id}:assigned",
        )

    @action(detail=False, methods=["get"])
    def my(self, request):
        """GET /api/tasks/my — the requesting user's own tasks (spec §8)."""
        qs = Task.objects.filter(assignee=request.user).select_related(
            "project", "content_item__client"
        )
        page = self.paginate_queryset(qs)
        serializer = TaskSerializer(page if page is not None else qs, many=True, context={"request": request})
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)
