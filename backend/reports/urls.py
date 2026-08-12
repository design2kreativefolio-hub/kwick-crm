from django.urls import path

from .views import ReportGenerateView, ReportOptionsView, ReportPdfView, ReportSummaryView

urlpatterns = [
    path("summary", ReportSummaryView.as_view(), name="reports-summary"),
    path("options", ReportOptionsView.as_view(), name="reports-options"),
    path("generate", ReportGenerateView.as_view(), name="reports-generate"),
    path("pdf", ReportPdfView.as_view(), name="reports-pdf"),
]
