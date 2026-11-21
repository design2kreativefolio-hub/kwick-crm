"""Business Development logic — kept out of the views so the Celery tasks, the
importer and the API all share exactly one implementation."""
from __future__ import annotations

import re
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from django.db import transaction
from django.db.models import Count, F, Max, Q, Sum
from django.utils import timezone

DUBAI = ZoneInfo("Asia/Dubai")
WORK_START = time(9, 0)
WORK_END = time(18, 0)  # Mon–Sat 09:00–18:00 Dubai (Sunday off)

STALE_DEAL_DAYS = 5
RECONTACT_DAYS = 90

# Hosts that identify a social profile, not a company — never a duplicate signal.
_NON_COMPANY_DOMAINS = {
    "facebook.com",
    "fb.com",
    "instagram.com",
    "linkedin.com",
    "twitter.com",
    "x.com",
    "tiktok.com",
    "youtube.com",
    "wa.me",
    "whatsapp.com",
    "linktr.ee",
}


class BDError(Exception):
    """A business-rule violation; views turn it into a 400 with this message."""


# --------------------------------------------------------------------------
# Normalisation + duplicate detection (A2)
# --------------------------------------------------------------------------
def normalise_phone(raw) -> str:
    """Digits only, in international form without '+', so '050 123 4567',
    '+971501234567' and '00971501234567' all collapse to the same key."""
    digits = re.sub(r"\D", "", str(raw or ""))
    if not digits:
        return ""
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("0") and len(digits) == 10:  # UAE local 05x xxx xxxx
        digits = "971" + digits[1:]
    elif len(digits) == 9 and digits.startswith("5"):  # UAE mobile without the 0
        digits = "971" + digits
    if len(digits) < 7:
        return ""
    return digits[:20]


def normalise_email(raw) -> str:
    value = str(raw or "").strip().lower()
    return value if "@" in value else ""


def website_domain(raw) -> str:
    value = str(raw or "").strip().lower()
    if not value:
        return ""
    value = re.sub(r"^[a-z]+://", "", value)
    value = value.split("/")[0].split("?")[0].split("#")[0].split(":")[0]
    if value.startswith("www."):
        value = value[4:]
    if "." not in value or value in _NON_COMPANY_DOMAINS:
        return ""
    if any(value.endswith("." + d) for d in _NON_COMPANY_DOMAINS):
        return ""
    return value[:253]


def compute_keys(lead) -> dict:
    return {
        "phone_key": normalise_phone(lead.phone),
        "whatsapp_key": normalise_phone(lead.whatsapp),
        "email_key": normalise_email(lead.email),
        "domain_key": website_domain(lead.website),
    }


def find_duplicates(user, *, phone="", whatsapp="", email="", website="", exclude_lead_id=None):
    """Match against every lead and every sales client.

    A BDE learns only *that* a match exists ("another BDE has it" / "already a
    client") — never who or what. Their own leads, and everything for the
    superadmin, include the id so it can be opened.
    """
    from common.permissions import is_superadmin
    from sales.models import Client

    from .models import Lead

    phones = {k for k in (normalise_phone(phone), normalise_phone(whatsapp)) if k}
    email_key = normalise_email(email)
    domain = website_domain(website)
    admin = is_superadmin(user)
    matches = []

    q = Q()
    if phones:
        q |= Q(phone_key__in=phones) | Q(whatsapp_key__in=phones)
    if email_key:
        q |= Q(email_key=email_key)
    if domain:
        q |= Q(domain_key=domain)

    if q:
        qs = Lead.objects.filter(q).select_related("owner")
        if exclude_lead_id:
            qs = qs.exclude(pk=exclude_lead_id)
        for lead in qs[:20]:
            fields = []
            if phones and (lead.phone_key in phones or lead.whatsapp_key in phones):
                fields.append("phone")
            if email_key and lead.email_key == email_key:
                fields.append("email")
            if domain and lead.domain_key == domain:
                fields.append("website")
            mine = lead.owner_id == getattr(user, "id", None)
            item = {
                "type": "lead",
                "fields": fields,
                "hard": bool({"phone", "email"} & set(fields)),
                "mine": mine,
            }
            if mine or admin:
                item.update(
                    lead_id=lead.pk,
                    name=lead.display_name,
                    owner_name=(lead.owner.full_name or lead.owner.email),
                )
            else:
                item["scope"] = "other_bde"
            matches.append(item)

    for client in Client.objects.all().only(
        "id", "name", "contact_phone", "contact_email", "website", "executives"
    ):
        c_phones = {normalise_phone(client.contact_phone)}
        for ex in client.executives or []:
            if isinstance(ex, dict):
                c_phones.add(normalise_phone(ex.get("phone")))
        c_phones.discard("")
        fields = []
        if phones and phones & c_phones:
            fields.append("phone")
        if email_key and normalise_email(client.contact_email) == email_key:
            fields.append("email")
        if domain and website_domain(client.website) == domain:
            fields.append("website")
        if not fields:
            continue
        item = {
            "type": "client",
            "fields": fields,
            "hard": bool({"phone", "email"} & set(fields)),
            "mine": False,
            "scope": "client",
        }
        if admin:
            item.update(client_id=client.pk, name=client.name)
        matches.append(item)
    return matches


