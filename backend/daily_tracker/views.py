from rest_framework import viewsets

from common.permissions import IsActive, is_superadmin

from .models import DailyTrackerEntry
from .serializers import DailyTrackerEntrySerializer


class DailyTrackerViewSet(viewsets.ModelViewSet):
    """Own entries only; manager can filter by ?user= (spec §9)."""

    serializer_class = DailyTrackerEntrySerializer
    permission_classes = [IsActive]
    filterset_fields = ["date"]

    def get_queryset(self):
        qs = DailyTrackerEntry.objects.select_related("user")
        if is_superadmin(self.request.user):
            user = self.request.query_params.get("user")
            return qs.filter(user_id=user) if user else qs
        return qs.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
