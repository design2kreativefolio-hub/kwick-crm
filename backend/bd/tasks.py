"""Celery jobs for Business Development (A4–A7). All are short indexed
queries on the existing worker — no new container, no external service.

Every job is idempotent: it's safe if beat fires twice or a worker restarts
mid-run, because each alert is keyed on a NotificationEvent.object_ref or a
`*_alerted_at` / `notified_at` column.
"""
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from . import services


def _nudge(user, *, ref, title, body):
    """Daily nudge keyed on `ref`: re-surfaces (unread) and re-pushes each run
    instead of piling up one row per day. Not `recurring`, so the generic
    08:00 re-fire job leaves it alone."""
    from notifications.models import NotificationEvent
    from notifications.tasks import deliver_notification

    event, created = NotificationEvent.objects.get_or_create(
        user=user,
        object_ref=ref,
        defaults={"source": "bd", "title": title, "body": body, "recurring": False, "active": True},
    )
    if not created:
        event.title, event.body, event.active, event.read_at = title, body, True, None
        event.save()
    try:
        deliver_notification.delay(event.pk)
    except Exception:
        deliver_notification(event.pk)


def _once(user, *, ref, title, body):
    """Fire exactly one notification for `ref` ever."""
    from notifications.models import NotificationEvent
    from notifications.services import notify_user

    if NotificationEvent.objects.filter(user=user, object_ref=ref).exists():
        return False
    notify_user(user=user, source="bd", title=title, body=body, object_ref=ref)
    return True


@shared_task
def follow_up_alerts():
    """Every 5 min: push each follow-up once when it falls due."""
    from .models import FollowUp

    now = timezone.now()
    due = (
        FollowUp.objects.filter(done_at__isnull=True, notified_at__isnull=True, due_at__lte=now)
        .select_related("lead", "owner")
        .order_by("due_at")[:200]
    )
    sent = 0
    for fu in due:
        if not fu.owner.is_active or fu.owner.status != "active":
            continue
        local = timezone.localtime(fu.due_at)
        what = {"meeting": "Meeting", "recontact": "Re-contact"}.get(fu.kind, "Follow up")
        body = f"{what} with {fu.lead.display_name} · {local.strftime('%I:%M %p').lstrip('0')}"
        if fu.note:
            body += f"\n{fu.note}"
        _once(fu.owner, ref=f"bd-followup:{fu.pk}", title=f"⏰ {what}: {fu.lead.display_name}", body=body)
        fu.notified_at = now
        fu.save(update_fields=["notified_at", "updated_at"])
        sent += 1
    return {"sent": sent}


@shared_task
def my_day_digest():
    """09:00 Dubai, Mon–Sat: one push per BDE summarising their day."""
    from .models import Deal, FollowUp, Lead

    local_now = timezone.localtime(timezone.now(), services.DUBAI)
    if local_now.weekday() == 6:
        return {"skipped": "sunday"}
    day_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    stale_cutoff = timezone.now() - timedelta(days=services.STALE_DEAL_DAYS)
    sent = 0
    for user in services.active_bdes():
        open_fu = FollowUp.objects.filter(owner=user, done_at__isnull=True)
        overdue = open_fu.filter(due_at__lt=day_start).count()
        today = open_fu.filter(due_at__gte=day_start, due_at__lt=day_end).count()
        new = Lead.objects.filter(owner=user, status=Lead.Status.NEW).count()
        stale = Deal.objects.filter(
            owner=user, stage__in=Deal.OPEN_STAGES, lead__last_activity_at__lte=stale_cutoff,
            stage_changed_at__lte=stale_cutoff,
        ).count()
        if not (overdue or today or new or stale):
            continue
        parts = []
        if today:
            parts.append(f"{today} follow-up{'s' if today != 1 else ''} today")
        if overdue:
            parts.append(f"{overdue} overdue")
        if new:
            parts.append(f"{new} new lead{'s' if new != 1 else ''}")
        if stale:
            parts.append(f"{stale} deal{'s' if stale != 1 else ''} gone quiet")
        _once(
            user,
            ref=f"bd-digest:{user.pk}:{local_now.date().isoformat()}",
            title="☀️ Your day",
            body=", ".join(parts),
        )
        sent += 1
    return {"sent": sent}


@shared_task
def response_time_alerts():
    """Every 15 min: a lead nobody has contacted within 2 working hours nudges
    the BDE; at 4 working hours it escalates to the superadmin."""
    from notifications.services import _superadmins

    from .models import Lead

    now = timezone.now()
    horizon = now - timedelta(days=14)
    leads = Lead.objects.filter(
        status=Lead.Status.NEW,
        first_contacted_at__isnull=True,
        created_at__gte=horizon,
        admin_alerted_at__isnull=True,
    ).select_related("owner")
    owner_alerts = admin_alerts = 0
    for lead in leads[:300]:
        waited = services.working_minutes(lead.created_at, now)
        if waited >= 240:
            admins = list(_superadmins())
            owner_name = lead.owner.full_name or lead.owner.email
            for admin in admins:
                if admin.pk == lead.owner_id:
                    continue
                _once(
                    admin,
                    ref=f"bd-lead-late-admin:{lead.pk}",
                    title=f"🚨 Lead not contacted: {lead.display_name}",
                    body=f"{owner_name} hasn't contacted this lead after 4 working hours.",
                )
            lead.admin_alerted_at = now
            lead.save(update_fields=["admin_alerted_at", "updated_at"])
            admin_alerts += 1
        if waited >= 120 and lead.owner_alerted_at is None:
            _once(
                lead.owner,
                ref=f"bd-lead-late:{lead.pk}",
                title=f"⚡ New lead waiting: {lead.display_name}",
                body="This lead hasn't been contacted yet — give them a call or WhatsApp.",
            )
            lead.owner_alerted_at = now
            lead.save(update_fields=["owner_alerted_at", "updated_at"])
            owner_alerts += 1
    return {"owner_alerts": owner_alerts, "admin_alerts": admin_alerts}


