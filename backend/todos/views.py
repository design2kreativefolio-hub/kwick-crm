from rest_framework import viewsets

from common.permissions import IsActive
from tasks.models import Task

from .models import TodoItem
from .serializers import TodoItemSerializer


def sync_task_from_todo(todo: TodoItem) -> None:
    """Keep the mirrored Tasks row in line with the personal to-do."""
    task = todo.linked_task
    if not task:
        return
    task.title = todo.text
    if todo.due_date:
        task.due_date = todo.due_date
    task.status = Task.Status.COMPLETED if todo.done else Task.Status.TODO
    task.board_status = Task.BoardStatus.DONE if todo.done else Task.BoardStatus.TODO
    task.save()


class TodoItemViewSet(viewsets.ModelViewSet):
    serializer_class = TodoItemSerializer
    permission_classes = [IsActive]

    def get_queryset(self):
        return TodoItem.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        todo = serializer.save(owner=self.request.user)
        # Incomplete to-dos appear on Tasks; completed ones stay on /todo only.
        task = Task.objects.create(
            title=todo.text,
            assignee=self.request.user,
            due_date=todo.due_date,
            status=Task.Status.TODO,
            board_status=Task.BoardStatus.TODO,
        )
        todo.linked_task = task
        todo.save(update_fields=["linked_task", "updated_at"])

    def perform_update(self, serializer):
        todo = serializer.save()
        sync_task_from_todo(todo)

    def perform_destroy(self, instance):
        if instance.linked_task_id:
            instance.linked_task.delete()
        instance.delete()
