from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsActive, is_superadmin
from common.services import log_activity

from .models import Task, TaskUpdate
from .serializers import TaskSerializer, TaskUpdateSerializer
from .services import (
    apply_assignees,
    assigned_user_ids,
    clear_task_reminders,
    normalize_assignee_ids,
    not_todo_linked,
    notify_task_assignment,
    notify_task_edit,
    resolve_task_client,
    sync_task_reminders,
    user_is_assignee,
)


def _base_task_qs():
    return not_todo_linked(
        Task.objects.select_related(
            "project", "assignee", "content_item__client", "client", "mini_project"
        ).prefetch_related("assignees")
    )


class TaskViewSet(viewsets.ModelViewSet):
    """
    Personal tasks stay assignee-scoped. Client content-calendar work is
    company-wide: every active employee can see (and update) those mirrored
    tasks so the whole team shares one client workload.
    """

    serializer_class = TaskSerializer
    permission_classes = [IsActive]
    filterset_fields = ["status", "priority", "project", "assignee", "board_status", "client"]
    search_fields = ["title", "description", "client_name"]

    def get_queryset(self):
        qs = _base_task_qs()
        client_id = self.request.query_params.get("client")
        if client_id:
            return qs.filter(client_id=client_id, content_item__isnull=True).distinct()

        assigned = Q(assignee=self.request.user) | Q(assignees=self.request.user)
        if self.action in ("retrieve", "partial_update", "update", "destroy"):
            if not is_superadmin(self.request.user):
                qs = qs.filter(assigned | Q(content_item__isnull=False) | Q(client__isnull=False))
            return qs.distinct()

        if not is_superadmin(self.request.user):
            qs = qs.filter(assigned | Q(content_item__isnull=False))
        if self.request.query_params.get("mine") in ("1", "true"):
            qs = qs.filter(assigned)
        return qs.distinct()

    def paginate_queryset(self, queryset):
        if self.request.query_params.get("client"):
            return None
        return super().paginate_queryset(queryset)

    def _can_mutate(self, task) -> bool:
        if task.content_item_id:
            return True
        if is_superadmin(self.request.user):
            return True
        return user_is_assignee(task, self.request.user)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.content_item_id:
            return Response(
                {
                    "detail": "This task comes from a client content calendar assignment — remove it there instead."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if instance.mini_project_id:
            return Response(
                {
                    "detail": "This task mirrors a mini-project — remove it from Mini-Projects instead."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not self._can_mutate(instance):
            return Response({"detail": "You can only delete tasks assigned to you."}, status=403)
        return super().destroy(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if not self._can_mutate(instance):
            return Response({"detail": "You can only edit tasks assigned to you."}, status=403)
        return super().update(request, *args, **kwargs)

    def perform_create(self, serializer):
        ids = normalize_assignee_ids(serializer.validated_data.pop("assignee_ids", None))
        resolve_task_client(serializer.validated_data)
        serializer.validated_data.pop("assignee", None)
        if not ids:
            ids = [self.request.user.id]
        task = serializer.save(assignee_id=ids[0])
        apply_assignees(task, ids)
        log_activity(actor=self.request.user, action=f'added task "{task.title}"')
        notify_task_assignment(task=task, actor=self.request.user)
        sync_task_reminders(task)

    def perform_update(self, serializer):
        before_ids = set(assigned_user_ids(serializer.instance))
        before_status = serializer.instance.status
        ids = serializer.validated_data.pop("assignee_ids", None)
        resolve_task_client(serializer.validated_data)
        task = serializer.save()
        if ids is not None:
            apply_assignees(task, normalize_assignee_ids(ids))
        elif task.assignee_id and not task.assignees.exists():
            task.assignees.set([task.assignee_id])
        after_ids = set(assigned_user_ids(task))
        newly_assigned = after_ids - before_ids
        log_activity(actor=self.request.user, action=f'edited task "{task.title}"')
        if newly_assigned:
            notify_task_assignment(task=task, actor=self.request.user, user_ids=newly_assigned)
        # Existing assignees (not the editor, not brand-new assignees) get an edit ping.
        edit_targets = (before_ids & after_ids) - {self.request.user.id}
        if edit_targets:
            notify_task_edit(task=task, actor=self.request.user, user_ids=edit_targets)
        sync_task_reminders(task)
        if task.content_item_id and task.status != before_status:
            self._sync_content_item_status(task)
        if task.mini_project_id:
            self._sync_mini_project_from_task(task, before_status=before_status)

    def perform_destroy(self, instance):
        clear_task_reminders(instance.id)
        return super().perform_destroy(instance)

    def _sync_mini_project_from_task(self, task, *, before_status):
        """Status / priority / due edits on the mirrored Tasks row write back
        onto the mini-project (same idea as content calendar reverse sync)."""
        from projects.models import Project

        project = task.mini_project
        if project is None:
            return
        status_changed = task.status != before_status
        project.status = task.status
        project.priority = task.priority
        if task.status == Task.Status.APPROVED:
            project.delivery_date = None
        elif task.due_date is not None:
            project.delivery_date = task.due_date
        project.name = task.title
        project.description = task.description or ""
        project.client = task.client_name or ""
        project.save(
            update_fields=[
                "status",
                "priority",
                "delivery_date",
                "name",
                "description",
                "client",
                "updated_at",
            ]
        )
        # Keep assignees aligned when edited from Tasks.
        member_ids = list(task.assignees.values_list("id", flat=True))
        if not member_ids and task.assignee_id:
            member_ids = [task.assignee_id]
        if member_ids:
            project.members.set(member_ids)
        if status_changed:
            from projects.tasks import evaluate_project_delivery

            try:
                evaluate_project_delivery(project)
            except Exception:
                import logging

                logging.getLogger(__name__).exception(
                    "Failed to refresh delivery reminder for mini-project %s", project.pk
                )

    def _sync_content_item_status(self, task):
        """Reverse of ContentCalendarItemViewSet._sync_assignee_tasks — marking
        this task assigned/in-progress/completed/QC/approved from the Tasks page
        should reflect back onto its client's content calendar item."""
        from projects.models import ContentCalendarItem

        status_map = {
            Task.Status.ASSIGNED: ContentCalendarItem.Status.ASSIGNED,
            Task.Status.IN_PROGRESS: ContentCalendarItem.Status.IN_PROGRESS,
            Task.Status.COMPLETED: ContentCalendarItem.Status.COMPLETED,
            Task.Status.QC_COMPLETED: ContentCalendarItem.Status.QC_COMPLETED,
            Task.Status.APPROVED: ContentCalendarItem.Status.APPROVED,
        }
        board_map = {
            Task.Status.ASSIGNED: Task.BoardStatus.TODO,
            Task.Status.IN_PROGRESS: Task.BoardStatus.DOING,
            Task.Status.COMPLETED: Task.BoardStatus.DONE,
            Task.Status.QC_COMPLETED: Task.BoardStatus.DONE,
            Task.Status.APPROVED: Task.BoardStatus.DONE,
        }
        new_status = status_map.get(task.status)
        if not new_status:
            return
        ContentCalendarItem.objects.filter(pk=task.content_item_id).update(status=new_status)
        due_date = None if task.status == Task.Status.APPROVED else task.due_date
        board_status = board_map.get(task.status, task.board_status)
        for sibling in Task.objects.filter(content_item_id=task.content_item_id):
            sibling.status = task.status
            sibling.board_status = board_status
            sibling.due_date = due_date
            sibling.save(update_fields=["status", "board_status", "due_date", "completed_at", "updated_at"])
        if task.status == Task.Status.APPROVED:
            from calendar_app.models import ManualReminder

            ManualReminder.objects.filter(
                description__contains=f"[kwick:content_item:{task.content_item_id}"
            ).update(done=True)

    @action(detail=False, methods=["get"])
    def my(self, request):
        """GET /api/tasks/my — the requesting user's own tasks (spec §8)."""
        qs = (
            _base_task_qs()
            .filter(Q(assignee=request.user) | Q(assignees=request.user))
            .distinct()
        )
        page = self.paginate_queryset(qs)
        serializer = TaskSerializer(page if page is not None else qs, many=True, context={"request": request})
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)


class TaskUpdateListCreateView(APIView):
    permission_classes = [IsActive]

    def _task(self, request, task_id):
        qs = _base_task_qs()
        if not is_superadmin(request.user):
            qs = qs.filter(
                Q(assignee=request.user)
                | Q(assignees=request.user)
                | Q(content_item__isnull=False)
                | Q(client__isnull=False)
            ).distinct()
        return get_object_or_404(qs, pk=task_id)

    def get(self, request, task_id):
        task = self._task(request, task_id)
        updates = task.updates.select_related("author")
        return Response(TaskUpdateSerializer(updates, many=True).data)

    def post(self, request, task_id):
        task = self._task(request, task_id)
        if not user_is_assignee(task, request.user):
            return Response({"detail": "Only assignees can post daily updates."}, status=403)
        serializer = TaskUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(task=task, author=request.user)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class TaskUpdateDestroyView(APIView):
    permission_classes = [IsActive]

    def delete(self, request, task_id, pk):
        update = get_object_or_404(TaskUpdate.objects.select_related("task"), pk=pk, task_id=task_id)
        TaskUpdateListCreateView()._task(request, task_id)
        if update.author_id != request.user.id:
            return Response({"detail": "You can only delete your own updates."}, status=403)
        update.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
