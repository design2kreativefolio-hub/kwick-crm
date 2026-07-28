from rest_framework import viewsets

from common.permissions import IsActive

from .models import TodoItem
from .serializers import TodoItemSerializer


class TodoItemViewSet(viewsets.ModelViewSet):
    serializer_class = TodoItemSerializer
    permission_classes = [IsActive]

    def get_queryset(self):
        return TodoItem.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)