# --------------------------------------------------------------------------
# Ownership / assignment (A3)
# --------------------------------------------------------------------------
def active_bdes():
    from accounts.models import Role, User, UserStatus

    return User.objects.filter(
        status=UserStatus.ACTIVE,
        is_active=True,
        role=Role.EMPLOYEE,
        module_access__module="bd",
        purged_at__isnull=True,
    ).distinct()


def pick_owner():
    """Round-robin: the BDE who was handed a lead the longest ago. With a single
    BDE that is always them, and it switches to rotating on its own the moment
    a second BDE is granted the module. Falls back to the superadmin."""
    from accounts.models import Role, User, UserStatus

    bde = (
        active_bdes()
        .annotate(last_lead=Max("bd_leads__created_at"))
        .order_by(F("last_lead").asc(nulls_first=True), "id")
        .first()
    )
    if bde:
        return bde
    return User.objects.filter(role=Role.SUPERADMIN, status=UserStatus.ACTIVE).order_by("id").first()


# --------------------------------------------------------------------------
# Activities / follow-ups
# --------------------------------------------------------------------------
def _stop_stale_nudge(lead):
    deal = getattr(lead, "deal", None)
    if deal is not None:
        from notifications.services import stop_recurring_reminder

        stop_recurring_reminder(object_ref=f"bd-stale:{deal.pk}")


def log_activity(
    *,
    lead,
    user,
    kind,
    direction="out",
    outcome="",
    body="",
    occurred_at=None,
    meeting_url="",
    deal=None,
    message_id="",
):
    from .models import Activity, Lead

    now = timezone.now()
    if deal is None:
        deal = getattr(lead, "deal", None)
    activity = Activity.objects.create(
        lead=lead,
        deal=deal,
        user=user,
        kind=kind,
        direction=direction,
        outcome=outcome or "",
        body=body or "",
        occurred_at=occurred_at or now,
        meeting_url=meeting_url or "",
        message_id=message_id or "",
    )
    fields = ["last_activity_at", "updated_at"]
    lead.last_activity_at = now
    if (
        kind in Activity.OUTREACH
        and direction == Activity.Direction.OUT
        and lead.first_contacted_at is None
    ):
        lead.first_contacted_at = min(activity.occurred_at, now)
        fields.append("first_contacted_at")
        if lead.status == Lead.Status.NEW:
            lead.status = Lead.Status.CONTACTED
            fields.append("status")
    lead.save(update_fields=fields)
    if kind not in (Activity.Kind.SYSTEM, Activity.Kind.STAGE_CHANGE):
        _stop_stale_nudge(lead)
    return activity


def system_note(lead, body, *, user=None, kind="system"):
    """Timeline entry written by the app, not a person. Doesn't count as the
    BDE touching the lead (no last_activity_at bump, no first-contact)."""
    from .models import Activity

    return Activity.objects.create(
        lead=lead,
        deal=getattr(lead, "deal", None),
        user=user,
        kind=kind,
        direction=Activity.Direction.OUT,
        body=body,
    )


def sync_next_follow_up(lead):
    from .models import FollowUp, Lead

    nxt = (
        FollowUp.objects.filter(lead=lead, done_at__isnull=True)
        .order_by("due_at")
        .values_list("due_at", flat=True)
        .first()
    )
    Lead.objects.filter(pk=lead.pk).update(next_follow_up_at=nxt)
    lead.next_follow_up_at = nxt


def _close_open_follow_ups(lead):
    """Mark a closed lead's open reminders done (remembering they were closed for
    the person), so they leave My Day. `_restore_auto_closed` undoes it on re-open."""
    from .models import FollowUp

    now = timezone.now()
    FollowUp.objects.filter(lead=lead, done_at__isnull=True).update(done_at=now, auto_closed_at=now)
    sync_next_follow_up(lead)


