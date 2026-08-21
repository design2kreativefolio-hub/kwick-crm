"""Employee / client report aggregation + date helpers (used by API and EDITH)."""

from __future__ import annotations

import calendar
import re
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone

from accounts.models import User, UserStatus
from common.maintenance import exclude_system_accounts
from daily_tracker.models import DailyTrackerEntry
from hr.models import Leave
from projects.models import ContentCalendarItem, Project
from renewals.models import Renewal
from sales.models import Client, Invoice
from tasks.models import Task
from tasks.services import not_todo_linked


def parse_iso_date(value) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def this_month_range(today: date | None = None) -> tuple[date, date]:
    today = today or timezone.localdate()
    start = today.replace(day=1)
    last = calendar.monthrange(today.year, today.month)[1]
    return start, today.replace(day=last)


def last_n_months_range(n: int = 6, today: date | None = None) -> tuple[date, date]:
    today = today or timezone.localdate()
    # Inclusive: roughly n calendar months back from today
    month = today.month - (n - 1)
    year = today.year
    while month <= 0:
        month += 12
        year -= 1
    start = date(year, month, 1)
    return start, today


def this_year_range(today: date | None = None) -> tuple[date, date]:
    today = today or timezone.localdate()
    return date(today.year, 1, 1), date(today.year, 12, 31)


def parse_period_phrase(text: str, today: date | None = None) -> tuple[date, date] | None:
    """Best-effort parse of natural language date ranges from EDITH chats."""
    today = today or timezone.localdate()
    q = (text or "").lower()

    if re.search(r"\b(this|current)\s+month\b", q) or re.search(r"\bmonth\s+to\s+date\b", q):
        return this_month_range(today)
    if re.search(r"\blast\s+month\b", q):
        first = today.replace(day=1)
        end = first - timedelta(days=1)
        start = end.replace(day=1)
        return start, end
    if re.search(r"\b(last|past)\s+6\s+months?\b", q) or re.search(r"\bsix\s+months?\b", q):
        return last_n_months_range(6, today)
    if re.search(r"\b(this|current)\s+year\b", q) or re.search(r"\byear\s+to\s+date\b|\bytd\b", q):
        return this_year_range(today)
    if re.search(r"\blast\s+year\b", q):
        y = today.year - 1
        return date(y, 1, 1), date(y, 12, 31)

    # Explicit ISO or common formats: from X to Y / between X and Y
    m = re.search(
        r"(?:from|between)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+"
        r"(?:to|and|-|until)\s+(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
        q,
    )
    if m:
        a, b = _flex_date(m.group(1)), _flex_date(m.group(2))
        if a and b:
            return (a, b) if a <= b else (b, a)

    iso_dates = re.findall(r"\b(\d{4}-\d{2}-\d{2})\b", q)
    if len(iso_dates) >= 2:
        a, b = parse_iso_date(iso_dates[0]), parse_iso_date(iso_dates[1])
        if a and b:
            return (a, b) if a <= b else (b, a)

    return None


def _flex_date(raw: str) -> date | None:
    raw = raw.strip()
    d = parse_iso_date(raw)
    if d:
        return d
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%y", "%d-%m-%y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def report_options() -> dict:
    staff = exclude_system_accounts(
        User.objects.filter(status=UserStatus.ACTIVE, is_active=True)
    ).order_by("full_name", "email")
    clients = Client.objects.order_by("name")
    return {
        "employees": [
            {
                "id": u.id,
                "name": u.full_name or u.email,
                "email": u.email,
                "role": u.role,
            }
            for u in staff
        ],
        "clients": [
            {
                "id": c.id,
                "name": c.name,
                "client_id": c.client_id,
                "company": c.company or "",
            }
            for c in clients
        ],
    }


