from django.contrib import admin

from .models import PasswordAccessLog, PasswordEntry, VaultSettings


@admin.register(PasswordEntry)
class PasswordEntryAdmin(admin.ModelAdmin):
    list_display = ("platform", "client_name", "username", "updated_at")
    search_fields = ("platform", "client_name", "username")
    readonly_fields = ("password_encrypted", "created_at", "updated_at")


@admin.register(VaultSettings)
class VaultSettingsAdmin(admin.ModelAdmin):
    list_display = ("id", "updated_at", "updated_by")


@admin.register(PasswordAccessLog)
class PasswordAccessLogAdmin(admin.ModelAdmin):
    list_display = ("user", "action", "client_label", "platform", "created_at")
    list_filter = ("action",)
