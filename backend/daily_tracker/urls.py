from rest_framework.routers import DefaultRouter

from .views import DailyTrackerViewSet

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
# Named prefix (not "") — see config/urls.py for why.
router.register("daily-tracker", DailyTrackerViewSet, basename="daily-tracker")

urlpatterns = router.urls
