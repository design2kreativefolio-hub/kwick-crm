"""
Merged, read-aggregated agenda (spec §10). Pulls from Tasks, Daily Tracker,
Renewals and Manual Reminders and tags each item with its `source`.
"""
from datetime import date, datetime

from django.db.models import Q

from calendar_app.models import ManualReminder
from common.permissions import is_superadmin
from daily_tracker.models import DailyTrackerEntry
from projects.models import ContentCalendarItem, Project
from renewals.models import Renewal
from tasks.models import Task


def _iso(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def build_agenda(*, user, dt_from, dt_to, scope="self"):
    """Return a flat, date-sorted list of agenda items. scope='all' is manager-only."""
    company = scope == "all" and is_superadmin(user)
    items = []

    # --- Tasks with a due_date ---
    task_qs = Task.objects.filter(due_date__range=(dt_from, dt_to)).select_related("assignee")
    if company:
        # Company-wide view stays focused on real tasks — a task mirrored
        # from a client's content calendar assignment (spec follow-up: the
        # superadmin's calendar shouldn't show employees' per-client social
        # media assignments) is surfaced on that client's own calendar
        # instead, not here.
        task_qs = task_qs.filter(content_item__isnull=True)
    else:
        task_qs = task_qs.filter(assignee=user)
    for t in task_qs:
        items.append(
            {
                "source": "task",
                "id": t.id,
                "title": t.title,
                "date": _iso(t.due_date),
                "meta": {"status": t.status, "assignee": t.assignee_id, "priority": t.priority},
            }
        )

    # --- Daily tracker entries ---
    dt_qs = DailyTrackerEntry.objects.filter(date__range=(dt_from, dt_to)).select_related("user")
    if not company:
        dt_qs = dt_qs.filter(user=user)
    for e in dt_qs:
        items.append(
            {
                "source": "daily_tracker",
                "id": e.id,
                "title": e.task_name,
                "date": _iso(e.date),
                "meta": {"user": e.user_id},
            }
        )

    # --- Project delivery dates ---
    project_qs = Project.objects.filter(delivery_date__range=(dt_from, dt_to)).prefetch_related("members")
    if not company:
        project_qs = project_qs.filter(members=user)
    for p in project_qs.distinct():
        items.append(
            {
                "source": "project",
                "id": p.id,
                "title": f"{p.name} — delivery",
                "date": _iso(p.delivery_date),
                "meta": {"status": p.status, "client": p.client},
            }
        )

    # --- Content calendar items (client social media calendar) — self scope
    # only; the superadmin's company-wide calendar deliberately excludes
    # these (spec follow-up), see that client's own calendar page instead. ---
    if not company:
        content_qs = ContentCalendarItem.objects.filter(
            scheduled_date__range=(dt_from, dt_to), assignees=user
        ).select_related("client")
        for ci in content_qs.distinct():
            items.append(
                {
                    "source": "content_calendar",
                    "id": ci.id,
                    "title": f"{ci.title} — {ci.client.name}",
                    "date": _iso(ci.scheduled_date),
                    "meta": {"status": ci.status, "content_type": ci.content_type, "client": ci.client_id},
                }
            )

    # --- Renewals (client + staff) — manager scope only ---
    if company:
        for r in Renewal.objects.filter(due_date__range=(dt_from, dt_to)):
            items.append(
                {
                    "source": "renewal",
                    "id": r.id,
                    "title": f"{r.get_renewal_type_display()} renewal",
                    "date": _iso(r.due_date),
                    "meta": {"subject_type": r.subject_type, "status": r.status},
                }
            )

    # --- Manual reminders: own always; company-wide visible to everyone ---
    rem_qs = ManualReminder.objects.filter(remind_at__date__range=(dt_from, dt_to)).select_related(
        "owner"
    )
    if not company:
        rem_qs = rem_qs.filter(Q(owner=user) | Q(visibility=ManualReminder.Visibility.COMPANY))
    for m in rem_qs:
        items.append(
            {
                "source": "manual",
                "id": m.id,
                "title": m.title,
                "date": _iso(m.remind_at),
                "meta": {"visibility": m.visibility, "owner": m.owner_id},
            }
        )

    items.sort(key=lambda x: x["date"])
    return items
