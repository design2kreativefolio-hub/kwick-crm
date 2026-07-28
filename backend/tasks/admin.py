from django.contrib import admin

from .models import Task


@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ["title", "assignee", "status", "priority", "due_date", "completed_at"]
    list_filter = ["status", "priority", "board_status"]
    search_fields = ["title"]
