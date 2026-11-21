from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    ActivityViewSet,
    CaptureSourceViewSet,
    DealViewSet,
    FollowUpViewSet,
    LeadViewSet,
    MailStatusView,
    MetaRefreshView,
    MyDayView,
    PipelineView,
    ReportView,
)

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
router.register("leads", LeadViewSet, basename="bd-leads")
router.register("deals", DealViewSet, basename="bd-deals")
router.register("activities", ActivityViewSet, basename="bd-activities")
router.register("follow-ups", FollowUpViewSet, basename="bd-follow-ups")
router.register("capture-sources", CaptureSourceViewSet, basename="bd-capture-sources")

urlpatterns = [
    path("my-day", MyDayView.as_view(), name="bd-my-day"),
    path("pipeline", PipelineView.as_view(), name="bd-pipeline"),
    path("mail-status", MailStatusView.as_view(), name="bd-mail-status"),
    path("meta/refresh", MetaRefreshView.as_view(), name="bd-meta-refresh"),
    path("reports", ReportView.as_view(), name="bd-reports"),
    *router.urls,
]