def resolve_subject(report_type: str, name: str) -> dict:
    """Resolve a free-text name to employee(s) or client(s)."""
    name = (name or "").strip()
    if not name:
        return {"matches": [], "error": "Name is required."}

    if report_type == "employee":
        qs = exclude_system_accounts(
            User.objects.filter(status=UserStatus.ACTIVE, is_active=True)
        ).filter(Q(full_name__icontains=name) | Q(email__icontains=name))
        matches = [
            {"id": u.id, "name": u.full_name or u.email, "email": u.email}
            for u in qs.order_by("full_name")[:8]
        ]
    elif report_type == "client":
        qs = Client.objects.filter(Q(name__icontains=name) | Q(client_id__icontains=name) | Q(company__icontains=name))
        matches = [
            {"id": c.id, "name": c.name, "client_id": c.client_id, "company": c.company or ""}
            for c in qs.order_by("name")[:8]
        ]
    else:
        return {"matches": [], "error": "type must be employee or client."}

    return {"matches": matches}


def build_report(
    report_type: str,
    subject_id: int,
    date_from: date,
    date_to: date,
) -> dict:
    if date_from > date_to:
        date_from, date_to = date_to, date_from

    if report_type == "employee":
        return _employee_report(subject_id, date_from, date_to)
    if report_type == "client":
        return _client_report(subject_id, date_from, date_to)
    raise ValueError("type must be employee or client")


def _fmt(d: date | None) -> str:
    return d.isoformat() if d else ""


def _employee_report(user_id: int, date_from: date, date_to: date) -> dict:
    user = User.objects.filter(pk=user_id).first()
    if not user:
        raise LookupError("Employee not found.")

    assigned = Q(assignee=user) | Q(assignees=user)
    completed_qs = not_todo_linked(
        Task.objects.filter(
            assigned,
            status__in=Task.TERMINAL_STATUSES,
            completed_at__date__gte=date_from,
            completed_at__date__lte=date_to,
        )
    ).select_related("project").distinct()

    open_qs = (
        not_todo_linked(Task.objects.filter(assigned))
        .exclude(status__in=Task.TERMINAL_STATUSES)
        .filter(
            Q(due_date__gte=date_from, due_date__lte=date_to)
            | Q(due_date__isnull=True, created_at__date__gte=date_from, created_at__date__lte=date_to)
            | Q(created_at__date__gte=date_from, created_at__date__lte=date_to)
        )
        .select_related("project")
        .distinct()
    )

    projects_qs = (
        Project.objects.filter(members=user)
        .filter(
            Q(start_date__lte=date_to, end_date__gte=date_from)
            | Q(start_date__gte=date_from, start_date__lte=date_to)
            | Q(delivery_date__gte=date_from, delivery_date__lte=date_to)
            | Q(end_date__gte=date_from, end_date__lte=date_to)
            | Q(created_at__date__gte=date_from, created_at__date__lte=date_to)
            | Q(start_date__isnull=True, end_date__isnull=True, delivery_date__isnull=True)
        )
        .distinct()
    )

    tracker_qs = DailyTrackerEntry.objects.filter(
        user=user, date__gte=date_from, date__lte=date_to
    ).order_by("date")

    leave_qs = Leave.objects.filter(
        staff=user,
        status=Leave.Status.APPROVED,
        start_date__lte=date_to,
        end_date__gte=date_from,
    ).order_by("start_date")

    leave_days = 0
    for lv in leave_qs:
        overlap_start = max(lv.start_date, date_from)
        overlap_end = min(lv.end_date, date_to)
        leave_days += (overlap_end - overlap_start).days + 1

    completed = [_task_row(t) for t in completed_qs.order_by("-completed_at")[:200]]
    open_tasks = [_task_row(t) for t in open_qs.order_by("due_date")[:200]]
    projects = [_project_row(p) for p in projects_qs.order_by("-updated_at")[:100]]
    tracker = [
        {
            "id": e.id,
            "date": _fmt(e.date),
            "task_name": e.task_name,
            "description": e.description or "",
        }
        for e in tracker_qs[:200]
    ]
    leaves = [
        {
            "id": lv.id,
            "type": lv.leave_type,
            "start_date": _fmt(lv.start_date),
            "end_date": _fmt(lv.end_date),
            "days": lv.days,
            "reason": lv.reason or "",
        }
        for lv in leave_qs[:100]
    ]

    return {
        "type": "employee",
        "subject": {
            "id": user.id,
            "name": user.full_name or user.email,
            "email": user.email,
            "role": user.role,
        },
        "date_from": _fmt(date_from),
        "date_to": _fmt(date_to),
        "summary": {
            "tasks_completed": len(completed),
            "tasks_open": open_qs.count(),
            "projects": projects_qs.count(),
            "daily_tracker_entries": tracker_qs.count(),
            "leave_days": leave_days,
        },
        "tasks_completed": completed,
        "tasks_open": open_tasks,
        "projects": projects,
        "daily_tracker": tracker,
        "leave": leaves,
    }


