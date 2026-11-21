"""Superadmin reporting (Phase 2). Volumes are tiny (a handful of BDEs, a few
thousand leads at most), so this is plain ORM + a little Python — no caching."""
from __future__ import annotations

from collections import defaultdict
from decimal import Decimal

from django.db.models import Count, Q

from .models import Activity, Deal, FollowUp, Lead, to_aed

_AFTER_QUALIFIED = (Deal.Stage.MEETING, Deal.Stage.PROPOSAL_SENT, Deal.Stage.NEGOTIATION, Deal.Stage.WON)
_PROPOSAL_PLUS = (Deal.Stage.PROPOSAL_SENT, Deal.Stage.NEGOTIATION, Deal.Stage.WON)


def _name(u) -> str:
    return (u.full_name or u.email) if u else "—"


def _pct(n, d) -> float:
    return round(100.0 * n / d, 1) if d else 0.0


def build_report(start, end, owner=None) -> dict:
    """Everything the Reports screen and the weekly email need for [start, end)."""
    leads = Lead.objects.filter(created_at__gte=start, created_at__lt=end)
    deals_all = Deal.objects.select_related("lead", "owner")
    follow_ups = FollowUp.objects.filter(done_at__gte=start, done_at__lt=end)
    acts = Activity.objects.filter(occurred_at__gte=start, occurred_at__lt=end).exclude(
        kind__in=[Activity.Kind.SYSTEM, Activity.Kind.STAGE_CHANGE]
    )
    if owner:
        leads = leads.filter(owner=owner)
        deals_all = deals_all.filter(owner=owner)
        follow_ups = follow_ups.filter(owner=owner)
        acts = acts.filter(lead__owner=owner)

    # ---- funnel: how far this period's leads have got (current stage) -------
    cohort = list(leads.select_related("deal"))
    deals = [l.deal for l in cohort if hasattr(l, "deal")]
    funnel = [
        {"key": "leads", "label": "Leads", "count": len(cohort)},
        {"key": "contacted", "label": "Contacted", "count": sum(1 for l in cohort if l.first_contacted_at)},
        {"key": "qualified", "label": "Qualified", "count": len(deals)},
        {"key": "meeting", "label": "Meeting+", "count": sum(1 for d in deals if d.stage in _AFTER_QUALIFIED)},
        {"key": "proposal", "label": "Proposal+", "count": sum(1 for d in deals if d.stage in _PROPOSAL_PLUS)},
        {"key": "won", "label": "Won", "count": sum(1 for d in deals if d.stage == Deal.Stage.WON)},
    ]

    # ---- closed in the period (independent of when the lead arrived) --------
    won = list(deals_all.filter(won_at__gte=start, won_at__lt=end))
    lost = list(deals_all.filter(lost_at__gte=start, lost_at__lt=end))
    won_value = sum((to_aed(d.value, d.currency) for d in won), Decimal("0"))
    days = [(d.won_at - d.lead.created_at).total_seconds() / 86400 for d in won if d.won_at]
    summary = {
        "new_leads": len(cohort),
        "won": len(won),
        "lost": len(lost),
        "win_rate": _pct(len(won), len(won) + len(lost)),
        "won_value_aed": str(won_value),
        "avg_days_to_close": round(sum(days) / len(days), 1) if days else None,
    }

    # ---- sources -------------------------------------------------------------
    labels = dict(Lead.Source.choices)
    src: dict = defaultdict(lambda: {"leads": 0, "qualified": 0, "won": 0, "won_value_aed": Decimal("0")})
    for l in cohort:
        row = src[l.source]
        row["leads"] += 1
        if hasattr(l, "deal"):
            row["qualified"] += 1
            if l.deal.stage == Deal.Stage.WON:
                row["won"] += 1
                row["won_value_aed"] += to_aed(l.deal.value, l.deal.currency)
    sources = sorted(
        (
            {
                "source": k,
                "label": labels.get(k, k),
                **v,
                "won_value_aed": str(v["won_value_aed"]),
                "conversion": _pct(v["won"], v["leads"]),
            }
            for k, v in src.items()
        ),
        key=lambda r: (-r["leads"], r["label"]),
    )

    # ---- lost reasons --------------------------------------------------------
    reason_labels = dict(Deal.LostReason.choices)
    lost_counts: dict = defaultdict(int)
    for d in lost:
        lost_counts[d.lost_reason or "other"] += 1
    lost_reasons = sorted(
        ({"reason": k, "label": reason_labels.get(k, k), "count": c} for k, c in lost_counts.items()),
        key=lambda r: -r["count"],
    )

    # ---- per BDE -------------------------------------------------------------
    by_owner: dict = {}

    def row(user):
        return by_owner.setdefault(
            user.pk if user else 0,
            {
                "owner": user.pk if user else 0,
                "name": _name(user),
                "leads": 0,
                "calls": 0,
                "whatsapp": 0,
                "emails": 0,
                "meetings": 0,
                "follow_ups_done": 0,
                "won": 0,
                "won_value_aed": Decimal("0"),
            },
        )

    for l in cohort:
        row(l.owner)["leads"] += 1
    kind_key = {"call": "calls", "whatsapp": "whatsapp", "email": "emails", "meeting": "meetings"}
    for a in acts.filter(direction=Activity.Direction.OUT).select_related("lead__owner"):
        k = kind_key.get(a.kind)
        if k:
            row(a.lead.owner)[k] += 1
    for f in follow_ups.select_related("owner"):
        row(f.owner)["follow_ups_done"] += 1
    for d in won:
        r = row(d.owner)
        r["won"] += 1
        r["won_value_aed"] += to_aed(d.value, d.currency)
    per_bde = sorted(
        ({**r, "won_value_aed": str(r["won_value_aed"])} for r in by_owner.values()), key=lambda r: r["name"]
    )

    # ---- open pipeline right now --------------------------------------------
    open_deals = list(deals_all.exclude(stage__in=[Deal.Stage.WON, Deal.Stage.LOST]))
    open_value = sum((to_aed(d.value, d.currency) for d in open_deals), Decimal("0"))
    moved = Activity.objects.filter(
        kind=Activity.Kind.STAGE_CHANGE, occurred_at__gte=start, occurred_at__lt=end
    )
    if owner:
        moved = moved.filter(lead__owner=owner)

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "summary": summary,
        "funnel": funnel,
        "sources": sources,
        "lost_reasons": lost_reasons,
        "per_bde": per_bde,
        "pipeline": {"open_deals": len(open_deals), "open_value_aed": str(open_value), "stage_moves": moved.count()},
    }
