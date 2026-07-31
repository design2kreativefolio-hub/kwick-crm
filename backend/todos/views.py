from rest_framework import viewsets

from common.permissions import IsActive
from tasks.models import Task

from .models import TodoItem
from .serializers import TodoItemSerializer


class TodoItemViewSet(viewsets.ModelViewSet):
    serializer_class = TodoItemSerializer
    permission_classes = [IsActive]

    def get_queryset(self):
        return TodoItem.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        todo = serializer.save(owner=self.request.user)
        # Mirror onto the owner's own Kanban board — self-assigned, no picker
        # needed, matches how personal to-dos are meant to show up there.
        task = Task.objects.create(
            title=todo.text,
            assignee=self.request.user,
            board_status=Task.BoardStatus.TODO,
        )
        todo.linked_task = task
        todo.save(update_fields=["linked_task", "updated_at"])

    def perform_update(self, serializer):
        was_done = serializer.instance.done
        todo = serializer.save()
        if todo.linked_task and todo.done != was_done:
            todo.linked_task.board_status = (
                Task.BoardStatus.DONE if todo.done else Task.BoardStatus.TODO
            )
            todo.linked_task.save(update_fields=["board_status", "updated_at"])
        if todo.linked_task and "text" in serializer.validated_data:
            todo.linked_task.title = todo.text
            todo.linked_task.save(update_fields=["title", "updated_at"])

    def perform_destroy(self, instance):
        if instance.linked_task_id:
            instance.linked_task.delete()
        instance.delete()
