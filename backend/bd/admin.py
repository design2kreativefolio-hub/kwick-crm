from django.contrib import admin

from .models import Activity, Deal, FollowUp, Lead


@admin.register(Lead)
class LeadAdmin(admin.ModelAdmin):
    list_display = ("display_name", "owner", "source", "status", "created_at")
    list_filter = ("status", "source")
    search_fields = ("company", "contact_name", "phone", "email")


@admin.register(Deal)
class DealAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "stage", "value", "currency")
    list_filter = ("stage",)


@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ("lead", "kind", "user", "occurred_at")


@admin.register(FollowUp)
class FollowUpAdmin(admin.ModelAdmin):
    list_display = ("lead", "owner", "kind", "due_at", "done_at")
