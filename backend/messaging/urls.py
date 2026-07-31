from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ConversationViewSet, DirectoryView, MessageAttachmentView

router = DefaultRouter(trailing_slash=False)  # frontend calls without trailing slash
router.register("conversations", ConversationViewSet, basename="conversations")

urlpatterns = [
    path("directory", DirectoryView.as_view(), name="messages-directory"),
    path(
        "conversations/<int:pk>/attachments",
        MessageAttachmentView.as_view(),
        name="messages-attachment",
    ),
]
urlpatterns += router.urls
