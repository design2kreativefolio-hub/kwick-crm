from django.urls import path

from .views import (
    AiChatView,
    AiStatusView,
    AiTtsView,
    ConversationDetailView,
    ConversationListCreateView,
)

urlpatterns = [
    path("status", AiStatusView.as_view(), name="ai-status"),
    path("chat", AiChatView.as_view(), name="ai-chat"),
    path("tts", AiTtsView.as_view(), name="ai-tts"),
    path("conversations", ConversationListCreateView.as_view(), name="ai-conversations"),
    path("conversations/<int:pk>", ConversationDetailView.as_view(), name="ai-conversation-detail"),
]
