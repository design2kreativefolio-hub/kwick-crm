from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import AgendaView, ManualReminderViewSet

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
router.register("reminders", ManualReminderViewSet, basename="reminders")

urlpatterns = [
    path("agenda", AgendaView.as_view(), name="calendar-agenda"),
]
urlpatterns += router.urls