def _client_report(client_id: int, date_from: date, date_to: date) -> dict:
    client = Client.objects.filter(pk=client_id).first()
    if not client:
        raise LookupError("Client not found.")

    name = client.name

    projects_qs = Project.objects.filter(client__iexact=name).filter(
        Q(start_date__lte=date_to, end_date__gte=date_from)
        | Q(start_date__gte=date_from, start_date__lte=date_to)
        | Q(delivery_date__gte=date_from, delivery_date__lte=date_to)
        | Q(created_at__date__gte=date_from, created_at__date__lte=date_to)
        | Q(client__iexact=name)  # always include name-matched projects in period loosely
    )
    # Prefer projects that touch the period; if none, still show all name-matched
    period_projects = projects_qs.filter(
        Q(start_date__lte=date_to) & (Q(end_date__gte=date_from) | Q(end_date__isnull=True))
        | Q(delivery_date__gte=date_from, delivery_date__lte=date_to)
        | Q(created_at__date__gte=date_from, created_at__date__lte=date_to)
        | Q(updated_at__date__gte=date_from, updated_at__date__lte=date_to)
    ).distinct()
    if not period_projects.exists():
        period_projects = Project.objects.filter(client__iexact=name)

    content_qs = ContentCalendarItem.objects.filter(
        client=client,
        scheduled_date__gte=date_from,
        scheduled_date__lte=date_to,
    ).prefetch_related("assignees")

    tasks_qs = not_todo_linked(
        Task.objects.filter(Q(content_item__client=client) | Q(client=client) | Q(client_name__iexact=name))
    ).filter(
        Q(completed_at__date__gte=date_from, completed_at__date__lte=date_to)
        | Q(due_date__gte=date_from, due_date__lte=date_to)
        | Q(created_at__date__gte=date_from, created_at__date__lte=date_to)
    ).select_related("assignee", "project").distinct()

    renewals_qs = Renewal.objects.filter(
        subject_type=Renewal.SubjectType.CLIENT, client=client
    ).order_by("due_date")

    invoices_qs = Invoice.objects.filter(client=client).filter(
        Q(due_date__gte=date_from, due_date__lte=date_to)
        | Q(created_at__date__gte=date_from, created_at__date__lte=date_to)
    )

    inv_total = invoices_qs.aggregate(s=Sum("amount"))["s"] or Decimal("0")
    inv_paid = invoices_qs.filter(status=Invoice.Status.PAID).aggregate(s=Sum("amount"))["s"] or Decimal("0")
    inv_overdue = invoices_qs.filter(status=Invoice.Status.OVERDUE).aggregate(s=Sum("amount"))["s"] or Decimal("0")

    upcoming = renewals_qs.filter(
        status__in=[Renewal.Status.UPCOMING, Renewal.Status.OVERDUE],
        due_date__lte=date_to + timedelta(days=90),
    )

    projects = [_project_row(p) for p in period_projects.order_by("-updated_at")[:100]]
    content = [
        {
            "id": it.id,
            "title": it.title,
            "content_type": it.content_type,
            "status": it.status,
            "scheduled_date": _fmt(it.scheduled_date),
            "deadline": _fmt(it.deadline),
            "assignees": [a.full_name or a.email for a in it.assignees.all()],
        }
        for it in content_qs.order_by("scheduled_date")[:200]
    ]
    tasks = [_task_row(t) for t in tasks_qs.order_by("-updated_at")[:200]]
    renewals = [
        {
            "id": r.id,
            "renewal_type": r.renewal_type,
            "due_date": _fmt(r.due_date),
            "status": r.status,
            "notes": r.notes or "",
        }
        for r in renewals_qs[:100]
    ]
    invoices = [
        {
            "id": inv.id,
            "invoice_number": inv.invoice_number or f"#{inv.id}",
            "amount": str(inv.amount),
            "status": inv.status,
            "due_date": _fmt(inv.due_date),
            "created_at": inv.created_at.date().isoformat() if inv.created_at else "",
        }
        for inv in invoices_qs.order_by("-created_at")[:100]
    ]

    return {
        "type": "client",
        "subject": {
            "id": client.id,
            "name": client.name,
            "client_id": client.client_id,
            "company": client.company or "",
        },
        "date_from": _fmt(date_from),
        "date_to": _fmt(date_to),
        "summary": {
            "projects": len(projects),
            "content_items": content_qs.count(),
            "tasks": tasks_qs.count(),
            "renewals": renewals_qs.count(),
            "upcoming_renewals": upcoming.count(),
            "invoices": invoices_qs.count(),
            "invoiced_total": str(inv_total),
            "invoiced_paid": str(inv_paid),
            "invoiced_overdue": str(inv_overdue),
        },
        "projects": projects,
        "content_calendar": content,
        "tasks": tasks,
        "renewals": renewals,
        "invoices": invoices,
    }


