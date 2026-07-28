from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsManager
from tasks.models import Task
from tasks.serializers import TaskSerializer


class BoardView(APIView):
    """GET /api/kanban/board — tasks grouped by board_status (spec §11, manager only)."""

    permission_classes = [IsManager]

    def get(self, request):
        columns = {}
        for value, label in Task.BoardStatus.choices:
            qs = Task.objects.filter(board_status=value).order_by("board_order").select_related(
                "assignee", "project"
            )
            columns[value] = {"label": label, "tasks": TaskSerializer(qs, many=True).data}
        return Response(columns)


class MoveTaskView(APIView):
    """PATCH /api/kanban/tasks/{id}/move — change column + order (spec §11)."""

    permission_classes = [IsManager]

    def patch(self, request, task_id):
        try:
            task = Task.objects.get(pk=task_id)
        except Task.DoesNotExist:
            return Response({"detail": "Not found."}, status=404)
        board_status = request.data.get("board_status")
        board_order = request.data.get("board_order")
        if board_status is not None:
            task.board_status = board_status
        if board_order is not None:
            task.board_order = board_order
        task.save(update_fields=["board_status", "board_order", "updated_at"])
        return Response(TaskSerializer(task).data)
