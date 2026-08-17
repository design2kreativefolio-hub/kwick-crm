from django.contrib import admin

from .models import SiteConfig


@admin.register(SiteConfig)
class SiteConfigAdmin(admin.ModelAdmin):
    list_display = ["id", "maintenance_mode", "updated_at"]
