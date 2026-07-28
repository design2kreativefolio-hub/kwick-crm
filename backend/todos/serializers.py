from rest_framework import serializers

from .models import TodoItem


class TodoItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = TodoItem
        fields = ["id", "owner", "text", "done", "done_at", "created_at"]
        read_only_fields = ["owner", "done_at", "created_at"]
