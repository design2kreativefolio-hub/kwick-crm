"""Dashboard Reminders card — open calendar reminders, to-dos, and notifications."""
from __future__ import annotations

from django.db.models import Q

from calendar_app.models import ManualReminder
from notifications.models import DashboardCardDismiss, NotificationEvent
from todos.models import TodoItem

SOURCE_HREF = {
    "renewal": "/renewals",
    "calendar": "/calendar",
    "task": "/tasks",
    "content_calendar": "/tasks",
    "leave_request": "/hr/staff",
    "ticket": "/support",
    "document": "/hr/documents",
    "staff_renewal": "/hr/staff",
    "registration": "/hr/staff",
    "project": "/projects",
}


def _notification_href(ev: NotificationEvent) -> str:
    ref = ev.object_ref or ""
    if ref.startswith("task:"):
        parts = ref.split(":")
        if len(parts) >= 2 and parts[1].isdigit():
            return f"/tasks/{parts[1]}"
    return SOURCE_HREF.get(ev.source, "/tasks" if ev.source in ("task", "content_calendar") else "")


def _dismissed_ids(user, kind: str) -> set[int]:
    return set(
        DashboardCardDismiss.objects.filter(user=user, kind=kind).values_list("object_id", flat=True)
    )


def build_dashboard_card_items(user, *, limit: int = 24) -> list[dict]:
    """Unified feed for the dashboard Reminders card (not marked done / not card-dismissed)."""
    dismissed_notif = _dismissed_ids(user, DashboardCardDismiss.Kind.NOTIFICATION)
    dismissed_rem = _dismissed_ids(user, DashboardCardDismiss.Kind.REMINDER)
    dismissed_todo = _dismissed_ids(user, DashboardCardDismiss.Kind.TODO)

    items: list[dict] = []

    # Open calendar reminders: owned by me or assigned to me.
    rem_qs = (
        ManualReminder.objects.filter(done=False)
        .filter(Q(owner=user) | Q(assignees=user))
        .distinct()
        .order_by("remind_at")[:50]
    )
    for rem in rem_qs:
        if rem.id in dismissed_rem:
            continue
        items.append(
            {
                "kind": "reminder",
                "id": rem.id,
                "title": rem.title,
                "body": (rem.description or "")[:180],
                "source": "calendar",
                "href": "/calendar",
                "at": rem.remind_at.isoformat(),
                "created_at": rem.created_at.isoformat(),
            }
        )

    # Open personal to-dos.
    todo_qs = TodoItem.objects.filter(owner=user, done=False).order_by("due_date", "created_at")[:50]
    for todo in todo_qs:
        if todo.id in dismissed_todo:
            continue
        items.append(
            {
                "kind": "todo",
                "id": todo.id,
                "title": todo.text,
                "body": "To-do" + (f" · due {todo.due_date.isoformat()}" if todo.due_date else ""),
                "source": "todo",
                "href": "/todo",
                "at": (todo.due_date.isoformat() if todo.due_date else todo.created_at.isoformat()),
                "created_at": todo.created_at.isoformat(),
            }
        )

    # Unread in-app notifications — card tick dismisses only (not mark read).
    # Marking read on the Reminders page drops them from this card.
    notif_qs = NotificationEvent.objects.filter(
        user=user, active=True, read_at__isnull=True
    ).order_by("-created_at")[:80]
    for ev in notif_qs:
        if ev.id in dismissed_notif:
            continue
        # Avoid duplicating calendar rows already listed as open reminders.
        ref = ev.object_ref or ""
        if ev.source == "calendar" and (
            ref.startswith("reminder-day:")
            or ref.startswith("reminder-hour:")
            or ref.startswith("reminder:")
        ):
            continue
        items.append(
            {
                "kind": "notification",
                "id": ev.id,
                "title": ev.title,
                "body": (ev.body or "")[:180],
                "source": ev.source,
                "href": _notification_href(ev),
                "at": (ev.sent_at or ev.created_at).isoformat(),
                "created_at": ev.created_at.isoformat(),
                "read_at": ev.read_at.isoformat() if ev.read_at else None,
            }
        )

    # Prefer actionable calendar/todo, then unread notifications, then newest.
    def sort_key(row: dict):
        kind_rank = {"reminder": 0, "todo": 0, "notification": 1}.get(row["kind"], 2)
        unread = 0 if (row.get("read_at") is None and row["kind"] == "notification") else 1
        if row["kind"] in ("reminder", "todo"):
            unread = 0
        return (kind_rank, unread, row.get("at") or "", -1)

    items.sort(key=lambda r: (sort_key(r)[0], sort_key(r)[1], r.get("at") or ""))
    return items[:limit]
