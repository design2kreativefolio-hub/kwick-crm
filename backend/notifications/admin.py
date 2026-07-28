from django.contrib import admin

from .models import NotificationEvent, PushSubscription


@admin.register(NotificationEvent)
class NotificationEventAdmin(admin.ModelAdmin):
    list_display = ["source", "title", "user", "recurring", "active", "sent_at"]
    list_filter = ["source", "recurring", "active"]


admin.site.register(PushSubscription)
