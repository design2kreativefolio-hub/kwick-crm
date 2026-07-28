from django.urls import path

from .views import (
    NotificationListView,
    NotificationMarkAllReadView,
    NotificationMarkReadView,
    NotificationMarkUnreadView,
    PushSubscribeView,
)

urlpatterns = [
    path("push-subscribe", PushSubscribeView.as_view(), name="push-subscribe"),
    path("read-all", NotificationMarkAllReadView.as_view(), name="notifications-read-all"),
    path("<int:pk>/read", NotificationMarkReadView.as_view(), name="notifications-read"),
    path("<int:pk>/unread", NotificationMarkUnreadView.as_view(), name="notifications-unread"),
    path("", NotificationListView.as_view(), name="notifications-list"),
]
