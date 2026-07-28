from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/hr/", include("hr.urls")),
    path("api/sales/", include("sales.urls")),
    path("api/projects/", include("projects.urls")),
    path("api/tasks/", include("tasks.urls")),
    path("api/daily-tracker/", include("daily_tracker.urls")),
    path("api/calendar/", include("calendar_app.urls")),
    path("api/kanban/", include("kanban.urls")),
    path("api/messages/", include("messaging.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/renewals/", include("renewals.urls")),
    path("api/dashboard/", include("dashboard.urls")),
    path("api/reports/", include("reports.urls")),
]
