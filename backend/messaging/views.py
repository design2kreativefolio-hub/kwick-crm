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

from common.maintenance import exclude_system_accounts, reject_system_user_ids
from common.permissions import IsActive

from .models import Conversation, Message
from .serializers import ConversationSerializer, MessageSerializer

User = get_user_model()

MAX_ATTACHMENT_SIZE = 30 * 1024 * 1024  # 30MB


def _display_name(user):
    return (user.full_name or user.email or "Someone").strip()


def _join_names(names):
    names = [n for n in names if n]
    if not names:
        return "someone"
    if len(names) == 1:
        return names[0]
    if len(names) == 2:
        return f"{names[0]} and {names[1]}"
    return f"{', '.join(names[:-1])} and {names[-1]}"


def _broadcast_message(convo, message):
    payload = MessageSerializer(message).data
    layer = get_channel_layer()
    if layer is not None:
        async_to_sync(layer.group_send)(
            f"chat_{convo.pk}", {"type": "chat.message", "payload": payload}
        )
    return payload


def _post_system_message(convo, actor, body):
    msg = Message.objects.create(
        conversation=convo,
        sender=actor,
        body=body,
        is_system=True,
    )
    return _broadcast_message(convo, msg)


def _broadcast_members_updated(convo, request):
    payload = ConversationSerializer(convo, context={"request": request}).data
    layer = get_channel_layer()
    if layer is not None:
        async_to_sync(layer.group_send)(
            f"chat_{convo.pk}",
            {"type": "chat.members_updated", "payload": payload},
        )
        for uid in convo.participants.values_list("id", flat=True):
            async_to_sync(layer.group_send)(
                f"notify_{uid}",
                {
                    "type": "notify_event",
                    "payload": {
                        "kind": "chat_members_updated",
                        "conversation_id": convo.pk,
                    },
                },
            )
    return payload


