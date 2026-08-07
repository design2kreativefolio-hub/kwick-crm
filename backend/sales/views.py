import uuid

from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from accounts.models import Module
from common.permissions import HasModuleAccess
from common.services import log_activity

from .models import Client, Estimate, Invoice, Proposal
from .estimate_pdf import render_estimate_pdf
from .invoice_pdf import render_invoice_pdf
from .proposal_docx import render_proposal_docx
from .proposal_pdf import render_proposal_pdf
from .serializers import ClientSerializer, EstimateSerializer, InvoiceSerializer, ProposalSerializer


class ClientViewSet(viewsets.ModelViewSet):
    """Sales is superadmin-only, or anyone granted Sales access (spec §6)."""

    queryset = Client.objects.all()
    serializer_class = ClientSerializer
    permission_classes = [HasModuleAccess]
    required_module = Module.SALES
    search_fields = ["name", "company", "contact_email", "website"]

    def perform_create(self, serializer):
        client = serializer.save()
        log_activity(actor=self.request.user, action=f"added client \"{client.name}\"")

    def perform_update(self, serializer):
        client = serializer.save()
        log_activity(actor=self.request.user, action=f"edited client \"{client.name}\"")

    def perform_destroy(self, instance):
        name = instance.name
        instance.delete()
        log_activity(actor=self.request.user, action=f"deleted client \"{name}\"")

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def upload_file(self, request, pk=None):
        """POST /api/sales/clients/{id}/upload_file — trade license, VAT,
        additional-field attachments, etc. Returns { url }."""
        client = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "file is required."}, status=status.HTTP_400_BAD_REQUEST)

        from django.core.files.storage import default_storage

        ext = upload.name.rsplit(".", 1)[-1].lower() if "." in upload.name else "bin"
        key = f"client-files/{client.pk}/{uuid.uuid4().hex}.{ext}"
        saved_path = default_storage.save(key, upload)
        return Response({"url": request.build_absolute_uri(default_storage.url(saved_path))})

    @action(detail=True, methods=["post"], parser_classes=[MultiPartParser, FormParser])
    def logo(self, request, pk=None):
        """POST /api/sales/clients/{id}/logo — same logo used by Projects >
        Clients (shared Client.logo_url)."""
        client = self.get_object()
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "file is required."}, status=status.HTTP_400_BAD_REQUEST)

        from django.core.files.storage import default_storage

        ext = upload.name.rsplit(".", 1)[-1].lower() if "." in upload.name else "png"
        key = f"client-logos/{client.pk}.{ext}"
        if default_storage.exists(key):
            default_storage.delete(key)
        saved_path = default_storage.save(key, upload)
        client.logo_url = request.build_absolute_uri(default_storage.url(saved_path))
        client.save(update_fields=["logo_url"])
        return Response({"logo_url": client.logo_url})


class ProposalViewSet(viewsets.ModelViewSet):
    queryset = Proposal.objects.select_related("client").all()
    serializer_class = ProposalSerializer
    permission_classes = [HasModuleAccess]
    required_module = Module.SALES
    filterset_fields = ["status", "client"]

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """POST /api/sales/proposals/{id}/duplicate — clone as draft `title_duplicate`."""
        from common.duplicate import deep_copy_json, duplicate_label

        src = self.get_object()
        content = deep_copy_json(src.content)
        base = (src.title or (content.get("home") or {}).get("title") or "Untitled Proposal").strip()
        new_title = duplicate_label(
            base,
            exists=lambda t: Proposal.objects.filter(title=t).exists(),
        )
        # Keep cover heading (content.home.title) as-is; only CRM/list name changes.
        clone = Proposal.objects.create(
            client=src.client,
            title=new_title,
            status=Proposal.Status.DRAFT,
            content=content,
        )
        return Response(ProposalSerializer(clone).data, status=status.HTTP_201_CREATED)

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


class EstimateViewSet(viewsets.ModelViewSet):
    queryset = Estimate.objects.select_related("client").all()
    serializer_class = EstimateSerializer
    permission_classes = [HasModuleAccess]
    required_module = Module.SALES
    filterset_fields = ["status", "client"]

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """POST /api/sales/estimates/{id}/duplicate — clone as draft `title_duplicate`."""
        from common.duplicate import deep_copy_json, duplicate_label

        src = self.get_object()
        content = deep_copy_json(src.content)
        base = (content.get("quote_number") or src.title or "Untitled Estimate").strip()
        new_label = duplicate_label(
            base,
            exists=lambda t: Estimate.objects.filter(title=t).exists()
            or Estimate.objects.filter(content__quote_number=t).exists(),
        )
        if content.get("quote_number"):
            content["quote_number"] = new_label
        bill_to = (content.get("bill_to") or "").strip()
        title = f"{new_label} — {bill_to}" if bill_to else new_label
        clone = Estimate.objects.create(
            client=src.client,
            title=title,
            status=Estimate.Status.DRAFT,
            content=content,
        )
        return Response(EstimateSerializer(clone).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def pdf(self, request, pk=None):
        """POST /api/sales/estimates/{id}/pdf — render the quote PDF."""
        estimate = self.get_object()
        url = render_estimate_pdf(estimate, request)
        return Response({"file_url": url})


class InvoiceViewSet(viewsets.ModelViewSet):
    queryset = Invoice.objects.select_related("client", "proposal").prefetch_related("line_items")
    serializer_class = InvoiceSerializer
    permission_classes = [HasModuleAccess]
    required_module = Module.SALES
    filterset_fields = ["status", "client"]

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """POST /api/sales/invoices/{id}/duplicate — clone as draft `name_duplicate`."""
        from common.duplicate import deep_copy_json, duplicate_label

        src = self.get_object()
        content = deep_copy_json(src.content)
        base_title = (content.get("title") or src.invoice_number or f"Invoice #{src.pk}").strip()
        content["title"] = duplicate_label(base_title)
        base_number = (src.invoice_number or content.get("invoice_number") or f"Invoice-{src.pk}").strip()
        new_number = duplicate_label(
            base_number,
            exists=lambda n: Invoice.objects.filter(invoice_number=n).exists(),
        )
        content["invoice_number"] = new_number
        clone = Invoice.objects.create(
            client=src.client,
            proposal=src.proposal,
            invoice_number=new_number,
            amount=src.amount,
            status=Invoice.Status.DRAFT,
            due_date=src.due_date,
            content=content,
        )
        return Response(InvoiceSerializer(clone).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def pdf(self, request, pk=None):
        """POST /api/sales/invoices/{id}/pdf — render the invoice PDF."""
        invoice = self.get_object()
        url = render_invoice_pdf(invoice, request)
        return Response({"file_url": url})