def _restore_auto_closed(lead):
    from .models import FollowUp

    FollowUp.objects.filter(lead=lead, auto_closed_at__isnull=False).exclude(
        kind=FollowUp.Kind.RECONTACT
    ).update(done_at=None, auto_closed_at=None)
    sync_next_follow_up(lead)


def create_follow_up(*, lead, owner, due_at, note="", kind="follow_up", meeting_url="", deal=None):
    from .models import FollowUp

    if deal is None:
        deal = getattr(lead, "deal", None)
    follow_up = FollowUp.objects.create(
        lead=lead,
        deal=deal,
        owner=owner,
        kind=kind,
        due_at=due_at,
        note=note or "",
        meeting_url=meeting_url or "",
    )
    sync_next_follow_up(lead)
    return follow_up


def complete_follow_up(follow_up):
    if follow_up.done_at is None:
        follow_up.done_at = timezone.now()
        follow_up.save(update_fields=["done_at", "updated_at"])
        sync_next_follow_up(follow_up.lead)
    return follow_up


# --------------------------------------------------------------------------
# Lead → deal → won / lost
# --------------------------------------------------------------------------
def _service_label(code: str) -> str:
    from sales.models import Client

    try:
        return Client.Service(code).label
    except ValueError:
        return code


@transaction.atomic
def qualify_lead(lead, user, *, title="", value=None, currency=None, expected_close_date=None):
    from .models import Deal, Lead

    if hasattr(lead, "deal"):
        raise BDError("This lead already has a deal.")
    if lead.status == Lead.Status.DISQUALIFIED:
        raise BDError("This lead was disqualified. Re-open it before qualifying.")
    if not title:
        svc = _service_label(lead.services[0]) if lead.services else ""
        title = f"{lead.display_name} — {svc}" if svc else lead.display_name
    deal = Deal.objects.create(
        lead=lead,
        owner=lead.owner,
        title=title[:200],
        stage=Deal.Stage.QUALIFIED,
        value=value if value is not None else lead.est_value,
        currency=currency or lead.currency,
        expected_close_date=expected_close_date,
        probability=Deal.STAGE_PROBABILITY[Deal.Stage.QUALIFIED],
    )
    lead.status = Lead.Status.QUALIFIED
    lead.save(update_fields=["status", "updated_at"])
    lead.deal = deal
    system_note(lead, "Qualified — deal created.", user=user, kind="stage_change")
    return deal


@transaction.atomic
def disqualify_lead(lead, user, reason: str):
    from .models import Lead

    reason = (reason or "").strip()
    if not reason:
        raise BDError("A reason is required to disqualify a lead.")
    if hasattr(lead, "deal") and lead.deal.stage == "won":
        raise BDError("This lead was already won.")
    lead.status = Lead.Status.DISQUALIFIED
    lead.disqualify_reason = reason[:300]
    lead.save(update_fields=["status", "disqualify_reason", "updated_at"])
    # A closed lead has nothing left to chase: tidy its open reminders so they stop
    # showing on My Day and alerting the owner (re-opening brings them back).
    _close_open_follow_ups(lead)
    system_note(lead, f"Disqualified — {reason}", user=user, kind="stage_change")
    return lead


@transaction.atomic
def reopen_lead(lead, user):
    from .models import Lead

    if lead.status != Lead.Status.DISQUALIFIED:
        raise BDError("Only disqualified leads can be re-opened.")
    deal = getattr(lead, "deal", None)
    if deal is not None:
        return reopen_deal(deal, user)
    lead.status = Lead.Status.CONTACTED if lead.first_contacted_at else Lead.Status.NEW
    lead.disqualify_reason = ""
    lead.save(update_fields=["status", "disqualify_reason", "updated_at"])
    _restore_auto_closed(lead)
    system_note(lead, "Lead re-opened.", user=user, kind="stage_change")
    return lead


def _recontact_due_at():
    local = timezone.localtime(timezone.now(), DUBAI) + timedelta(days=RECONTACT_DAYS)
    return datetime.combine(local.date(), time(10, 0), tzinfo=DUBAI)


