import uuid

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import Module
from common.permissions import HasModuleAccess
from common.services import log_activity

from .models import Client, Invoice, Proposal
from .proposal_docx import render_proposal_docx
from .proposal_pdf import render_proposal_pdf
from .serializers import ClientSerializer, InvoiceSerializer, ProposalSerializer


class ClientViewSet(viewsets.ModelViewSet):
    """Sales is superadmin-only, or anyone granted Sales access (spec §6)."""

    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    permission_classes = [HasModuleAccess]
    required_module = Module.SALES
    search_fields = ["name", "company", "contact_email"]

    def perform_create(self, serializer):
        client = serializer.save()
        log_activity(actor=self.request.user, action=f"added client \"{client.name}\"")

    def perform_update(self, serializer):
        client = serializer.save()
        log_activity(actor=self.request.user, action=f"edited client \"{client.name}\"")


class ProposalViewSet(viewsets.ModelViewSet):
    queryset = Proposal.objects.select_related("client").all()
    serializer_class = ProposalSerializer
    permission_classes = [HasModuleAccess]
    required_module = Module.SALES
    filterset_fields = ["status", "client"]

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def upload_image(self, request, pk=None):
        """POST /api/sales/proposals/{id}/upload_image — used by every image
        field in the builder (cover background, section images, gallery
        images). Returns the URL to store back into content."""
        proposal = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "file is required."}, status=status.HTTP_400_BAD_REQUEST)

        from django.core.files.storage import default_storage

        ext = upload.name.rsplit(".", 1)[-1].lower() if "." in upload.name else "png"
        key = f"proposal-assets/{proposal.pk}/{uuid.uuid4().hex}.{ext}"
        saved_path = default_storage.save(key, upload)
        return Response({"url": request.build_absolute_uri(default_storage.url(saved_path))})

    @action(detail=True, methods=["post"])
    def pdf(self, request, pk=None):
        """POST /api/sales/proposals/{id}/pdf — render the builder content to
        a branded PDF and return its URL."""
        proposal = self.get_object()
        url = render_proposal_pdf(proposal, request)
        return Response({"file_url": url})

    @action(detail=True, methods=["post"])
    def docx(self, request, pk=None):
        """POST /api/sales/proposals/{id}/docx — same content, as an
        editable Word document."""
        proposal = self.get_object()
        url = render_proposal_docx(proposal, request)
        return Response({"file_url": url})


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related("client", "proposal").prefetch_related("line_items")
    serializer_class = InvoiceSerializer
    permission_classes = [HasModuleAccess]
    required_module = Module.SALES
    filterset_fields = ["status", "client"]

    @action(detail=True, methods=["post"])
    def pdf(self, request, pk=None):
        """POST /api/sales/invoices/{id}/pdf — generate invoice PDF (spec §6)."""
        invoice = self.get_object()
        # TODO: render invoice via WeasyPrint + upload to Object Storage.
        url = f"https://TODO-object-storage/invoices/{invoice.invoice_number}.pdf"
        return Response({"file_url": url})
