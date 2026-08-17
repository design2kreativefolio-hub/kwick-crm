from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer


class ChatConsumer(AsyncJsonWebsocketConsumer):
    """
    Real-time chat over a per-conversation group (spec §12). Auth comes from the
    JWTAuthMiddleware; a user may only join conversations they participate in.
    """

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.conversation_id = self.scope["url_route"]["kwargs"]["conversation_id"]
        if not await self._is_participant(user.id, self.conversation_id):
            await self.close(code=4403)
            return
        self.group = f"chat_{self.conversation_id}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive_json(self, content):
        body = (content or {}).get("body", "").strip()
        if not body:
            return
        message = await self._save_message(
            self.scope["user"].id, self.conversation_id, body
        )
        await self.channel_layer.group_send(
            self.group, {"type": "chat.message", "payload": message}
        )
        # Mirror to every other participant's personal notify channel so a
        # globally-connected client (not just whoever has this conversation
        # open) can pop a toast and bump their chat unread badge.
        other_ids = await self._other_participant_ids(self.scope["user"].id, self.conversation_id)
        chat_payload = {
            "kind": "chat_message",
            "conversation_id": int(self.conversation_id),
            "sender_name": message.get("sender_name") or "Someone",
            "preview": message.get("body") or "Sent an attachment",
        }
        for uid in other_ids:
            await self.channel_layer.group_send(
                f"notify_{uid}",
                {"type": "notify_event", "payload": chat_payload},
            )
        await self._web_push_chat(other_ids, chat_payload)

    async def chat_message(self, event):
        await self.send_json(event["payload"])

    async def chat_cleared(self, event):
        await self.send_json({"event": "cleared", **event["payload"]})

    async def chat_deleted(self, event):
        await self.send_json({"event": "deleted", **event["payload"]})

    async def chat_members_updated(self, event):
        await self.send_json({"event": "members_updated", "conversation": event["payload"]})

    async def chat_kicked(self, event):
        await self.send_json({"event": "kicked", **event["payload"]})

    @database_sync_to_async
    def _web_push_chat(self, user_ids, payload):
        from notifications.tasks import send_web_push_payload

        push_payload = {
            **payload,
            "source": "chat",
            "title": payload.get("sender_name") or "New message",
            "body": payload.get("preview") or "New chat message",
        }
        for uid in user_ids:
            send_web_push_payload.delay(uid, push_payload)

    @database_sync_to_async
    def _is_participant(self, user_id, conversation_id):
        from .models import Conversation

        return Conversation.objects.filter(
            pk=conversation_id, participants__id=user_id
        ).exists()

    @database_sync_to_async
    def _other_participant_ids(self, user_id, conversation_id):
        from .models import Conversation

        return list(
            Conversation.objects.get(pk=conversation_id)
            .participants.exclude(pk=user_id)
            .values_list("id", flat=True)
        )

    @database_sync_to_async
    def _save_message(self, user_id, conversation_id, body):
        from common.media_urls import user_avatar_url

        from .models import Message

        msg = Message.objects.create(
            conversation_id=conversation_id, sender_id=user_id, body=body
        )
        msg = Message.objects.select_related("sender__profile").get(pk=msg.pk)
        return {
            "id": msg.id,
            "conversation": conversation_id,
            "sender": user_id,
            "sender_name": msg.sender.full_name,
            "sender_avatar_url": user_avatar_url(msg.sender),
            "body": msg.body,
            "is_system": False,
            "attachment_url": "",
            "attachment_type": "",
            "attachment_name": "",
            "created_at": msg.created_at.isoformat(),
        }