@transaction.atomic
def move_deal(deal, stage, user, *, lost_reason="", lost_note="", win_options=None):
    from .models import Deal, Lead

    valid = {s.value for s in Deal.Stage}
    if stage not in valid:
        raise BDError("Unknown stage.")
    if stage == deal.stage:
        return deal
    if deal.stage == Deal.Stage.WON:
        return reopen_won(deal, user, stage)
    if stage == Deal.Stage.WON:
        return win_deal(deal, user, **(win_options or {}))

    previous = deal.stage
    now = timezone.now()
    lead = deal.lead

    if stage == Deal.Stage.LOST:
        lost_reason = (lost_reason or "").strip()
        if lost_reason not in {r.value for r in Deal.LostReason}:
            raise BDError("Pick a reason for losing this deal.")
        if lost_reason == Deal.LostReason.OTHER and not (lost_note or "").strip():
            raise BDError("Add a short note explaining why the deal was lost.")
        deal.lost_reason = lost_reason
        deal.lost_note = (lost_note or "").strip()
        deal.lost_at = now
        deal.probability = 0
        lead.status = Lead.Status.DISQUALIFIED
        lead.disqualify_reason = f"Lost — {Deal.LostReason(lost_reason).label}"
        lead.save(update_fields=["status", "disqualify_reason", "updated_at"])
        _close_open_follow_ups(lead)  # the deal is over; only the check-back below stays
        create_follow_up(
            lead=lead,
            owner=deal.owner,
            due_at=_recontact_due_at(),
            note=f"Check back in with {lead.display_name} (lost: {Deal.LostReason(lost_reason).label.lower()})",
            kind="recontact",
            deal=deal,
        )
    else:
        if previous == Deal.Stage.LOST:
            return reopen_deal(deal, user, stage=stage)
        deal.probability = Deal.STAGE_PROBABILITY[Deal.Stage(stage)]

    deal.stage = stage
    deal.stage_changed_at = now
    deal.save()
    body = f"Stage: {Deal.Stage(previous).label} → {Deal.Stage(stage).label}"
    if stage == Deal.Stage.LOST:
        body += f" ({Deal.LostReason(deal.lost_reason).label}{': ' + deal.lost_note if deal.lost_note else ''})"
    system_note(lead, body, user=user, kind="stage_change")
    from notifications.services import stop_recurring_reminder

    if stage == Deal.Stage.LOST:
        stop_recurring_reminder(object_ref=f"bd-stale:{deal.pk}")
    lead.last_activity_at = now
    lead.save(update_fields=["last_activity_at", "updated_at"])
    return deal


@transaction.atomic
def reopen_deal(deal, user, stage=None):
    from .models import Deal, FollowUp, Lead

    if deal.stage != Deal.Stage.LOST:
        raise BDError("Only lost deals can be re-opened.")
    stage = stage or Deal.Stage.QUALIFIED
    now = timezone.now()
    deal.stage = stage
    deal.stage_changed_at = now
    deal.probability = Deal.STAGE_PROBABILITY[Deal.Stage(stage)]
    deal.lost_reason = ""
    deal.lost_note = ""
    deal.lost_at = None
    deal.save()
    lead = deal.lead
    lead.status = Lead.Status.QUALIFIED
    lead.disqualify_reason = ""
    lead.last_activity_at = now
    lead.save(update_fields=["status", "disqualify_reason", "last_activity_at", "updated_at"])
    FollowUp.objects.filter(
        lead=lead, kind=FollowUp.Kind.RECONTACT, done_at__isnull=True
    ).delete()
    _restore_auto_closed(lead)
    system_note(lead, f"Deal re-opened at {Deal.Stage(stage).label}.", user=user, kind="stage_change")
    return deal


def _draft_invoice(deal, client, estimate):
    """Draft (never sent) invoice built from the linked estimate — or a single
    line for the deal value when there is no estimate. Superadmin-only: BDEs
    have no invoice access, this just saves the superadmin retyping it."""
    from sales.invoice_content import merged_content, totals
    from sales.models import Invoice

    lead = deal.lead
    if estimate is not None:
        est = estimate.content or {}
        items = [
            {
                "description": i.get("description", ""),
                "details": i.get("details", ""),
                "qty": i.get("qty", 1),
                "rate": i.get("rate", 0),
            }
            for i in (est.get("items") or [])
        ]
        extra = {
            k: est[k]
            for k in ("vat_enabled", "vat_percent", "discount_type", "discount_value", "notes")
            if k in est
        }
        currency = est.get("currency") or deal.currency
    elif deal.value and deal.value > 0:
        items = [{"description": deal.title, "details": "", "qty": 1, "rate": float(deal.value)}]
        extra = {}
        currency = deal.currency
    else:
        return None

    content = merged_content(
        {
            "bill_to": client.name,
            "bill_to_email": lead.email or client.contact_email,
            "client_id": client.pk,
            "date": timezone.localdate().isoformat(),
            "currency": currency,
            "items": items or None,
            **extra,
        }
    )
    number = f"DRAFT-{uuid.uuid4().hex[:10].upper()}"
    content["invoice_number"] = number
    return Invoice.objects.create(
        client=client,
        proposal=deal.proposal,
        invoice_number=number,
        amount=Decimal(str(totals(content)["total"])),
        status=Invoice.Status.DRAFT,
        content=content,
    )


