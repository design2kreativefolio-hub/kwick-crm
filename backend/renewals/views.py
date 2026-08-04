from rest_framework import viewsets

from accounts.models import Module
from common.permissions import HasModuleAccess

from .models import Renewal
from .serializers import RenewalSerializer


class RenewalViewSet(viewsets.ModelViewSet):
    """Superadmin, or anyone granted Renewals access, manages this (spec §14).
    Filterable by subject_type/client/staff."""

    queryset = Renewal.objects.select_related("client", "staff").all()
    serializer_class = RenewalSerializer
    permission_classes = [HasModuleAccess]
    required_module = Module.RENEWALS
    filterset_fields = ["subject_type", "client", "staff", "renewal_type", "status"]
