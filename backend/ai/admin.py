# Removable EDITH module — see apps.py for uninstall steps.
from django.contrib import admin

from .models import Conversation, Message


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ("id", "title", "user", "updated_at", "created_at")
    list_filter = ("updated_at",)
    search_fields = ("title", "user__email", "user__full_name")


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ("id", "conversation", "role", "created_at")
    list_filter = ("role",)
