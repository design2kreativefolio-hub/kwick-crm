from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.permissions import IsActive, is_manager
from common.services import log_activity

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
    search_fields = ["title", "description"]

    def get_queryset(self):
        qs = Task.objects.select_related("project", "assignee")
        if is_manager(self.request.user):
            return qs
        return qs.filter(assignee=self.request.user)

    def perform_create(self, serializer):
        # Employees can only create tasks assigned to themselves. Managers
        # may pick anyone, or leave it unset — falls back to self rather
        # than erroring, since assignee is a required (non-nullable) field
        # on the model.
        if is_manager(self.request.user):
            task = serializer.save(assignee=serializer.validated_data.get("assignee") or self.request.user)
        else:
            task = serializer.save(assignee=self.request.user)
        log_activity(actor=self.request.user, action=f"added task \"{task.title}\"")

    @action(detail=False, methods=["get"])
    def my(self, request):
        """GET /api/tasks/my — the requesting user's own tasks (spec §8)."""
        qs = Task.objects.filter(assignee=request.user).select_related("project")
        page = self.paginate_queryset(qs)
        serializer = TaskSerializer(page if page is not None else qs, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)