@shared_task
def stale_deal_alerts():
    """08:30 Dubai daily: open deals with no activity for 5 days nudge their
    owner each day until something is logged (logging clears the nudge)."""
    from notifications.models import NotificationEvent
    from notifications.services import stop_recurring_reminder

    from .models import Deal

    now = timezone.now()
    cutoff = now - timedelta(days=services.STALE_DEAL_DAYS)
    stale_ids = set()
    nudged = 0
    for deal in Deal.objects.filter(stage__in=Deal.OPEN_STAGES).select_related("lead", "owner"):
        last = max(deal.lead.last_activity_at, deal.stage_changed_at)
        if last > cutoff:
            continue
        stale_ids.add(deal.pk)
        days = (now - last).days
        _nudge(
            deal.owner,
            ref=f"bd-stale:{deal.pk}",
            title=f"💤 Deal gone quiet: {deal.title}",
            body=f"No activity for {days} days. Log a call, WhatsApp or note to keep it moving.",
        )
        nudged += 1
    # Anything that has since been touched / closed no longer needs its nudge.
    for ref in NotificationEvent.objects.filter(
        object_ref__startswith="bd-stale:", active=True
    ).values_list("object_ref", flat=True).distinct():
        deal_id = int(ref.split(":")[1])
        if deal_id not in stale_ids:
            stop_recurring_reminder(object_ref=ref)
    return {"nudged": nudged}


# ---------------------------------------------------------------------------
# Phase 2
# ---------------------------------------------------------------------------
@shared_task
def pull_meta_leads():
    """Every 15 min: import new Meta Lead Ads submissions (no-op until the page
    token is configured)."""
    from .capture import pull_meta_leads as pull

    return pull()


@shared_task
def poll_sales_inbox():
    """Every 10 min: log replies from known leads (no-op until the IMAP
    settings are configured)."""
    from .mail import poll_inbox

    return poll_inbox()


@shared_task
def weekly_pipeline_email():
    """Monday 08:00 Dubai: last week's numbers to every active superadmin."""
    from django.core.mail import send_mail

    from accounts.models import Role, User, UserStatus

    from .mail import _connection, can_send, from_address
    from .models import Lead
    from .reports import build_report

    if not can_send():
        return 0
    end = timezone.now()
    start = end - timedelta(days=7)
    r = build_report(start, end)
    s, p = r["summary"], r["pipeline"]
    stale = len(services.build_my_day(Lead.objects.all(), _all_deals(), _all_follow_ups())["stale_deals"])

    def money(v):
        return f"AED {float(v):,.0f}"

    lines = [
        "Business Development — week in review",
        f"{start:%d %b} – {end:%d %b %Y}",
        "",
        f"New leads: {s['new_leads']}",
        f"Deals moved between stages: {p['stage_moves']}",
        f"Won: {s['won']} ({money(s['won_value_aed'])})   Lost: {s['lost']}   Win rate: {s['win_rate']}%",
        f"Open pipeline: {p['open_deals']} deals, {money(p['open_value_aed'])}",
        f"Deals gone quiet (5+ days): {stale}",
        "",
        "By source:",
        *[f"  {x['label']}: {x['leads']} leads, {x['won']} won" for x in r["sources"]],
        "",
        "By BDE:",
        *[
            f"  {x['name']}: {x['leads']} leads, {x['calls']} calls, {x['whatsapp']} WhatsApp, {x['emails']} emails, {x['won']} won"
            for x in r["per_bde"]
        ],
    ]
    recipients = list(
        User.objects.filter(role=Role.SUPERADMIN, status=UserStatus.ACTIVE, is_active=True)
        .exclude(email="")
        .values_list("email", flat=True)
    )
    if not recipients:
        return 0
    send_mail(
        subject=f"Pipeline this week: {s['new_leads']} new leads, {s['won']} won",
        message="\n".join(lines),
        from_email=from_address(),
        recipient_list=recipients,
        connection=_connection(),
        fail_silently=True,
    )
    return len(recipients)


def _all_deals():
    from .models import Deal

    return Deal.objects.select_related("lead", "owner")


def _all_follow_ups():
    from .models import FollowUp

    return FollowUp.objects.select_related("lead", "owner")


@shared_task
def rescore_leads():
    """Nightly: re-score open leads so 'quiet for N days' ages. Short queries, no external service."""
    from . import scoring

    return {"rescored": scoring.refresh_all(open_only=True)}
