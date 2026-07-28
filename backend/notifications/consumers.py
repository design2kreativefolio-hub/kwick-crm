from channels.generic.websocket import AsyncJsonWebsocketConsumer


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    """
    In-app toast channel. The client connects once after login; the server
    pushes NotificationEvents to `notify_{user_id}` (spec §13).
    """

    async def connect(self):
        user = self.scope.get("user")
        if user is None or not user.is_authenticated:
            await self.close(code=4401)
            return
        self.group = f"notify_{user.id}"
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def disconnect(self, code):
        if hasattr(self, "group"):
            await self.channel_layer.group_discard(self.group, self.channel_name)

    async def notify_event(self, event):
        await self.send_json(event["payload"])