def _link_documents(deal, client):
    """Point the deal and its proposal / estimate at a client (once one exists)."""
    from sales.models import Estimate, Proposal

    deal.client = client
    deal.save(update_fields=["client", "updated_at"])
    proposal = deal.proposal
    if proposal is not None:
        proposal.client = client
        content = dict(proposal.content or {})
        home = dict(content.get("home") or {})
        home["client_id"] = client.pk
        home["client_name"] = home.get("client_name") or client.name
        content["home"] = home
        proposal.content = content
        proposal.save()
    estimate = deal.estimate
    if estimate is not None:
        estimate.client = client
        content = dict(estimate.content or {})
        content["client_id"] = client.pk
        content["bill_to"] = content.get("bill_to") or client.name
        estimate.content = content
        estimate.save()


@transaction.atomic
def win_deal(deal, user, *, client_id=None):
    """Mark a deal Won. Deliberately light: nothing else is created. The admin adds
    the client from Sales (by hand) and can draft the invoice from the deal when
    ready. A Won deal can be moved back to an open stage. Idempotent."""
    from notifications.services import _superadmins, notify_user, stop_recurring_reminder
    from sales.models import Client, Estimate, Proposal

    from .models import Deal, Lead

    deal = Deal.objects.select_for_update().select_related("lead").get(pk=deal.pk)
    if deal.stage == Deal.Stage.WON:
        return deal
    lead = deal.lead
    now = timezone.now()

    if client_id:  # optional: link a client that already exists
        try:
            _link_documents(deal, Client.objects.get(pk=client_id))
        except Client.DoesNotExist:
            raise BDError("That client no longer exists.")

    # The proposal / estimate the client agreed to are now accepted.
    if deal.proposal and deal.proposal.status in (Proposal.Status.DRAFT, Proposal.Status.SENT):
        Proposal.objects.filter(pk=deal.proposal_id).update(status=Proposal.Status.ACCEPTED)
    if deal.estimate and deal.estimate.status in (Estimate.Status.DRAFT, Estimate.Status.SENT):
        Estimate.objects.filter(pk=deal.estimate_id).update(status=Estimate.Status.ACCEPTED)

    previous = deal.stage
    deal.stage = Deal.Stage.WON
    deal.probability = 100
    deal.won_at = now
    deal.stage_changed_at = now
    deal.lost_reason = ""
    deal.lost_note = ""
    deal.lost_at = None
    deal.save()
    lead.status = Lead.Status.CONVERTED
    lead.last_activity_at = now
    lead.save(update_fields=["status", "last_activity_at", "updated_at"])
    _close_open_follow_ups(lead)  # remembered, so moving the deal back restores them
    stop_recurring_reminder(object_ref=f"bd-stale:{deal.pk}")
    system_note(
        lead,
        f"Won 🎉 (from {Deal.Stage(previous).label}). Add the client from Sales, then draft the invoice when ready.",
        user=user,
        kind="stage_change",
    )

    who = (user.full_name or user.email) if user else "A BDE"
    for admin in _superadmins():
        notify_user(
            user=admin,
            source="bd",
            title=f"🎉 Deal won: {deal.title}",
            body=f"{who} won this deal. Add the client in Sales and draft the invoice from the deal when ready.",
            object_ref=f"bd-won:{deal.pk}",
        )
    return deal


@transaction.atomic
def link_client(deal, client):
    """Superadmin: attach an existing client to a won deal."""
    from .models import Deal

    deal = Deal.objects.select_for_update().select_related("lead").get(pk=deal.pk)
    _link_documents(deal, client)
    system_note(deal.lead, f"Linked to client {client.client_id} ({client.name}).", user=None, kind="system")
    return deal


@transaction.atomic
def create_deal_invoice(deal, user):
    """Superadmin: draft (never send) an invoice from a won deal. Needs the client
    to be linked first, and only happens once per deal."""
    from .models import Deal

    deal = Deal.objects.select_for_update().select_related("lead", "client", "estimate").get(pk=deal.pk)
    if deal.stage != Deal.Stage.WON:
        raise BDError("Only a won deal can be invoiced.")
    if deal.client_id is None:
        raise BDError("Link the client first: add them in Sales → Clients, then link them to this deal.")
    if deal.invoice_id:
        raise BDError("A draft invoice was already created for this deal.")
    invoice = _draft_invoice(deal, deal.client, deal.estimate)
    deal.invoice = invoice
    deal.save(update_fields=["invoice", "updated_at"])
    system_note(
        deal.lead,
        f"Draft invoice created for {deal.client.client_id} ({deal.client.name}).",
        user=user,
        kind="system",
    )
    return deal


