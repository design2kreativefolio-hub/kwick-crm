from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.permissions import IsActive

from .models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer


class ConversationViewSet(viewsets.ModelViewSet):
    """A user only sees conversations they participate in (spec §12)."""

    serializer_class = ConversationSerializer
    permission_classes = [IsActive]

    def get_queryset(self):
        return (
            Conversation.objects.filter(participants=self.request.user)
            .prefetch_related("participants", "messages")
            .distinct()
        )

    def perform_create(self, serializer):
        convo = serializer.save()
        convo.participants.add(self.request.user)

    @action(detail=True, methods=["get"])
    def messages(self, request, pk=None):
        """GET /api/messages/conversations/{id}/messages (spec §12)."""
        convo = self.get_object()
        qs = convo.messages.select_related("sender")
        return Response(MessageSerializer(qs, many=True).data)
