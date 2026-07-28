from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import InviteCode, StaffProfile, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ["email"]
    list_display = ["email", "full_name", "role", "status", "is_staff"]
    list_filter = ["role", "status", "is_staff"]
    search_fields = ["email", "full_name"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal", {"fields": ("full_name",)}),
        ("Role & status", {"fields": ("role", "status")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "password1", "password2", "role", "status")}),
    )


admin.site.register(StaffProfile)
admin.site.register(InviteCode)
