from django.urls import path

from .views import PerformanceView, ProjectsTrendView, RemindersView, SummaryView

urlpatterns = [
    path("summary", SummaryView.as_view(), name="dashboard-summary"),
    path("reminders", RemindersView.as_view(), name="dashboard-reminders"),
    path("performance", PerformanceView.as_view(), name="dashboard-performance"),
    path("projects-trend", ProjectsTrendView.as_view(), name="dashboard-projects-trend"),
]
