import uuid

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsActive

from .models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer

User = get_user_model()

MAX_ATTACHMENT_SIZE = 30 * 1024 * 1024  # 30MB
IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}
VIDEO_EXTENSIONS = {"mp4", "mov", "webm", "m4v"}
DOCUMENT_EXTENSIONS = {"pdf"}


def notify_participants(conversation, exclude_user_id, payload):
    """Push an ephemeral event to every other participant's personal channel
    (spec §13's notify_{user_id} group) so a globally-connected client can pop
    a toast / bump the chat badge, without persisting a NotificationEvent row
    for every single chat message. Shared by the REST attachment endpoint and
    the ChatConsumer WebSocket handler."""
    layer = get_channel_layer()
    if layer is None:
        return
    for uid in conversation.participants.exclude(pk=exclude_user_id).values_list("id", flat=True):
        async_to_sync(layer.group_send)(f"notify_{uid}", {"type": "notify_event", "payload": payload})


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

    def create(self, request, *args, **kwargs):
        """
        POST {"participant": <user_id>} — find-or-create the 1:1 conversation
        with that user, rather than spawning a duplicate thread every click.

        POST {"participants": [<id>, <id>, ...], "name": "..."} — always
        creates a fresh group conversation (groups aren't deduped).
        """
        participant_ids = request.data.get("participants")
        if participant_ids:
            if len(participant_ids) < 2:
                return Response({"detail": "A group needs at least 2 other members."}, status=400)
            name = (request.data.get("name") or "").strip() or "Group Chat"
            convo = Conversation.objects.create(is_group=True, name=name, created_by=request.user)
            convo.participants.add(request.user, *participant_ids)
            return Response(
                ConversationSerializer(convo, context=self.get_serializer_context()).data, status=201
            )

        other_id = request.data.get("participant")
        if not other_id:
            return Response({"detail": "participant is required."}, status=400)
        # Two chained M2M .filter() calls each add their own join; annotating
        # a Count straight on top of that double-joined queryset inflates the
        # count. Resolve the candidate IDs first, then re-query cleanly so the
        # Count annotation only ever sees a single join.
        candidate_ids = (
            Conversation.objects.filter(is_group=False, participants=request.user)
            .filter(participants=other_id)
            .values_list("id", flat=True)
        )
        existing = (
            Conversation.objects.filter(id__in=list(candidate_ids))
            .annotate(pcount=Count("participants", distinct=True))
            .filter(pcount=2)
            .first()
        )
        if existing:
            return Response(ConversationSerializer(existing, context=self.get_serializer_context()).data)
        convo = Conversation.objects.create()
        convo.participants.add(request.user, other_id)
        return Response(
            ConversationSerializer(convo, context=self.get_serializer_context()).data, status=201
        )

    @action(detail=True, methods=["get"])
    def messages(self, request, pk=None):
        """GET /api/messages/conversations/{id}/messages (spec §12)."""
        convo = self.get_object()
        qs = convo.messages.select_related("sender")
        return Response(MessageSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        """POST /api/messages/conversations/{id}/read — mark the thread seen."""
        convo = self.get_object()
        unread = convo.messages.exclude(sender=request.user).exclude(read_by=request.user)
        for msg in unread:
            msg.read_by.add(request.user)
        return Response({"detail": "ok"})


class MessageAttachmentView(APIView):
    """
    POST /api/messages/conversations/{id}/attachments — image/video upload.
    A standalone APIView (not a ViewSet @action) because DRF resolves parsers
    via get_parsers() before self.action is set on a ViewSet, so a per-action
    multipart switch there never actually takes effect — this mirrors the
    already-working AvatarUploadView pattern instead.

    Sent over REST rather than the chat WebSocket (which only carries JSON
    text), then mirrored into the conversation's live channel group so it
    still shows up instantly for whoever's connected.
    """

    permission_classes = [IsActive]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        convo = get_object_or_404(Conversation, pk=pk, participants=request.user)
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "file is required."}, status=400)
        if upload.size > MAX_ATTACHMENT_SIZE:
            return Response({"detail": "File is too large (30MB limit)."}, status=400)

        ext = upload.name.rsplit(".", 1)[-1].lower() if "." in upload.name else ""
        if ext in IMAGE_EXTENSIONS:
            kind = Message.AttachmentType.IMAGE
        elif ext in VIDEO_EXTENSIONS:
            kind = Message.AttachmentType.VIDEO
        elif ext in DOCUMENT_EXTENSIONS:
            kind = Message.AttachmentType.DOCUMENT
        else:
            return Response({"detail": "Unsupported file type."}, status=400)

        key = f"chat_attachments/{convo.pk}/{uuid.uuid4().hex}.{ext}"
        saved_path = default_storage.save(key, upload)

        message = Message.objects.create(
            conversation=convo,
            sender=request.user,
            body="",
            # default_storage.url() is host-relative for local FileSystemStorage
            # (e.g. "/media/chat_attachments/..."), which resolves against the
            # wrong origin when frontend/backend are on different ports/domains.
            # build_absolute_uri() fixes that; no-op for already-absolute S3 URLs.
            attachment_url=request.build_absolute_uri(default_storage.url(saved_path)),
            attachment_type=kind,
            attachment_name=upload.name,
        )
        payload = MessageSerializer(message).data

        layer = get_channel_layer()
        if layer is not None:
            async_to_sync(layer.group_send)(f"chat_{convo.pk}", {"type": "chat.message", "payload": payload})
        notify_participants(
            convo,
            request.user.pk,
            {
                "kind": "chat_message",
                "conversation_id": convo.pk,
                "sender_name": request.user.full_name or request.user.email,
                "preview": "Sent an attachment",
            },
        )
        return Response(payload, status=201)


class DirectoryView(APIView):
    """GET /api/messages/directory — active colleagues you can start a chat with."""

    permission_classes = [IsActive]

    def get(self, request):
        qs = User.objects.filter(status="active").exclude(pk=request.user.pk).order_by("full_name")
        data = [
            {"id": u.id, "full_name": u.full_name, "email": u.email, "role": u.role} for u in qs
        ]
        return Response(data)
