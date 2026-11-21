"""Lead score (A19): transparent rules, 0-100. No AI involved, so it is free, instant and
explainable - every point comes with a plain-words reason shown on the lead.

Closed leads score 0 and won leads 100; open leads are ranked by how promising they look:
where it came from, what they want, how much it is worth, whether we can reach them, and
how the conversation is going."""
from __future__ import annotations

from decimal import Decimal

from django.utils import timezone

HOT = 70
WARM = 40

SOURCE_POINTS = {
    "referral": (25, "Referral"),
    "event": (18, "Met at an event"),
    "website": (18, "Came through the website"),
    "whatsapp": (16, "Came through WhatsApp"),
    "meta_ads": (14, "Came from a Meta ad"),
    "other": (8, "Other source"),
    "cold_outreach": (6, "Cold outreach"),
}
STAGE_POINTS = {"qualified": 3, "meeting": 4, "proposal_sent": 8, "negotiation": 10}


def _value_points(aed: Decimal) -> tuple[int, str]:
    for floor, pts in ((50000, 20), (20000, 16), (10000, 12), (5000, 8), (1, 4)):
        if aed >= floor:
            return pts, f"Estimated value AED {int(aed):,}"
    return 0, ""


def compute(lead) -> tuple[int, list[str]]:
    """(score, reasons) for one lead. Reasons look like '+25 Referral'."""
    from .models import Activity, Lead, to_aed

    if lead.status == Lead.Status.DISQUALIFIED:
        return 0, ["Closed"]
    if lead.status == Lead.Status.CONVERTED:
        return 100, ["Won"]

    reasons: list[str] = []
    total = 0

    def add(points: int, text: str):
        nonlocal total
        if not text:
            return
        total += points
        reasons.append(f"{points:+d} {text}")

    pts, text = SOURCE_POINTS.get(lead.source, SOURCE_POINTS["other"])
    add(pts, text)

    n_services = len(lead.services or [])
    if n_services >= 2:
        add(15, "Wants several services")
    elif n_services == 1:
        add(10, "Knows which service they want")

    deal = getattr(lead, "deal", None)
    value = deal.value if deal else lead.est_value
    currency = deal.currency if deal else lead.currency
    pts, text = _value_points(to_aed(value or 0, currency))
    add(pts, text)

    if lead.phone or lead.whatsapp:
        add(5, "Has a phone number")
    if lead.email:
        add(3, "Has an email")
    if lead.website:
        add(2, "Has a website")

    # ---- the conversation so far ----
    acts = list(
        Activity.objects.filter(lead=lead, kind__in=Activity.LOGGABLE)
        .order_by("-occurred_at")
        .values("kind", "direction", "outcome")[:100]
    )
    inbound_reply = any(a["direction"] == "in" and a["kind"] in ("email", "whatsapp", "call") for a in acts)
    enquired = any(a["direction"] == "in" and a["kind"] == "note" for a in acts)
    outcomes = [a["outcome"] for a in acts if a["outcome"]]
    if inbound_reply:
        add(12, "They replied")
    elif enquired:
        add(6, "They enquired themselves")
    if "not_interested" in outcomes:
        add(-20, "Said they are not interested")
    elif "interested" in outcomes:
        add(10, "Showed interest on a call")
    elif "connected" in outcomes:
        add(6, "Spoke to them")
    elif "callback" in outcomes:
        add(4, "Asked for a callback")
    else:
        misses = sum(1 for o in outcomes if o in ("no_answer", "busy"))
        if misses >= 3:
            add(-8, f"{misses} calls with no answer")
    if any(a["kind"] == "meeting" for a in acts):
        add(8, "Had a meeting")
    if lead.first_contacted_at:
        add(3, "Already contacted")

    # ---- how fresh it is ----
    last = lead.last_activity_at or lead.created_at
    days = max(0, (timezone.now() - last).days) if last else 0
    if days <= 2:
        add(6, "Active in the last 2 days")
    elif days <= 7:
        add(3, "Active this week")
    elif days > 21:
        add(-6, f"Quiet for {days} days")

    if deal and deal.stage in STAGE_POINTS:
        add(STAGE_POINTS[deal.stage], f"Deal is at {deal.get_stage_display()}")

    return max(0, min(100, total)), reasons


def label(score: int, status: str) -> str:
    if status == "disqualified":
        return "closed"
    if status == "converted":
        return "won"
    return "hot" if score >= HOT else "warm" if score >= WARM else "cold"


def refresh(lead) -> int:
    """Recompute and store a lead's score (no signals fire: it uses update())."""
    from .models import Lead

    score, reasons = compute(lead)
    Lead.objects.filter(pk=lead.pk).update(score=score, score_reasons=reasons)
    lead.score, lead.score_reasons = score, reasons
    return score


def refresh_all(open_only: bool = True) -> int:
    from .models import Lead

    qs = Lead.objects.select_related("deal")
    if open_only:
        qs = qs.filter(status__in=[Lead.Status.NEW, Lead.Status.CONTACTED, Lead.Status.QUALIFIED])
    n = 0
    for lead in qs.iterator(chunk_size=200):
        refresh(lead)
        n += 1
    return n
