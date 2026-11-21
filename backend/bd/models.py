"""Business Development (pre-sale pipeline).

Sits in front of the `sales` app: a Lead is someone we are chasing, a Deal is a
qualified Lead moving through the pipeline, and a won Deal is handed over into
`sales.Client` (+ proposal / estimate / draft invoice). Nothing here modifies
existing sales data until a deal is explicitly won.
"""
import secrets
from decimal import Decimal

from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import TimeStampedModel

MONEY = dict(max_digits=12, decimal_places=2, default=Decimal("0.00"))

# Fixed peg (AED is pegged to the dollar) — reports total everything in AED.
USD_TO_AED = Decimal("3.6725")


class Currency(models.TextChoices):
    AED = "AED", "AED"
    USD = "USD", "USD"


def to_aed(amount, currency) -> Decimal:
    amount = Decimal(amount or 0)
    return (amount * USD_TO_AED if currency == Currency.USD else amount).quantize(Decimal("0.01"))


class Lead(TimeStampedModel):
    class Source(models.TextChoices):
        WEBSITE = "website", "Website"
        META_ADS = "meta_ads", "Meta ads"
        WHATSAPP = "whatsapp", "WhatsApp"
        REFERRAL = "referral", "Referral"
        EVENT = "event", "Event"
        COLD_OUTREACH = "cold_outreach", "Cold outreach"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        NEW = "new", "New"
        CONTACTED = "contacted", "Contacted"
        QUALIFIED = "qualified", "Qualified"
        DISQUALIFIED = "disqualified", "Disqualified"
        CONVERTED = "converted", "Converted"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="bd_leads"
    )
    company = models.CharField(max_length=200, blank=True, default="")
    contact_name = models.CharField(max_length=150, blank=True, default="")
    designation = models.CharField(max_length=120, blank=True, default="")
    phone = models.CharField(max_length=40, blank=True, default="")
    whatsapp = models.CharField(max_length=40, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    website = models.CharField(max_length=300, blank=True, default="")
    country = models.CharField(max_length=80, blank=True, default="UAE")
    city = models.CharField(max_length=80, blank=True, default="")

    source = models.CharField(max_length=20, choices=Source.choices, default=Source.OTHER)
    source_detail = models.CharField(max_length=200, blank=True, default="")
    # Values from sales.Client.Service (kept as a JSON list, same as Client.services).
    services = models.JSONField(default=list, blank=True)
    est_value = models.DecimalField(**MONEY)
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.AED)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.NEW, db_index=True
    )
    disqualify_reason = models.CharField(max_length=300, blank=True, default="")

    # Denormalised for list sorting / alerts.
    next_follow_up_at = models.DateTimeField(null=True, blank=True)
    first_contacted_at = models.DateTimeField(null=True, blank=True)
    last_activity_at = models.DateTimeField(default=timezone.now)
    # Rule-based lead score 0-100 (see bd/scoring.py), kept fresh by signals + a nightly job.
    score = models.PositiveSmallIntegerField(default=0, db_index=True)
    score_reasons = models.JSONField(default=list, blank=True)
    # Response-time alert bookkeeping (A6): owner at 2 working hours, superadmin at 4.
    owner_alerted_at = models.DateTimeField(null=True, blank=True)
    admin_alerted_at = models.DateTimeField(null=True, blank=True)

    # Normalised copies used only for duplicate detection (see bd.services).
    phone_key = models.CharField(max_length=20, blank=True, default="", db_index=True, editable=False)
    whatsapp_key = models.CharField(max_length=20, blank=True, default="", db_index=True, editable=False)
    email_key = models.CharField(max_length=254, blank=True, default="", db_index=True, editable=False)
    domain_key = models.CharField(max_length=253, blank=True, default="", db_index=True, editable=False)

    raw_payload = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["owner", "status"])]

    def __str__(self):
        return self.display_name

    @property
    def display_name(self) -> str:
        return self.company or self.contact_name or f"Lead #{self.pk}"

    def save(self, *args, **kwargs):
        from .services import compute_keys

        for field, value in compute_keys(self).items():
            setattr(self, field, value)
        update_fields = kwargs.get("update_fields")
        if update_fields is not None:
            kwargs["update_fields"] = list(
                {*update_fields, "phone_key", "whatsapp_key", "email_key", "domain_key"}
            )
        super().save(*args, **kwargs)


