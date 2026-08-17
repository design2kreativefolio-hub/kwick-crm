from django.db.models import Q
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsActive
from tasks.models import Task
from tasks.serializers import TaskSerializer


class BoardView(APIView):
    """
    GET /api/kanban/board — the current user's tasks grouped by board_status.
    Kanban is a personal work board, so superadmins also see only work assigned
    to themselves here; company-wide work remains available on the Tasks page.
    """

    permission_classes = [IsActive]

    def get(self, request):
        columns = {}
        for value, label in Task.BoardStatus.choices:
            qs = (
                Task.objects.filter(board_status=value)
                .filter(Q(assignee=request.user) | Q(assignees=request.user))
                .distinct()
                .order_by("board_order")
                .select_related("assignee", "project")
                .prefetch_related("assignees")
            )
            columns[value] = {"label": label, "tasks": TaskSerializer(qs, many=True).data}
        return Response(columns)


class MoveTaskView(APIView):
    """PATCH /api/kanban/tasks/{id}/move — change column + order (spec §11)."""

    permission_classes = [IsActive]

    def patch(self, request, task_id):
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        if task.assignee_id != request.user.id and not task.assignees.filter(pk=request.user.id).exists():
            return Response({"detail": "You can only move your own tasks."}, status=403)

        board_status = request.data.get("board_status")
        board_order = request.data.get("board_order")
        if board_status is not None:
            task.board_status = board_status
        if board_order is not None:
            task.board_order = board_order
        task.save(update_fields=["board_status", "board_order", "updated_at"])

        # Mirror back onto the originating to-do, if this task came from one —
        # dragging a card to Complete checks it off there too, and dragging it
        # back out un-checks it (spec follow-up: Kanban <-> To-Do stay in sync).
        from todos.models import TodoItem

        todo = TodoItem.objects.filter(linked_task=task).first()
        if todo is not None:
            should_be_done = task.board_status == Task.BoardStatus.DONE
            if todo.done != should_be_done:
                todo.done = should_be_done
                todo.save()

        return Response(TaskSerializer(task).data)
