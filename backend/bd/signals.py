"""Keep each lead's score fresh: recompute whenever the lead, its deal or its
timeline changes. (A nightly job also re-scores open leads so "quiet for N days" ages.)"""
import logging

from django.db.models import Q
from django.db.models.signals import post_save, pre_delete
from django.dispatch import receiver

from . import scoring
from .models import Activity, Deal, Lead

logger = logging.getLogger(__name__)


def _safe_refresh(lead):
    try:
        scoring.refresh(lead)
    except Exception:  # scoring must never break saving a lead
        logger.exception("BD: couldn't score lead %s", getattr(lead, "pk", None))


@receiver(post_save, sender=Lead)
def lead_saved(sender, instance, raw=False, **kwargs):
    if not raw:
        _safe_refresh(instance)


@receiver(post_save, sender=Activity)
def activity_saved(sender, instance, raw=False, **kwargs):
    if not raw:
        _safe_refresh(instance.lead)


@receiver(post_save, sender=Deal)
def deal_saved(sender, instance, raw=False, **kwargs):
    if not raw:
        _safe_refresh(instance.lead)


@receiver(pre_delete, sender=Lead)
def lead_deleting(sender, instance, **kwargs):
    """Remove the in-app alerts that point at a lead (and its follow-ups, replies, deal and
    proposal links) so nobody is left with a notification for something that no longer exists.
    The lead's own rows (timeline, follow-ups, deal, links) go with it by cascade."""
    try:
        from notifications.models import NotificationEvent

        pk = instance.pk
        refs = {f"bd-lead-new:{pk}", f"bd-lead-late:{pk}", f"bd-lead-late-admin:{pk}"}
        refs |= {f"bd-followup:{i}" for i in instance.follow_ups.values_list("pk", flat=True)}
        refs |= {f"bd-reply:{i}" for i in instance.activities.values_list("pk", flat=True)}
        prefixes = [f"bd-lead-repeat:{pk}:"]
        deal = Deal.objects.filter(lead_id=pk).first()
        if deal:
            refs |= {f"bd-stale:{deal.pk}", f"bd-won:{deal.pk}", f"bd-unwon:{deal.pk}"}
            for link_pk in deal.proposal_links.values_list("pk", flat=True):
                refs.add(f"bd-prop-accept:{link_pk}")
                prefixes.append(f"bd-prop-view:{link_pk}:")
        q = Q(object_ref__in=refs)
        for prefix in prefixes:
            q |= Q(object_ref__startswith=prefix)
        NotificationEvent.objects.filter(q).delete()
    except Exception:  # tidying alerts must never block a delete
        logger.exception("BD: couldn't tidy alerts for lead %s", getattr(instance, "pk", None))
