from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from common.permissions import IsActive

from .models import NotificationEvent, PushSubscription
from .serializers import NotificationEventSerializer, PushSubscriptionSerializer


class PushSubscribeView(APIView):
    permission_classes = [IsActive]

    def post(self, request):
        serializer = PushSubscriptionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        sub, _ = PushSubscription.objects.update_or_create(
            endpoint=serializer.validated_data["endpoint"],
            defaults={"user": request.user, "keys": serializer.validated_data["keys"]},
        )
        return Response(PushSubscriptionSerializer(sub).data, status=status.HTTP_201_CREATED)

    def delete(self, request):
        endpoint = request.data.get("endpoint")
        PushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationListView(APIView):
    permission_classes = [IsActive]

    def get(self, request):
        qs = NotificationEvent.objects.filter(user=request.user)[:100]
        return Response(NotificationEventSerializer(qs, many=True).data)
