from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from projects.urls import bare_urlpatterns as project_bare_urlpatterns

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/hr/", include("hr.urls")),
    path("api/sales/", include("sales.urls")),
    path("api/projects/", include("projects.urls")),
    path("api/calendar/", include("calendar_app.urls")),
    path("api/kanban/", include("kanban.urls")),
    path("api/messages/", include("messaging.urls")),
    path("api/notifications/", include("notifications.urls")),
    path("api/dashboard/", include("dashboard.urls")),
    path("api/reports/", include("reports.urls")),
    # These routers register their ViewSet under an empty prefix ("") so the
    # resource name lives entirely in the router itself (e.g. "tasks",
    # "todos") rather than being split between here and the app's urls.py.
    # DRF strips the router's own leading slash whenever prefix="" (see
    # SimpleRouter.get_urls — it assumes an include() ending in "/" supplies
    # that separator instead). Mounting bare at "api/" avoids that trap
    # entirely: it keeps list ("api/tasks") AND detail ("api/tasks/5")
    # working with no trailing slash anywhere, matching every other app's
    # convention. A request for another app's path (e.g. "/api/hr/staff")
    # simply fails to match here and Django falls through to the next
    # urlpatterns entry, so ordering relative to the other apps doesn't matter.
    path("api/", include("tasks.urls")),
    path("api/", include("daily_tracker.urls")),
    path("api/", include("renewals.urls")),
    path("api/", include("todos.urls")),
    # ProjectViewSet lives here too, not under "api/projects/" above — see
    # the comment in projects/urls.py for why (same empty-prefix trap).
    path("api/", include(project_bare_urlpatterns)),
]

if settings.DEBUG and not settings.S3_ENABLED:
    # Locally uploaded media (avatars, etc.) — nginx serves this in production instead.
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