class Deal(TimeStampedModel):
    class Stage(models.TextChoices):
        QUALIFIED = "qualified", "Qualified"
        MEETING = "meeting", "Meeting"
        PROPOSAL_SENT = "proposal_sent", "Proposal Sent"
        NEGOTIATION = "negotiation", "Negotiation"
        WON = "won", "Won"
        LOST = "lost", "Lost"

    class LostReason(models.TextChoices):
        PRICE = "price", "Price"
        TIMING = "timing", "Timing"
        COMPETITOR = "competitor", "Went with a competitor"
        NO_RESPONSE = "no_response", "No response"
        NOT_A_FIT = "not_a_fit", "Not a fit"
        OTHER = "other", "Other"

    OPEN_STAGES = (Stage.QUALIFIED, Stage.MEETING, Stage.PROPOSAL_SENT, Stage.NEGOTIATION)
    # Default win probability per stage (editable per deal).
    STAGE_PROBABILITY = {
        Stage.QUALIFIED: 20,
        Stage.MEETING: 40,
        Stage.PROPOSAL_SENT: 60,
        Stage.NEGOTIATION: 80,
        Stage.WON: 100,
        Stage.LOST: 0,
    }

    lead = models.OneToOneField(Lead, on_delete=models.CASCADE, related_name="deal")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="bd_deals"
    )
    title = models.CharField(max_length=200)
    stage = models.CharField(
        max_length=20, choices=Stage.choices, default=Stage.QUALIFIED, db_index=True
    )
    value = models.DecimalField(**MONEY)
    currency = models.CharField(max_length=3, choices=Currency.choices, default=Currency.AED)
    expected_close_date = models.DateField(null=True, blank=True)
    probability = models.PositiveSmallIntegerField(default=20)
    lost_reason = models.CharField(max_length=20, choices=LostReason.choices, blank=True, default="")
    lost_note = models.TextField(blank=True, default="")

    proposal = models.ForeignKey(
        "sales.Proposal", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    estimate = models.ForeignKey(
        "sales.Estimate", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    client = models.ForeignKey(
        "sales.Client", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    # Set when the admin drafts an invoice from this deal (so it is only done once).
    invoice = models.ForeignKey(
        "sales.Invoice", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    stage_changed_at = models.DateTimeField(default=timezone.now)
    won_at = models.DateTimeField(null=True, blank=True)
    lost_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-updated_at"]
        indexes = [models.Index(fields=["owner", "stage"])]

    def __str__(self):
        return f"{self.title} ({self.stage})"

    @property
    def is_open(self) -> bool:
        return self.stage in self.OPEN_STAGES

    @property
    def value_aed(self) -> Decimal:
        return to_aed(self.value, self.currency)


class Activity(models.Model):
    """One row on a lead's timeline: a call / WhatsApp / email / meeting / note,
    or a system entry (stage change, handover, ...) written automatically."""

    class Kind(models.TextChoices):
        CALL = "call", "Call"
        WHATSAPP = "whatsapp", "WhatsApp"
        EMAIL = "email", "Email"
        MEETING = "meeting", "Meeting"
        NOTE = "note", "Note"
        STAGE_CHANGE = "stage_change", "Stage change"
        SYSTEM = "system", "System"

    class Direction(models.TextChoices):
        OUT = "out", "Outbound"
        IN = "in", "Inbound"

    class Outcome(models.TextChoices):
        CONNECTED = "connected", "Connected"
        NO_ANSWER = "no_answer", "No answer"
        BUSY = "busy", "Busy"
        INTERESTED = "interested", "Interested"
        NOT_INTERESTED = "not_interested", "Not interested"
        CALLBACK = "callback", "Asked for callback"

    # Kinds a person can log by hand; the rest are system-written.
    LOGGABLE = (Kind.CALL, Kind.WHATSAPP, Kind.EMAIL, Kind.MEETING, Kind.NOTE)
    # Kinds that count as "we reached out" (drive first_contacted_at).
    OUTREACH = (Kind.CALL, Kind.WHATSAPP, Kind.EMAIL, Kind.MEETING)

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="activities")
    deal = models.ForeignKey(
        Deal, on_delete=models.SET_NULL, null=True, blank=True, related_name="activities"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    direction = models.CharField(max_length=3, choices=Direction.choices, default=Direction.OUT)
    outcome = models.CharField(max_length=20, choices=Outcome.choices, blank=True, default="")
    body = models.TextField(blank=True, default="")
    occurred_at = models.DateTimeField(default=timezone.now)
    meeting_url = models.URLField(max_length=500, blank=True, default="")
    # RFC822 Message-ID of an email we sent / received — lets the inbox poller
    # skip a message it has already logged.
    message_id = models.CharField(max_length=300, blank=True, default="", db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-occurred_at", "-id"]
        indexes = [models.Index(fields=["lead", "-occurred_at"])]

    def __str__(self):
        return f"{self.kind} on lead {self.lead_id}"


class FollowUp(TimeStampedModel):
    class Kind(models.TextChoices):
        FOLLOW_UP = "follow_up", "Follow-up"
        CALL = "call", "Call"
        WHATSAPP = "whatsapp", "WhatsApp"
        EMAIL = "email", "Email"
        MEETING = "meeting", "Meeting"
        RECONTACT = "recontact", "Re-contact (lost deal)"

    lead = models.ForeignKey(Lead, on_delete=models.CASCADE, related_name="follow_ups")
    deal = models.ForeignKey(
        Deal, on_delete=models.SET_NULL, null=True, blank=True, related_name="follow_ups"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bd_follow_ups"
    )
    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.FOLLOW_UP)
    due_at = models.DateTimeField(db_index=True)
    note = models.CharField(max_length=300, blank=True, default="")
    meeting_url = models.URLField(max_length=500, blank=True, default="")
    done_at = models.DateTimeField(null=True, blank=True)
    # Set when closing a lead / losing a deal marked this reminder done for the person,
    # so re-opening can bring back exactly those (and not ones they completed themselves).
    auto_closed_at = models.DateTimeField(null=True, blank=True)
    notified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["due_at"]
        indexes = [models.Index(fields=["owner", "done_at", "due_at"])]

    def __str__(self):
        return f"{self.kind} for lead {self.lead_id} @ {self.due_at:%Y-%m-%d %H:%M}"


def _new_token() -> str:
    return secrets.token_urlsafe(32)


class LeadCaptureSource(TimeStampedModel):
    """An inbound lead channel (a website form or the Meta Lead Ads feed).

    Website sources get a secret token; the form plugin POSTs to
    /api/public/bd/capture/<token>. Meta sources have no public endpoint — the
    Celery job pulls from the Graph API and files leads under this source."""

    class Kind(models.TextChoices):
        WEBSITE = "website", "Website form"
        META = "meta", "Meta Lead Ads"

    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=10, choices=Kind.choices, default=Kind.WEBSITE)
    token = models.CharField(max_length=64, unique=True, default=_new_token)
    default_owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    active = models.BooleanField(default=True)
    last_received_at = models.DateTimeField(null=True, blank=True)
    received_count = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.kind})"


class ProposalLink(TimeStampedModel):
    """Trackable public link to a deal's proposal (/p/<token>)."""

    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name="proposal_links")
    proposal = models.ForeignKey(
        "sales.Proposal", on_delete=models.CASCADE, related_name="bd_links"
    )
    token = models.CharField(max_length=64, unique=True, default=_new_token)
    views = models.PositiveIntegerField(default=0)
    first_viewed_at = models.DateTimeField(null=True, blank=True)
    last_viewed_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    accepted_name = models.CharField(max_length=150, blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )

    class Meta:
        ordering = ["-created_at"]

    def is_usable(self) -> bool:
        if not self.active:
            return False
        return self.expires_at is None or self.expires_at > timezone.now()


class MailCursor(models.Model):
    """Where the inbox poller got to, so each run only reads new mail."""

    name = models.CharField(max_length=40, unique=True, default="sales")
    uid_validity = models.CharField(max_length=40, blank=True, default="")
    last_uid = models.PositiveBigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)