@transaction.atomic
def reopen_won(deal, user, stage):
    """Undo a win: move the deal back to an open stage. Any client / invoice that was
    already created stays - nothing is deleted."""
    from notifications.services import _superadmins, notify_user

    from .models import Deal, Lead

    if stage not in Deal.OPEN_STAGES:
        raise BDError("A won deal can only move back to an open stage.")
    now = timezone.now()
    deal.stage = stage
    deal.stage_changed_at = now
    deal.probability = Deal.STAGE_PROBABILITY[Deal.Stage(stage)]
    deal.won_at = None
    deal.save()
    lead = deal.lead
    lead.status = Lead.Status.QUALIFIED
    lead.last_activity_at = now
    lead.save(update_fields=["status", "last_activity_at", "updated_at"])
    _restore_auto_closed(lead)
    system_note(lead, f"Win undone: moved back to {Deal.Stage(stage).label}.", user=user, kind="stage_change")
    if deal.client_id or deal.invoice_id:
        who = (user.full_name or user.email) if user else "Someone"
        for admin in _superadmins():
            notify_user(
                user=admin,
                source="bd",
                title=f"Win undone: {deal.title}",
                body=f"{who} moved this deal back to {Deal.Stage(stage).label}. Its client / invoice were left as they are.",
                object_ref=f"bd-unwon:{deal.pk}",
            )
    return deal


@transaction.atomic
def reassign_leads(lead_ids, new_owner, by):
    """Superadmin: hand leads (with their deals, open follow-ups and the
    proposals/estimates the deal points at) to another BDE."""
    from .models import Deal, FollowUp, Lead

    leads = list(Lead.objects.filter(pk__in=lead_ids).select_related("owner"))
    for lead in leads:
        old = lead.owner
        if old.pk == new_owner.pk:
            continue
        lead.owner = new_owner
        lead.save(update_fields=["owner", "updated_at"])
        Deal.objects.filter(lead=lead).update(owner=new_owner)
        FollowUp.objects.filter(lead=lead, done_at__isnull=True).update(owner=new_owner)
        deal = getattr(lead, "deal", None)
        if deal is not None:
            from sales.models import Estimate, Proposal

            if deal.proposal_id:
                Proposal.objects.filter(pk=deal.proposal_id).update(owner=new_owner)
            if deal.estimate_id:
                Estimate.objects.filter(pk=deal.estimate_id).update(owner=new_owner)
        system_note(
            lead,
            f"Reassigned from {old.full_name or old.email} to {new_owner.full_name or new_owner.email}.",
            user=by,
        )
    return len(leads)


# --------------------------------------------------------------------------
# Working hours (A6)
# --------------------------------------------------------------------------
def working_minutes(start: datetime, end: datetime) -> float:
    """Minutes between two instants that fall inside Mon–Sat 09:00–18:00 Dubai."""
    if end <= start:
        return 0.0
    s = start.astimezone(DUBAI)
    e = end.astimezone(DUBAI)
    total = 0.0
    day = s.date()
    while day <= e.date():
        if day.weekday() != 6:  # Sunday
            window_start = datetime.combine(day, WORK_START, tzinfo=DUBAI)
            window_end = datetime.combine(day, WORK_END, tzinfo=DUBAI)
            lo, hi = max(window_start, s), min(window_end, e)
            if hi > lo:
                total += (hi - lo).total_seconds() / 60
        day += timedelta(days=1)
    return total


# --------------------------------------------------------------------------
# Read models: My Day + pipeline
# --------------------------------------------------------------------------
# The board holds qualified deals only. New / Contacted leads live on the Leads
# page until someone qualifies them.
PIPELINE_COLUMNS = [
    ("qualified", "Qualified"),
    ("meeting", "Meeting"),
    ("proposal_sent", "Proposal Sent"),
    ("negotiation", "Negotiation"),
    ("won", "Won"),
    ("lost", "Lost"),
]
_CLOSED_CARD_LIMIT = 50


def _owner_name(user):
    return (user.full_name or user.email) if user else ""


