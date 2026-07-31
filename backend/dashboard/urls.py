from django.urls import path

from .views import (
    ActivityLogListView,
    GlobalSearchView,
    PerformanceView,
    ProjectsTrendView,
    RemindersView,
    SummaryView,
    TodayTasksView,
)

urlpatterns = [
    path("summary", SummaryView.as_view(), name="dashboard-summary"),
    path("reminders", RemindersView.as_view(), name="dashboard-reminders"),
    path("performance", PerformanceView.as_view(), name="dashboard-performance"),
    path("projects-trend", ProjectsTrendView.as_view(), name="dashboard-projects-trend"),
    path("search", GlobalSearchView.as_view(), name="dashboard-search"),
    path("logs", ActivityLogListView.as_view(), name="dashboard-logs"),
    path("today-tasks", TodayTasksView.as_view(), name="dashboard-today-tasks"),
]