def notify_participants(conversation, exclude_user_id, payload):
    """Push an ephemeral event to every other participant's personal channel
    (spec §13's notify_{user_id} group) so a globally-connected client can pop
    a toast / bump the chat badge, without persisting a NotificationEvent row
    for every single chat message. Shared by the REST attachment endpoint and
    the ChatConsumer WebSocket handler.

    Also fans out a web-push so OS/system notifications still fire when the
    browser tab is closed or backgrounded.
    """
    from notifications.tasks import send_web_push_payload

    layer = get_channel_layer()
    recipient_ids = list(
        conversation.participants.exclude(pk=exclude_user_id).values_list("id", flat=True)
    )
    if layer is not None:
        for uid in recipient_ids:
            async_to_sync(layer.group_send)(
                f"notify_{uid}", {"type": "notify_event", "payload": payload}
            )

    # Desktop/OS notification via service worker (Celery).
    push_payload = {
        **payload,
        "source": "chat",
        "title": payload.get("sender_name") or "New message",
        "body": payload.get("preview") or "New chat message",
    }
    for uid in recipient_ids:
        send_web_push_payload.delay(uid, push_payload)


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
            safe_ids = reject_system_user_ids(participant_ids)
            convo = Conversation.objects.create(is_group=True, name=name, created_by=request.user)
            members = list(
                exclude_system_accounts(
                    User.objects.filter(pk__in=safe_ids, status="active")
                ).exclude(pk=request.user.pk)
            )
            if len(members) < 2:
                return Response({"detail": "A group needs at least 2 other members."}, status=400)
            convo.participants.add(request.user, *members)
            actor_name = _display_name(request.user)
            _post_system_message(convo, request.user, f"{actor_name} created group \"{name}\"")
            _post_system_message(
                convo,
                request.user,
                f"{actor_name} added {_join_names([_display_name(u) for u in members])}",
            )
            return Response(
                ConversationSerializer(convo, context=self.get_serializer_context()).data, status=201
            )

        other_id = request.data.get("participant")
        if not other_id:
            return Response({"detail": "participant is required."}, status=400)
        safe = reject_system_user_ids([other_id])
        if not safe:
            return Response({"detail": "That account is not available for chat."}, status=400)
        other_id = safe[0]
        other = User.objects.filter(pk=other_id, status="active").first()
        if not other:
            return Response({"detail": "User not found."}, status=400)
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
        qs = convo.messages.select_related("sender__profile")
        return Response(MessageSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def read(self, request, pk=None):
        """POST /api/messages/conversations/{id}/read — mark the thread seen."""
        convo = self.get_object()
        unread = (
            convo.messages.exclude(is_system=True)
            .exclude(sender=request.user)
            .exclude(read_by=request.user)
        )
        for msg in unread:
            msg.read_by.add(request.user)
        return Response({"detail": "ok"})

    @action(detail=True, methods=["post"])
    def members(self, request, pk=None):
        """POST /api/messages/conversations/{id}/members
        Body: { "add": [ids], "remove": [ids], "name": "optional new title" }
        Posts WhatsApp-style system messages for membership / rename changes.
        """
        convo = self.get_object()
        if not convo.is_group:
            return Response({"detail": "Only group chats can be edited."}, status=400)

        raw_add = request.data.get("add") or []
        raw_remove = request.data.get("remove") or []
        try:
            add_ids = {int(x) for x in raw_add}
            remove_ids = {int(x) for x in raw_remove}
        except (TypeError, ValueError):
            return Response({"detail": "add/remove must be lists of user ids."}, status=400)

        current_ids = set(convo.participants.values_list("id", flat=True))
        add_ids = set(reject_system_user_ids(add_ids)) - current_ids
        remove_ids &= current_ids

        if request.user.id in remove_ids and request.user.id not in add_ids:
            # Leaving the group is allowed as long as ≥2 members remain.
            pass

        projected = (current_ids | add_ids) - remove_ids
        if len(projected) < 2:
            return Response({"detail": "A group needs at least 2 members."}, status=400)

        actor_name = _display_name(request.user)
        added_users = list(
            exclude_system_accounts(User.objects.filter(pk__in=add_ids, status="active"))
        )
        removed_users = list(User.objects.filter(pk__in=remove_ids))

        if add_ids and len(added_users) != len(add_ids):
            return Response({"detail": "One or more users to add were not found."}, status=400)

        if added_users:
            convo.participants.add(*added_users)
            _post_system_message(
                convo,
                request.user,
                f"{actor_name} added {_join_names([_display_name(u) for u in added_users])}",
            )

        if removed_users:
            for u in removed_users:
                if u.id == request.user.id:
                    body = f"{actor_name} left"
                else:
                    body = f"{actor_name} removed {_display_name(u)}"
                _post_system_message(convo, request.user, body)
            convo.participants.remove(*removed_users)
            # Kick removed members' open sockets so they leave the thread live.
            layer = get_channel_layer()
            if layer is not None:
                async_to_sync(layer.group_send)(
                    f"chat_{convo.pk}",
                    {
                        "type": "chat.kicked",
                        "payload": {
                            "conversation_id": convo.pk,
                            "user_ids": [u.id for u in removed_users],
                        },
                    },
                )
                for u in removed_users:
                    async_to_sync(layer.group_send)(
                        f"notify_{u.id}",
                        {
                            "type": "notify_event",
                            "payload": {
                                "kind": "chat_removed",
                                "conversation_id": convo.pk,
                            },
                        },
                    )

        name_raw = request.data.get("name", None)
        if name_raw is not None:
            name = str(name_raw).strip()
            if name and name != convo.name:
                convo.name = name
                convo.save(update_fields=["name", "updated_at"])
                _post_system_message(
                    convo,
                    request.user,
                    f'{actor_name} changed the group name to "{name}"',
                )

        convo = Conversation.objects.prefetch_related("participants", "messages").get(pk=convo.pk)
        data = _broadcast_members_updated(convo, request)
        if request.user.id in {u.id for u in removed_users}:
            return Response({"detail": "left", "conversation_id": convo.pk})
        return Response(data)

    @action(detail=True, methods=["post"])
    def clear(self, request, pk=None):
        """POST /api/messages/conversations/{id}/clear — wipe message history,
        keep the conversation (so either side can keep chatting)."""
        convo = self.get_object()
        deleted, _ = convo.messages.all().delete()
        layer = get_channel_layer()
        if layer is not None:
            async_to_sync(layer.group_send)(
                f"chat_{convo.pk}",
                {
                    "type": "chat.cleared",
                    "payload": {"conversation_id": convo.pk, "cleared_by": request.user.pk},
                },
            )
        return Response({"detail": "ok", "deleted": deleted})

    def perform_destroy(self, instance):
        """DELETE /api/messages/conversations/{id} — remove the thread for
        everyone in it (messages cascade)."""
        conversation_id = instance.pk
        participant_ids = list(instance.participants.values_list("id", flat=True))
        instance.delete()
        layer = get_channel_layer()
        if layer is not None:
            async_to_sync(layer.group_send)(
                f"chat_{conversation_id}",
                {
                    "type": "chat.deleted",
                    "payload": {"conversation_id": conversation_id},
                },
            )
            for uid in participant_ids:
                async_to_sync(layer.group_send)(
                    f"notify_{uid}",
                    {
                        "type": "notify_event",
                        "payload": {
                            "kind": "chat_deleted",
                            "conversation_id": conversation_id,
                        },
                    },
                )


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

        from common.uploads import CHAT_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, validated_extension

        ext = validated_extension(upload, allowed=CHAT_EXTENSIONS, max_bytes=MAX_ATTACHMENT_SIZE)
        if ext in IMAGE_EXTENSIONS:
            kind = Message.AttachmentType.IMAGE
        elif ext in VIDEO_EXTENSIONS:
            kind = Message.AttachmentType.VIDEO
        else:
            kind = Message.AttachmentType.DOCUMENT

        key = f"chat_attachments/{convo.pk}/{uuid.uuid4().hex}.{ext}"
        saved_path = default_storage.save(key, upload)

        from common.media_urls import persist_storage_url

        message = Message.objects.create(
            conversation=convo,
            sender=request.user,
            body=(request.data.get("body") or "").strip()[:4000],
            attachment_url=persist_storage_url(request, saved_path, filename=upload.name),
            attachment_type=kind,
            attachment_name=upload.name,
        )
        payload = MessageSerializer(message).data

        layer = get_channel_layer()
        if layer is not None:
            async_to_sync(layer.group_send)(f"chat_{convo.pk}", {"type": "chat.message", "payload": payload})
        preview = (message.body[:80] if message.body else "Sent an attachment")
        notify_participants(
            convo,
            request.user.pk,
            {
                "kind": "chat_message",
                "conversation_id": convo.pk,
                "sender_name": request.user.full_name or request.user.email,
                "preview": preview,
            },
        )
        return Response(payload, status=201)


class DirectoryView(APIView):
    """GET /api/messages/directory — active colleagues you can start a chat with."""

    permission_classes = [IsActive]

    def get(self, request):
        qs = (
            exclude_system_accounts(User.objects.filter(status="active"))
            .exclude(pk=request.user.pk)
            .select_related("profile")
            .order_by("full_name")
        )
        from common.media_urls import user_avatar_url

        data = [
            {
                "id": u.id,
                "full_name": u.full_name,
                "email": u.email,
                "role": u.role,
                "avatar_url": user_avatar_url(u),
            }
            for u in qs
        ]
        return Response(data)
