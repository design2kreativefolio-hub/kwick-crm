from django.contrib import admin

from .models import Artwork, ArtworkSequence, ArtworkType, CategoryCode, Project, ProjectClient


@admin.register(Project)
class ProjectAdmin(admin.ModelAdmin):
    list_display = ["name", "client", "status", "start_date", "end_date"]
    list_filter = ["status"]


@admin.register(Artwork)
class ArtworkAdmin(admin.ModelAdmin):
    list_display = ["artwork_id", "client", "brand", "category_code", "designer"]
    search_fields = ["artwork_id"]


admin.site.register(ArtworkSequence)
admin.site.register(ArtworkType)
admin.site.register(CategoryCode)
admin.site.register(ProjectClient)
