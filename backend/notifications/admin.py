from django.contrib import admin

from .models import DashboardCardDismiss, NotificationEvent, PushSubscription


@admin.register(NotificationEvent)
class NotificationEventAdmin(admin.ModelAdmin):
    list_display = ["source", "title", "user", "recurring", "active", "sent_at"]
    list_filter = ["source", "recurring", "active"]


@admin.register(DashboardCardDismiss)
class DashboardCardDismissAdmin(admin.ModelAdmin):
    list_display = ["user", "kind", "object_id", "created_at"]
    list_filter = ["kind"]


admin.site.register(PushSubscription)