def lead_card(lead, deal=None):
    from . import scoring

    deal = deal or getattr(lead, "deal", None)
    value = deal.value if deal else lead.est_value
    currency = deal.currency if deal else lead.currency
    from .models import to_aed

    return {
        "id": lead.pk,
        "deal_id": deal.pk if deal else None,
        "kind": "deal" if deal else "lead",
        "title": (deal.title if deal else lead.display_name),
        "company": lead.company,
        "contact_name": lead.contact_name,
        "phone": lead.phone,
        "whatsapp": lead.whatsapp,
        "email": lead.email,
        "source": lead.source,
        "stage": deal.stage if deal else lead.status,
        "value": str(value),
        "currency": currency,
        "value_aed": str(to_aed(value, currency)),
        "owner": lead.owner_id,
        "owner_name": _owner_name(lead.owner),
        "next_follow_up_at": lead.next_follow_up_at,
        "last_activity_at": lead.last_activity_at,
        "created_at": lead.created_at,
        "stage_changed_at": deal.stage_changed_at if deal else None,
        "score": lead.score,
        "score_label": scoring.label(lead.score, lead.status),
        "services": lead.services or [],
    }


def filter_deals(deals_qs, params):
    """Search / filters for the board, applied to *every* deal (counts and totals
    follow them), not just the cards that happen to be on screen."""
    from django.db.models import Q

    q = (params.get("search") or "").strip()
    if q:
        deals_qs = deals_qs.filter(
            Q(title__icontains=q)
            | Q(lead__company__icontains=q)
            | Q(lead__contact_name__icontains=q)
            | Q(lead__phone__icontains=q)
            | Q(lead__whatsapp__icontains=q)
            | Q(lead__email__icontains=q)
        )
    source = params.get("source")
    if source:
        deals_qs = deals_qs.filter(lead__source=source)
    follow = params.get("follow_up")
    if follow:
        start = timezone.localtime(timezone.now()).replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        if follow == "overdue":
            deals_qs = deals_qs.filter(lead__next_follow_up_at__lt=start)
        elif follow == "today":
            deals_qs = deals_qs.filter(lead__next_follow_up_at__gte=start, lead__next_follow_up_at__lt=end)
        elif follow == "none":
            deals_qs = deals_qs.filter(lead__next_follow_up_at__isnull=True)
    has_value = params.get("has_value")
    if has_value == "yes":
        deals_qs = deals_qs.filter(value__gt=0)
    elif has_value == "no":
        deals_qs = deals_qs.exclude(value__gt=0)
    return deals_qs


def _order_deals(deals_qs, sort):
    from django.db.models import F

    if sort == "value":
        return deals_qs.order_by("-value", "-stage_changed_at")
    if sort == "newest":
        return deals_qs.order_by("-lead__created_at")
    if sort == "quiet":
        return deals_qs.order_by("lead__last_activity_at")
    return deals_qs.order_by(F("lead__next_follow_up_at").asc(nulls_last=True), "-stage_changed_at")


def build_pipeline(leads_qs, deals_qs, *, closed_limit=None, sort="follow_up"):
    """Board data: one column per stage, value totals in AED. Won / Lost list the
    latest `closed_limit` cards (the UI grows it with "Show more")."""
    from .models import Currency, Deal, Lead, to_aed

    closed_limit = closed_limit or _CLOSED_CARD_LIMIT

    columns = {key: {"key": key, "label": label, "count": 0, "total_aed": Decimal("0"), "cards": []}
               for key, label in PIPELINE_COLUMNS}

    # Totals come from the DB so the Won/Lost cards can be capped without
    # making the column totals lie.
    def accumulate(rows, key_for):
        for row in rows:
            col = columns[key_for(row)]
            col["count"] += row["n"]
            col["total_aed"] += to_aed(row["total"], row["currency"])

    accumulate(
        deals_qs.values("stage", "currency").annotate(n=Count("id"), total=Sum("value")),
        lambda r: r["stage"],
    )

    deals = _order_deals(deals_qs.select_related("lead", "lead__owner"), sort)
    seen = {"won": 0, "lost": 0}
    for deal in deals[: 600 + 2 * closed_limit]:
        if deal.stage in seen:
            if seen[deal.stage] >= closed_limit:
                continue
            seen[deal.stage] += 1
        columns[deal.stage]["cards"].append(lead_card(deal.lead, deal))

    out = []
    for key, _ in PIPELINE_COLUMNS:
        col = columns[key]
        col["total_aed"] = str(col["total_aed"])
        out.append(col)
    open_total = sum(
        (Decimal(c["total_aed"]) for c in out if c["key"] not in ("won", "lost")), Decimal("0")
    )
    return {"columns": out, "open_total_aed": str(open_total), "currencies": [c.value for c in Currency]}


