"""
Merged, read-aggregated agenda (spec §10). Pulls from Tasks, Daily Tracker,
Renewals and Manual Reminders and tags each item with its `source`.
"""
from datetime import date, datetime

from django.db.models import Q

from calendar_app.models import ManualReminder
from common.permissions import is_manager
from daily_tracker.models import DailyTrackerEntry
from renewals.models import Renewal
from tasks.models import Task


def _iso(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def build_agenda(*, user, dt_from, dt_to, scope="self"):
    """Return a flat, date-sorted list of agenda items. scope='all' is manager-only."""
    company = scope == "all" and is_manager(user)
    items = []

    # --- Tasks with a due_date ---
    task_qs = Task.objects.filter(due_date__range=(dt_from, dt_to)).select_related("assignee")
    if not company:
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