def _task_row(t: Task) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "status": t.status,
        "priority": t.priority,
        "due_date": _fmt(t.due_date),
        "completed_at": t.completed_at.date().isoformat() if t.completed_at else "",
        "project": t.project.name if t.project_id else "",
        "client_name": t.client_name or "",
        "assignee": (t.assignee.full_name or t.assignee.email) if getattr(t, "assignee_id", None) else "",
    }


def _project_row(p: Project) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "client": p.client or "",
        "status": p.status,
        "priority": p.priority,
        "start_date": _fmt(p.start_date),
        "end_date": _fmt(p.end_date),
        "delivery_date": _fmt(p.delivery_date),
    }


def summary_text(report: dict) -> str:
    """Short plain-language summary for EDITH chat."""
    subj = report.get("subject") or {}
    name = subj.get("name") or "Subject"
    df, dt = report.get("date_from"), report.get("date_to")
    s = report.get("summary") or {}
    if report.get("type") == "employee":
        return (
            f"Employee report for **{name}** ({df} → {dt}):\n"
            f"• Tasks completed: {s.get('tasks_completed', 0)}\n"
            f"• Tasks still open: {s.get('tasks_open', 0)}\n"
            f"• Projects: {s.get('projects', 0)}\n"
            f"• Daily tracker entries: {s.get('daily_tracker_entries', 0)}\n"
            f"• Leave days (approved, overlapping): {s.get('leave_days', 0)}\n\n"
            "I've attached the full PDF below."
        )
    return (
        f"Client report for **{name}** ({df} → {dt}):\n"
        f"• Projects: {s.get('projects', 0)}\n"
        f"• Content items: {s.get('content_items', 0)}\n"
        f"• Tasks: {s.get('tasks', 0)}\n"
        f"• Renewals on file: {s.get('renewals', 0)} "
        f"(upcoming/overdue soon: {s.get('upcoming_renewals', 0)})\n"
        f"• Invoices in period: {s.get('invoices', 0)} "
        f"(total AED {s.get('invoiced_total', '0')}, "
        f"paid {s.get('invoiced_paid', '0')}, overdue {s.get('invoiced_overdue', '0')})\n\n"
        "I've attached the full PDF below."
    )
