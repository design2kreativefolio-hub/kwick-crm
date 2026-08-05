from decimal import Decimal

from django.db import models

from common.models import TimeStampedModel

MONEY = dict(max_digits=12, decimal_places=2, default=Decimal("0.00"))


class Client(TimeStampedModel):
    class Service(models.TextChoices):
        BRANDING = "branding", "Branding"
        GRAPHIC_DESIGN = "graphic_design", "Graphic Design"
        WEB_DESIGN = "web_design", "Web Design & Development"
        ADS_LEADS = "ads_leads", "Ads And Leads Management"
        PHOTO_VIDEO = "photo_video", "Photography & Videography"
        DIGITAL_MARKETING = "digital_marketing", "Digital Marketing"
        PODCAST = "podcast", "Podcast Production"
        OTHER = "other", "Other Services"

    # Auto-generated (see sales.services.generate_client_id): "KF" + 4 random
    # digits + 2 random uppercase letters, e.g. "KF4821XY".
    client_id = models.CharField(max_length=20, unique=True, blank=True, default="")
    name = models.CharField(max_length=200)
    # start_date/poc_name: added for the Projects > Clients "Add Client" form.
    # poc_name is the point-of-contact person's name; their number reuses
    # contact_phone below (labeled "Point of Contact Number" in that UI).
    start_date = models.DateField(null=True, blank=True)
    poc_name = models.CharField(max_length=150, blank=True, default="")
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=40, blank=True)
    company = models.CharField(max_length=200, blank=True)
    # notes: shown as "Description" in the Projects > Clients UI.
    notes = models.TextField(blank=True)
    # Which of the fixed service categories we provide this client — edited
    # from the Projects > Clients directory (open to employees too, unlike
    # the rest of this model which stays manager-only via Sales).
    services = models.JSONField(default=list, blank=True)
    # Per-client branding — lets the Projects > Clients list and each
    # client's content calendar carry that client's own color/logo instead
    # of one generic look, so clients are visually distinguishable at a
    # glance (spec follow-up).
    accent_color = models.CharField(max_length=7, blank=True, default="")
    logo_url = models.URLField(blank=True, default="")

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Proposal(TimeStampedModel):
    """A built proposal document (Sales > Proposals > Add Proposal). The full
    document — cover, every toggleable section, tables, image refs — lives in
    `content` (see frontend/src/lib/proposalContent.ts for the canonical
    shape). `client`/`title`/`status` are kept as real columns purely so the
    Proposals list can query/filter/search without unpacking JSON; `title`
    is synced from content.home.title on every save (see serializer)."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"

    # Optional: a proposal's cover can name a client picked from the CRM list
    # (this FK) or a one-off typed name that isn't a CRM client at all — the
    # actual display name/email/phone always live in content.home, this is
    # just for linking/reporting when it IS a real client.
    client = models.ForeignKey(
        Client, on_delete=models.SET_NULL, null=True, blank=True, related_name="proposals"
    )
    title = models.CharField(max_length=200, blank=True, default="Untitled Proposal")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    content = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return f"{self.title} ({self.status})"


class Invoice(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SENT = "sent", "Sent"
        PAID = "paid", "Paid"
        OVERDUE = "overdue", "Overdue"

    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="invoices")
    proposal = models.ForeignKey(
        Proposal, on_delete=models.SET_NULL, null=True, blank=True, related_name="invoices"
    )
    invoice_number = models.CharField(max_length=50, unique=True)
    amount = models.DecimalField(**MONEY)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    due_date = models.DateField(null=True, blank=True)

    def __str__(self):
        return self.invoice_number


class InvoiceLineItem(TimeStampedModel):
    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="line_items")
    description = models.CharField(max_length=300)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1.00"))
    unit_price = models.DecimalField(**MONEY)

    @property
    def line_total(self) -> Decimal:
        return self.quantity * self.unit_price
