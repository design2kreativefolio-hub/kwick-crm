from django.urls import path

from .views import (
    ActivityLogListView,
    GlobalSearchView,
    PerformanceView,
    ProjectsTrendView,
    ReminderDismissView,
    ReminderRestoreView,
    RemindersView,
    SummaryView,
    SupportContactView,
    TodayTasksView,
)

urlpatterns = [
    path("summary", SummaryView.as_view(), name="dashboard-summary"),
    path("reminders", RemindersView.as_view(), name="dashboard-reminders"),
    path("reminders/dismiss", ReminderDismissView.as_view(), name="dashboard-reminders-dismiss"),
    path("reminders/restore", ReminderRestoreView.as_view(), name="dashboard-reminders-restore"),
    path("performance", PerformanceView.as_view(), name="dashboard-performance"),
    path("projects-trend", ProjectsTrendView.as_view(), name="dashboard-projects-trend"),
    path("search", GlobalSearchView.as_view(), name="dashboard-search"),
    path("logs", ActivityLogListView.as_view(), name="dashboard-logs"),
    path("today-tasks", TodayTasksView.as_view(), name="dashboard-today-tasks"),
    path("support", SupportContactView.as_view(), name="dashboard-support"),
]
