from django.contrib import admin

from .models import Renewal


@admin.register(Renewal)
class RenewalAdmin(admin.ModelAdmin):
    list_display = ["subject_type", "renewal_type", "due_date", "status"]
    list_filter = ["subject_type", "renewal_type", "status"]