def _last_touch_map(lead_ids) -> dict:
    """Most recent logged touch per lead (one query), for the 'Called 3 days ago, no answer' line."""
    from .models import Activity

    out: dict = {}
    if not lead_ids:
        return out
    rows = (
        Activity.objects.filter(lead_id__in=set(lead_ids), kind__in=Activity.LOGGABLE)
        .order_by("-occurred_at")
        .values("lead_id", "kind", "direction", "outcome", "occurred_at")[:3000]
    )
    for a in rows:
        out.setdefault(a["lead_id"], a)
    return out


def _followup_row(f, touches=None):
    from . import scoring

    lead = f.lead
    deal = getattr(lead, "deal", None)
    value = deal.value if deal else lead.est_value
    touch = (touches or {}).get(f.lead_id)
    return {
        "id": f.pk,
        "lead": f.lead_id,
        "lead_name": lead.display_name,
        "contact_name": lead.contact_name,
        "phone": lead.phone,
        "whatsapp": lead.whatsapp,
        "email": lead.email,
        "kind": f.kind,
        "due_at": f.due_at,
        "note": f.note,
        "meeting_url": f.meeting_url,
        "owner": f.owner_id,
        "owner_name": _owner_name(f.owner),
        "score": lead.score,
        "score_label": scoring.label(lead.score, lead.status),
        "score_reasons": lead.score_reasons or [],
        "source": lead.source,
        "stage": deal.stage if deal else lead.status,
        "value": str(value or 0),
        "currency": deal.currency if deal else lead.currency,
        "last_touch": (
            {
                "kind": touch["kind"],
                "direction": touch["direction"],
                "outcome": touch["outcome"],
                "at": touch["occurred_at"],
            }
            if touch
            else None
        ),
    }


def build_my_day(leads_qs, deals_qs, follow_ups_qs):
    """The BDE's home screen: today's + overdue follow-ups, new leads that
    haven't been contacted, deals that have gone quiet, this week's meetings."""
    from .models import Deal, FollowUp, Lead

    now = timezone.now()
    local_now = timezone.localtime(now, DUBAI)
    day_start = datetime.combine(local_now.date(), time(0, 0), tzinfo=DUBAI)
    day_end = day_start + timedelta(days=1)
    week_end = day_start + timedelta(days=7)

    open_fu = follow_ups_qs.filter(done_at__isnull=True).select_related("lead", "lead__deal", "owner")
    overdue_qs = list(open_fu.filter(due_at__lt=day_start).order_by("due_at")[:50])
    today_qs = list(open_fu.filter(due_at__gte=day_start, due_at__lt=day_end).order_by("due_at")[:50])
    meeting_qs = list(
        open_fu.filter(kind=FollowUp.Kind.MEETING, due_at__gte=day_start, due_at__lt=week_end).order_by("due_at")[:30]
    )
    touches = _last_touch_map([f.lead_id for f in overdue_qs + today_qs + meeting_qs])
    overdue = [_followup_row(f, touches) for f in overdue_qs]
    today = [_followup_row(f, touches) for f in today_qs]
    meetings = [_followup_row(f, touches) for f in meeting_qs]
    done_today = follow_ups_qs.filter(done_at__gte=day_start, done_at__lt=day_end).count()
    new_leads = [
        lead_card(lead)
        for lead in leads_qs.filter(status=Lead.Status.NEW, first_contacted_at__isnull=True)
        .select_related("owner")
        .order_by("-score", "created_at")[:30]  # best prospects first
    ]

    cutoff = now - timedelta(days=STALE_DEAL_DAYS)
    stale = []
    for deal in (
        deals_qs.filter(stage__in=Deal.OPEN_STAGES)
        .select_related("lead", "lead__owner")
        .order_by("stage_changed_at")[:300]
    ):
        last = max(deal.lead.last_activity_at, deal.stage_changed_at)
        if last <= cutoff:
            card = lead_card(deal.lead, deal)
            card["quiet_days"] = (now - last).days
            stale.append(card)
    stale.sort(key=lambda c: -c["quiet_days"])

    return {
        "overdue": overdue,
        "today": today,
        "new_leads": new_leads,
        "stale_deals": stale[:30],
        "meetings": meetings,
        "counts": {
            "overdue": len(overdue),
            "today": len(today),
            "new_leads": len(new_leads),
            "stale_deals": len(stale),
            "meetings": len(meetings),
        },
        "done_today": done_today,
        "generated_at": now,
    }
