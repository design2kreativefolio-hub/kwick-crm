from django.urls import path

from .views import NotificationListView, PushSubscribeView

urlpatterns = [
    path("push-subscribe", PushSubscribeView.as_view(), name="push-subscribe"),
    path("", NotificationListView.as_view(), name="notifications-list"),
]
