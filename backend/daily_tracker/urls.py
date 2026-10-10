from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import DailyTrackerViewSet, TimeTrackerView

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
# Named prefix (not "") — see config/urls.py for why.
router.register("daily-tracker", DailyTrackerViewSet, basename="daily-tracker")

urlpatterns = [
    path("time-tracker", TimeTrackerView.as_view()),
    path("time-tracker/<str:action>", TimeTrackerView.as_view()),
] + router.urls
