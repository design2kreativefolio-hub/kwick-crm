from django.contrib import admin

from .models import ManualReminder


@admin.register(ManualReminder)
class ManualReminderAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "remind_at", "recurrence", "done", "visibility")
    list_filter = ("recurrence", "done", "visibility")
    filter_horizontal = ("assignees",)
