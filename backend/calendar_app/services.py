"""
Merged, read-aggregated agenda (spec §10). Pulls from Tasks, Daily Tracker,
Renewals, Manual Reminders, Todos and tags each item with its `source`.
"""
from datetime import date, datetime, timedelta
from urllib.parse import urlparse

from django.db.models import Q
from django.utils import timezone

from calendar_app.models import ManualReminder
from common.permissions import is_superadmin
from daily_tracker.models import DailyTrackerEntry
from projects.models import ContentCalendarItem, Project
from renewals.models import Renewal
from tasks.models import Task
from tasks.services import not_todo_linked
from todos.models import TodoItem


def _iso(value):
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def detect_meeting_url(text: str) -> str:
    """Return the first Teams / Google Meet / Zoom URL found in free text, else ''."""
    if not text:
        return ""
    markers = (
        "teams.microsoft.com",
        "meet.google.com",
        "zoom.us",
        "zoom.com",
    )
    for token in text.replace("\n", " ").split():
        lower = token.lower().rstrip(".,);]")
        if any(m in lower for m in markers):
            if lower.startswith("http"):
                return token.rstrip(".,);]")
            return f"https://{token.rstrip('.,);]')}"
    return ""


def is_meeting_link(url: str) -> bool:
    if not url:
        return False
    try:
        host = urlparse(url).netloc.lower()
    except Exception:
        return False
    return (
        "teams.microsoft.com" in host
        or "meet.google.com" in host
        or "zoom.us" in host
        or host.endswith(".zoom.us")
        or "zoom.com" in host
    )


def next_occurrence(remind_at: datetime, recurrence: str) -> datetime | None:
    if recurrence == ManualReminder.Recurrence.DAILY:
        return remind_at + timedelta(days=1)
    if recurrence == ManualReminder.Recurrence.WEEKLY:
        return remind_at + timedelta(weeks=1)
    if recurrence == ManualReminder.Recurrence.MONTHLY:
        # Advance one calendar month without depending on python-dateutil.
        year, month = remind_at.year, remind_at.month + 1
        if month > 12:
            year, month = year + 1, 1
        day = min(remind_at.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1])
        return remind_at.replace(year=year, month=month, day=day)
    return None


def expand_reminder_dates(reminder: ManualReminder, dt_from: date, dt_to: date):
    """Yield (datetime, done_for_occurrence) pairs that fall in [dt_from, dt_to]."""
    cursor = reminder.remind_at
    if timezone.is_naive(cursor):
        cursor = timezone.make_aware(cursor)

    # Walk forward from the stored remind_at until we pass the range end.
    # Cap iterations so a bad recurrence can't spin forever.
    for _ in range(400):
        d = timezone.localtime(cursor).date()
        if reminder.recurrence_end and d > reminder.recurrence_end:
            break
        if d > dt_to:
            break
        if d >= dt_from:
            # Only the "current" stored occurrence can be marked done; past
            # expanded instances of a series are treated as completed visually
            # when the reminder itself is done and recurrence is none, or when
            # this cursor matches the live remind_at and done=True.
            same_as_live = timezone.localtime(cursor) == timezone.localtime(reminder.remind_at)
            done = bool(reminder.done and (reminder.recurrence == ManualReminder.Recurrence.NONE or same_as_live))
            yield cursor, done
        nxt = next_occurrence(cursor, reminder.recurrence)
        if nxt is None:
            break
        cursor = nxt


