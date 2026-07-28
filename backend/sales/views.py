from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from common.permissions import IsManager

from .models import Client, Invoice, Proposal
from .serializers import ClientSerializer, InvoiceSerializer, ProposalSerializer


class ClientViewSet(viewsets.ModelViewSet):
    """Sales is manager-only (spec §6)."""

    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    permission_classes = [IsManager]
    search_fields = ["name", "company", "contact_email"]


class ProposalViewSet(viewsets.ModelViewSet):
    queryset = Proposal.objects.select_related("client").all()
    serializer_class = ProposalSerializer
    permission_classes = [IsManager]
    filterset_fields = ["status", "client"]


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related("client", "proposal").prefetch_related("line_items")
    serializer_class = InvoiceSerializer
    permission_classes = [IsManager]
    filterset_fields = ["status", "client"]

    @action(detail=True, methods=["post"])
    def pdf(self, request, pk=None):
        """POST /api/sales/invoices/{id}/pdf — generate invoice PDF (spec §6)."""
        invoice = self.get_object()
        # TODO: render invoice via WeasyPrint + upload to Object Storage.
        url = f"https://TODO-object-storage/invoices/{invoice.invoice_number}.pdf"
        return Response({"file_url": url})
