from rest_framework import viewsets

from common.permissions import IsManager

from .models import Renewal
from .serializers import RenewalSerializer


class RenewalViewSet(viewsets.ModelViewSet):
    """Manager-only to manage (spec §14). Filterable by subject_type/client/staff."""

    queryset = Renewal.objects.select_related("client", "staff").all()
    serializer_class = RenewalSerializer
    permission_classes = [IsManager]
    filterset_fields = ["subject_type", "client", "staff", "renewal_type", "status"]