def build_agenda(*, user, dt_from, dt_to, scope="self"):
    """Return a flat, date-sorted list of agenda items.

    Personal calendar (scope='self'): own tasks/reminders/todos, plus every
    client's content-calendar item for all employees. scope='all' remains for
    manager company views elsewhere.
    """
    company = scope == "all" and is_superadmin(user)
    items = []

    # --- Tasks with a due_date ---
    # Content-calendar mirrors appear under source=content_calendar (company-wide
    # for every employee). Keep personal tasks here only to avoid duplicates.
    # One card per task even with several assignees (M2M + distinct).
    task_qs = not_todo_linked(
        Task.objects.filter(due_date__range=(dt_from, dt_to), content_item__isnull=True)
        .select_related("assignee", "client")
        .prefetch_related("assignees")
    )
    if not company:
        task_qs = task_qs.filter(Q(assignee=user) | Q(assignees=user))
    for t in task_qs.distinct():
        people = list(t.assignees.all())
        if not people and t.assignee:
            people = [t.assignee]
        time_label = ""
        if t.due_time:
            time_label = t.due_time.strftime("%I:%M %p").lstrip("0")
        items.append(
            {
                "source": "task",
                "id": t.id,
                "title": t.title,
                "date": _iso(t.due_date),
                # Published is the finished / struck state; completed stays open visually.
                "done": t.status == Task.Status.APPROVED,
                "meta": {
                    "status": t.status,
                    "assignee": t.assignee_id,
                    "assignee_name": (t.assignee.full_name or t.assignee.email) if t.assignee else "",
                    "priority": t.priority,
                    "client": t.client_id,
                    "meeting_url": detect_meeting_url(t.description or ""),
                    "time": time_label,
                    "assignees": [{"id": u.id, "name": u.full_name or u.email} for u in people],
                },
            }
        )

    # --- Personal to-dos (self scope only) ---
    # One summary card for pending to-dos (not every checklist row).
    if not company:
        today = timezone.localdate()
        if dt_from <= today <= dt_to:
            pending_todos = TodoItem.objects.filter(owner=user, done=False).count()
            if pending_todos:
                label = "pending to-do" if pending_todos == 1 else "pending to-dos"
                items.append(
                    {
                        "source": "todo",
                        "id": 0,
                        "title": f"{pending_todos} {label}",
                        "date": _iso(today),
                        "done": False,
                        "meta": {
                            "status": "todo",
                            "summary": True,
                            "pending_count": pending_todos,
                        },
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
                "done": False,
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
                "done": p.status in Project.TERMINAL_STATUSES,
                "meta": {"status": p.status, "client": p.client},
            }
        )

    # --- Content calendar items — every employee sees all client content ---
    if not company:
        content_qs = (
            ContentCalendarItem.objects.filter(scheduled_date__range=(dt_from, dt_to))
            .select_related("client")
            .prefetch_related("assignees")
        )
        for ci in content_qs:
            meeting = detect_meeting_url(ci.description or "")
            items.append(
                {
                    "source": "content_calendar",
                    "id": ci.id,
                    "title": f"{ci.title} — {ci.client.name}",
                    "date": _iso(ci.scheduled_date),
                    # Finished / strikethrough only after Published (not Completed).
                    "done": ci.status == ContentCalendarItem.Status.APPROVED,
                    "meta": {
                        "status": ci.status,
                        "content_type": ci.content_type,
                        "client": ci.client_id,
                        "meeting_url": meeting,
                        "assignees": [
                            {"id": u.id, "name": u.full_name or u.email} for u in ci.assignees.all()
                        ],
                    },
                }
            )

    # --- Renewals — manager scope only ---
    if company:
        for r in Renewal.objects.filter(due_date__range=(dt_from, dt_to)):
            items.append(
                {
                    "source": "renewal",
                    "id": r.id,
                    "title": f"{r.get_renewal_type_display()} renewal",
                    "date": _iso(r.due_date),
                    "done": r.status in ("renewed", "completed", "done"),
                    "meta": {"subject_type": r.subject_type, "status": r.status},
                }
            )

    # --- Manual reminders: owner or assignee (self); all in company scope ---
    rem_qs = (
        ManualReminder.objects.filter(
            Q(remind_at__date__range=(dt_from, dt_to))
            | (
                ~Q(recurrence=ManualReminder.Recurrence.NONE)
                & Q(remind_at__date__lte=dt_to)
                & (Q(recurrence_end__isnull=True) | Q(recurrence_end__gte=dt_from))
            )
        )
        .select_related("owner")
        .prefetch_related("assignees")
    )
    if not company:
        rem_qs = rem_qs.filter(
            Q(owner=user)
            | Q(assignees=user)
            | Q(visibility=ManualReminder.Visibility.COMPANY)
        ).distinct()

    for m in rem_qs:
        desc = m.description or ""
        # Auto-generated per-assignee alerts stay for notification timing, but
        # must not render extra calendar cards (the task / content item is the card).
        if "[kwick:task:" in desc or "[kwick:content_item:" in desc:
            continue
        meeting = m.meeting_url or detect_meeting_url(desc)
        assignee_list = [{"id": u.id, "name": u.full_name or u.email} for u in m.assignees.all()]
        for when, done in expand_reminder_dates(m, dt_from, dt_to):
            items.append(
                {
                    "source": "manual",
                    "id": m.id,
                    "title": m.title,
                    "date": _iso(when),
                    "done": done,
                    "meta": {
                        "visibility": m.visibility,
                        "owner": m.owner_id,
                        "owner_name": m.owner.full_name or m.owner.email,
                        "description": m.description,
                        "meeting_url": meeting,
                        "recurrence": m.recurrence,
                        "assignees": assignee_list,
                        "time": timezone.localtime(when).strftime("%I:%M %p").lstrip("0"),
                    },
                }
            )

    items.sort(key=lambda x: x["date"])
    return items
