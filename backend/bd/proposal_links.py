"""Trackable proposal link (A12): /p/<token> shows the proposal, counts views,
and lets the client accept it with one tap."""
from __future__ import annotations

import logging
import re
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from common.media_urls import sign_media_url

from . import services
from .models import Activity, Deal, ProposalLink
from .services import BDError

logger = logging.getLogger(__name__)

VIEW_LOG_GAP = timedelta(minutes=30)  # one timeline entry per sitting
VIEW_PUSH_GAP = timedelta(hours=6)  # and at most one push per 6 hours
DEFAULT_LIFETIME = timedelta(days=60)

_ATTR = re.compile(r'(src|href)="([^"]*/media/[^"]*)"')


def link_url(link: ProposalLink) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}/p/{link.token}"


def get_or_create_link(deal: Deal, user) -> ProposalLink:
    if deal.proposal_id is None:
        raise BDError("Attach a proposal to this deal first.")
    link = (
        ProposalLink.objects.filter(deal=deal, proposal_id=deal.proposal_id, active=True)
        .order_by("-created_at")
        .first()
    )
    if link and link.is_usable():
        return link
    return ProposalLink.objects.create(
        deal=deal,
        proposal_id=deal.proposal_id,
        created_by=user,
        expires_at=timezone.now() + DEFAULT_LIFETIME,
    )


def link_payload(link: ProposalLink) -> dict:
    return {
        "id": link.pk,
        "url": link_url(link),
        "views": link.views,
        "first_viewed_at": link.first_viewed_at,
        "last_viewed_at": link.last_viewed_at,
        "accepted_at": link.accepted_at,
        "accepted_name": link.accepted_name,
        "expires_at": link.expires_at,
    }


def sign_media(value):
    """Public viewers have no login, so every /media/ URL in the proposal gets a
    short-lived signature (same mechanism the client calendar uses)."""
    if isinstance(value, dict):
        return {k: sign_media(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sign_media(v) for v in value]
    if isinstance(value, str) and "/media/" in value:
        if " " not in value and "<" not in value and (value.startswith("/") or value.startswith("http")):
            return sign_media_url(value)
        return _ATTR.sub(lambda m: f'{m.group(1)}="{sign_media_url(m.group(2))}"', value)
    return value


def _notify_owner(deal, *, ref, title, body):
    from notifications.services import notify_user

    try:
        notify_user(user=deal.owner, source="bd", title=title, body=body, object_ref=ref)
    except Exception:
        logger.exception("BD: proposal notification failed")


def record_view(link: ProposalLink) -> None:
    """Count a view and, at most once per sitting, write it to the timeline."""
    now = timezone.now()
    first = link.first_viewed_at is None
    gap_log = first or (link.last_viewed_at and now - link.last_viewed_at >= VIEW_LOG_GAP)
    gap_push = first or (link.last_viewed_at and now - link.last_viewed_at >= VIEW_PUSH_GAP)
    ProposalLink.objects.filter(pk=link.pk).update(
        views=link.views + 1, last_viewed_at=now, first_viewed_at=link.first_viewed_at or now
    )
    deal = link.deal
    lead = deal.lead
    if gap_log:
        services.system_note(lead, "Proposal viewed by the client.", user=None)
    if gap_push:
        _notify_owner(
            deal,
            ref=f"bd-prop-view:{link.pk}:{int(now.timestamp())}",
            title=f"{lead.display_name} opened your proposal",
            body="They're looking at it now — a good time to follow up." if first else "They opened it again.",
        )


def accept(link: ProposalLink, name: str) -> bool:
    """Client taps Accept. Returns False if it had already been accepted."""
    from notifications.services import _superadmins, notify_user

    name = (name or "").strip()[:150]
    with transaction.atomic():
        link = ProposalLink.objects.select_for_update(of=("self",)).select_related("deal__lead", "deal__owner", "proposal").get(pk=link.pk)
        if link.accepted_at:
            return False
        link.accepted_at = timezone.now()
        link.accepted_name = name
        link.save(update_fields=["accepted_at", "accepted_name", "updated_at"])
        proposal = link.proposal
        if proposal.status != proposal.Status.ACCEPTED:
            proposal.status = proposal.Status.ACCEPTED
            proposal.save(update_fields=["status", "updated_at"])
        deal = link.deal
        services.system_note(deal.lead, f"Proposal accepted by {name} via the link.", user=None)

    # Mark the deal Won (nothing else is created) — a failure here must not undo the acceptance.
    if deal.stage not in (Deal.Stage.WON, Deal.Stage.LOST):
        try:
            services.move_deal(deal, Deal.Stage.WON, deal.owner)
        except Exception:
            logger.exception("BD: auto-win after proposal acceptance failed for deal %s", deal.pk)
            services.system_note(deal.lead, "Accepted online — please move the deal to Won.", user=None)

    title = f"{deal.lead.display_name} accepted the proposal"
    body = f"Accepted by {name}."
    _notify_owner(deal, ref=f"bd-prop-accept:{link.pk}", title=title, body=body)
    try:
        for admin in _superadmins():
            if admin.pk != deal.owner_id:
                notify_user(user=admin, source="bd", title=title, body=body, object_ref=f"bd-prop-accept:{link.pk}")
    except Exception:
        logger.exception("BD: admin notification failed")
    return True
