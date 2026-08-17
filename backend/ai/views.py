from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsActive

from . import services
from .models import Conversation
from .serializers import ConversationDetailSerializer, ConversationListSerializer
from .tts import synthesize_speech, tts_configured


class AiStatusView(APIView):
    permission_classes = [IsActive]

    def get(self, request):
        return Response(services.ai_status())


class ConversationListCreateView(APIView):
    """GET list / POST create new empty chat."""

    permission_classes = [IsActive]

    def get(self, request):
        services.purge_stale_for_user(request.user)
        qs = Conversation.objects.filter(user=request.user).prefetch_related("messages")
        return Response(ConversationListSerializer(qs, many=True).data)

    def post(self, request):
        services.purge_stale_for_user(request.user)
        conv = Conversation.objects.create(user=request.user, title="New chat")
        return Response(ConversationDetailSerializer(conv).data, status=201)


class ConversationDetailView(APIView):
    permission_classes = [IsActive]

    def get(self, request, pk):
        services.purge_stale_for_user(request.user)
        conv = get_object_or_404(Conversation, pk=pk, user=request.user)
        return Response(ConversationDetailSerializer(conv).data)

    def delete(self, request, pk):
        conv = get_object_or_404(Conversation, pk=pk, user=request.user)
        conv.delete()
        return Response(status=204)


class AiChatView(APIView):
    """POST { message, conversation_id?, images? } — replies and persists history."""

    permission_classes = [IsActive]

    def post(self, request):
        message = (request.data.get("message") or "").strip()
        images = request.data.get("images") or []
        if not isinstance(images, list):
            images = []

        if not message:
            raw = request.data.get("messages") or []
            if isinstance(raw, list) and raw:
                last = raw[-1] if isinstance(raw[-1], dict) else {}
                message = (last.get("content") or "").strip()
        if not message and not images:
            return Response({"detail": "message or images is required."}, status=400)
        if len(message) > 4000:
            return Response({"detail": "Message too long."}, status=400)

        conv = services.ensure_conversation(request.user, request.data.get("conversation_id"))
        history = [
            {
                "role": m.role,
                "content": m.content,
                "attachments": m.attachments or [],
            }
            for m in conv.messages.order_by("created_at")
        ]
        history.append({"role": "user", "content": message, "attachments": []})
        result = services.chat(request.user, history, conversation=conv, images=images)
        services.append_exchange(conv, message, result)
        conv.refresh_from_db()
        return Response(
            {
                "conversation_id": conv.id,
                "title": conv.title,
                "reply": result.get("reply") or "",
                "links": result.get("links") or [],
                "cards": result.get("cards") or {},
                "attachments": result.get("attachments") or [],
                "messages": ConversationDetailSerializer(conv).data["messages"],
            }
        )


class AiTtsView(APIView):
    """POST { text } → audio/mpeg (ElevenLabs). Falls back with 503 if unconfigured."""

    permission_classes = [IsActive]

    def post(self, request):
        if not tts_configured():
            return Response({"detail": "ElevenLabs voice is not configured."}, status=503)

        text = (request.data.get("text") or "").strip()
        if not text:
            return Response({"detail": "text is required."}, status=400)

        try:
            audio = synthesize_speech(text)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        except RuntimeError as exc:
            return Response({"detail": str(exc)}, status=502)

        return HttpResponse(audio, content_type="audio/mpeg")
