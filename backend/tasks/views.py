from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.permissions import IsActive, is_superadmin
from common.services import log_activity

from .models import Task
from .serializers import TaskSerializer
from .services import (
    assigned_user_ids,
    clear_task_reminders,
    notify_task_assignment,
    sync_task_reminders,
)


class TaskViewSet(viewsets.ModelViewSet):
    """
    Personal tasks stay assignee-scoped. Client content-calendar work is
    company-wide: every active employee can see (and update) those mirrored
    tasks so the whole team shares one client workload.
    """

    serializer_class = TaskSerializer
    permission_classes = [IsActive]
    filterset_fields = ["status", "priority", "project", "assignee", "board_status"]
    search_fields = ["title", "description", "client_name"]

    def get_queryset(self):
        qs = Task.objects.select_related("project", "assignee", "content_item__client").prefetch_related(
            "assignees"
        )
        if not is_superadmin(self.request.user):
            qs = qs.filter(
                Q(assignee=self.request.user)
                | Q(assignees=self.request.user)
                | Q(content_item__isnull=False)
            )
        if self.request.query_params.get("mine") in ("1", "true"):
            qs = qs.filter(Q(assignee=self.request.user) | Q(assignees=self.request.user))
        return qs.distinct()

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
        task.assignees.set([task.assignee_id])
        log_activity(actor=self.request.user, action=f"added task \"{task.title}\"")
        notify_task_assignment(task=task, actor=self.request.user)
        sync_task_reminders(task)

    def perform_update(self, serializer):
        before_assignee_id = serializer.instance.assignee_id
        before_status = serializer.instance.status
        before_ids = set(assigned_user_ids(serializer.instance))
        task = serializer.save()
        if task.assignee_id and not task.assignees.exists():
            task.assignees.set([task.assignee_id])
        elif task.assignee_id and task.assignee_id != before_assignee_id:
            # Keep M2M in sync when primary assignee changes on a personal task.
            if not task.content_item_id:
                task.assignees.set([task.assignee_id])
        after_ids = set(assigned_user_ids(task))
        newly_assigned = after_ids - before_ids
        log_activity(actor=self.request.user, action=f"edited task \"{task.title}\"")
        if newly_assigned:
            notify_task_assignment(task=task, actor=self.request.user, user_ids=newly_assigned)
        sync_task_reminders(task)
        if task.content_item_id and task.status != before_status:
            self._sync_content_item_status(task)

    def perform_destroy(self, instance):
        clear_task_reminders(instance.id)
        return super().perform_destroy(instance)

    def _sync_content_item_status(self, task):
        """Reverse of ContentCalendarItemViewSet._sync_assignee_tasks — marking
        this task done/in-progress/published from the Tasks page should reflect
        back onto its client's content calendar item."""
        from projects.models import ContentCalendarItem

        status_map = {
            Task.Status.TODO: ContentCalendarItem.Status.PLANNED,
            Task.Status.IN_PROGRESS: ContentCalendarItem.Status.IN_PROGRESS,
            Task.Status.COMPLETED: ContentCalendarItem.Status.DONE,
            Task.Status.PUBLISHED: ContentCalendarItem.Status.PUBLISHED,
        }
        board_map = {
            Task.Status.TODO: Task.BoardStatus.TODO,
            Task.Status.IN_PROGRESS: Task.BoardStatus.DOING,
            Task.Status.COMPLETED: Task.BoardStatus.DONE,
            Task.Status.PUBLISHED: Task.BoardStatus.DONE,
        }
        new_status = status_map.get(task.status)
        if not new_status:
            return
        ContentCalendarItem.objects.filter(pk=task.content_item_id).update(status=new_status)
        due_date = None if task.status == Task.Status.PUBLISHED else task.due_date
        board_status = board_map.get(task.status, task.board_status)
        # One mirrored task per content item — update it (and any legacy dupes).
        for sibling in Task.objects.filter(content_item_id=task.content_item_id):
            sibling.status = task.status
            sibling.board_status = board_status
            sibling.due_date = due_date
            sibling.save(
                update_fields=["status", "board_status", "due_date", "completed_at", "updated_at"]
            )
        if task.status == Task.Status.PUBLISHED:
            from calendar_app.models import ManualReminder

            ManualReminder.objects.filter(
                description__contains=f"[kwick:content_item:{task.content_item_id}"
            ).update(done=True)

    @action(detail=False, methods=["get"])
    def my(self, request):
        """GET /api/tasks/my — the requesting user's own tasks (spec §8)."""
        qs = (
            Task.objects.filter(Q(assignee=request.user) | Q(assignees=request.user))
            .distinct()
            .select_related("project", "assignee", "content_item__client")
            .prefetch_related("assignees")
        )
        page = self.paginate_queryset(qs)
        serializer = TaskSerializer(page if page is not None else qs, many=True, context={"request": request})
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)
