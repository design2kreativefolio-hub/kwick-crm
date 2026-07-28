from rest_framework.routers import DefaultRouter

from .views import TaskViewSet

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
router.register("", TaskViewSet, basename="tasks")

urlpatterns = router.urls
