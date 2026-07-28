from rest_framework.routers import DefaultRouter

from .views import DailyTrackerViewSet

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
router.register("", DailyTrackerViewSet, basename="daily-tracker")

urlpatterns = router.urls
