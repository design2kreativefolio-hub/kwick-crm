"""Build a compact CRM snapshot for the signed-in user (permission-aware, read-only)."""

from __future__ import annotations

from datetime import date, timedelta

from django.conf import settings
from django.db.models import Prefetch, Q
from django.utils import timezone

from common.permissions import has_module_access, is_superadmin


def build_crm_context(user) -> dict:
    now = timezone.localtime()
    today = timezone.localdate()
    soon = today + timedelta(days=14)
    hour = now.hour
    if hour < 12:
        part_of_day = "morning"
    elif hour < 17:
        part_of_day = "afternoon"
    else:
        part_of_day = "evening"

    ctx: dict = {
        "user_name": user.full_name or user.email,
        "role": user.role,
        "today": today.isoformat(),
        "weekday": today.strftime("%A"),
        "local_time": now.strftime("%H:%M"),
        "timezone": getattr(settings, "TIME_ZONE", "UTC"),
        "part_of_day": part_of_day,
        "access": {
            "superadmin": is_superadmin(user),
            "hr": is_superadmin(user) or has_module_access(user, "hr"),
            "sales": has_module_access(user, "sales"),
            "renewals": has_module_access(user, "renewals"),
            "reports": is_superadmin(user) or has_module_access(user, "reports"),
        },
    }

    _add_team(ctx, user)
    _add_tasks(ctx, user)
    _add_todos(ctx, user)
    _add_reminders(ctx, user, today)
    _add_projects(ctx, user)
    _add_content_calendar(ctx, user, today, soon)
    _add_hr(ctx, user)
    _add_tickets(ctx, user)
    if ctx["access"]["sales"]:
        _add_clients(ctx)
        _add_sales(ctx)
    if ctx["access"]["renewals"]:
        _add_renewals(ctx, today, soon)

    return ctx


def _person_name(u) -> str:
    if not u:
        return "Unassigned"
    return (getattr(u, "full_name", None) or getattr(u, "email", None) or "Unknown").strip()


def _add_team(ctx: dict, user) -> None:
    try:
        from accounts.models import StaffProfile, User, UserStatus

        include_hr = ctx["access"]["hr"]
        qs = User.objects.filter(status=UserStatus.ACTIVE, is_active=True).order_by(
            "full_name", "email"
        )
        if include_hr:
            qs = qs.prefetch_related(
                Prefetch("profile", queryset=StaffProfile.objects.all())
            )
        else:
            qs = qs.exclude(id=user.id)

        people = []
        for u in qs[:80]:
            row = {
                "id": u.id,
                "name": _person_name(u),
                "email": u.email,
                "role": u.role,
            }
            if include_hr:
                profile = getattr(u, "profile", None)
                if profile:
                    if getattr(profile, "department", None):
                        row["department"] = profile.department
                    if getattr(profile, "job_title", None):
                        row["job_title"] = profile.job_title
                    for key, attr in (
                        ("visa_renewal", "visa_renewal_date"),
                        ("insurance_renewal", "insurance_renewal_date"),
                        ("iloe_renewal", "iloe_renewal_date"),
                    ):
                        val = getattr(profile, attr, None)
                        if val:
                            row[key] = val.isoformat()
            people.append(row)

        total = User.objects.filter(status=UserStatus.ACTIVE, is_active=True).count()
        ctx["employees_count"] = total if include_hr else len(people)
        ctx["employees"] = people
        ctx["employees_detail_level"] = "hr" if include_hr else "directory"
    except Exception:
        pass


def _add_tasks(ctx: dict, user) -> None:
    """Open tasks with assignee — company-wide for superadmin, own tasks otherwise."""
    try:
        from tasks.models import Task

        terminal = (Task.Status.COMPLETED, Task.Status.QC_COMPLETED, Task.Status.APPROVED)
        from tasks.services import not_todo_linked

        task_qs = not_todo_linked(
            Task.objects.exclude(status__in=terminal)
            .select_related("assignee", "project")
            .prefetch_related("assignees")
            .order_by("due_date", "title")
        )
        if not is_superadmin(user):
            task_qs = task_qs.filter(Q(assignee=user) | Q(assignees=user)).distinct()

        rows = []
        for t in task_qs[:40]:
            extra = [_person_name(u) for u in t.assignees.all()]
            assignee = _person_name(t.assignee)
            names = []
            for n in [assignee, *extra]:
                if n and n not in names and n != "Unassigned":
                    names.append(n)
            rows.append(
                {
                    "id": t.id,
                    "title": t.title,
                    "status": t.status,
                    "priority": t.priority,
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                    "assignee": assignee,
                    "assignee_id": t.assignee_id,
                    "assignees": names or [assignee],
                    "project": t.project.name if t.project_id else None,
                    "client_name": t.client_name or None,
                }
            )
        ctx["open_tasks_count"] = task_qs.count()
        ctx["open_tasks"] = rows

        if is_superadmin(user):
            by_person: dict[str, int] = {}
            for t in rows:
                for n in t.get("assignees") or [t["assignee"]]:
                    by_person[n] = by_person.get(n, 0) + 1
            ctx["workload"] = [
                {"person": name, "open_tasks": n}
                for name, n in sorted(by_person.items(), key=lambda x: (-x[1], x[0]))
            ]
    except Exception:
        pass


def _add_todos(ctx: dict, user) -> None:
    try:
        from todos.models import TodoItem

        todos = list(
            TodoItem.objects.filter(owner=user, done=False)
            .order_by("due_date")[:6]
            .values("id", "text", "due_date")
        )
        ctx["todos"] = [
            {
                "id": t["id"],
                "title": t["text"],
                "due_date": t["due_date"].isoformat() if t["due_date"] else None,
            }
            for t in todos
        ]
    except Exception:
        pass


def _add_reminders(ctx: dict, user, today: date) -> None:
    try:
        from calendar_app.models import ManualReminder

        end = today + timedelta(days=7)
        base = (
            ManualReminder.objects.filter(done=False)
            .filter(Q(owner=user) | Q(assignees=user) | Q(visibility="company"))
            .distinct()
        )
        ctx["open_reminders_count"] = base.count()

        rem_qs = (
            base.filter(remind_at__date__gte=today, remind_at__date__lte=end)
            .prefetch_related("assignees")
            .order_by("remind_at")[:8]
        )
        rows = []
        for r in rem_qs:
            rows.append(
                {
                    "id": r.id,
                    "title": r.title,
                    "remind_at": r.remind_at.isoformat() if r.remind_at else None,
                    "visibility": r.visibility,
                    "meeting_url": r.meeting_url or None,
                    "assignees": [_person_name(a) for a in r.assignees.all()[:6]],
                }
            )
        ctx["upcoming_reminders"] = rows

        overdue = (
            base.filter(remind_at__date__lt=today)
            .order_by("-remind_at")[:5]
            .values("id", "title", "remind_at")
        )
        ctx["overdue_reminders"] = [
            {
                "id": r["id"],
                "title": r["title"],
                "remind_at": r["remind_at"].isoformat() if r["remind_at"] else None,
            }
            for r in overdue
        ]
    except Exception:
        pass


def _add_content_calendar(ctx: dict, user, today: date, soon: date) -> None:
    """Upcoming content-calendar posts (Projects → Clients → Calendar)."""
    try:
        from projects.models import ContentCalendarItem

        qs = (
            ContentCalendarItem.objects.exclude(status__in=ContentCalendarItem.TERMINAL_STATUSES)
            .filter(scheduled_date__gte=today, scheduled_date__lte=soon)
            .select_related("client")
            .prefetch_related("assignees")
            .order_by("scheduled_date", "title")
        )
        if not is_superadmin(user):
            qs = qs.filter(Q(assignees=user) | Q(created_by=user)).distinct()

        rows = []
        for item in qs[:12]:
            rows.append(
                {
                    "id": item.id,
                    "title": item.title,
                    "status": item.status,
                    "content_type": item.content_type,
                    "scheduled_date": item.scheduled_date.isoformat(),
                    "deadline": item.deadline.isoformat() if item.deadline else None,
                    "client": item.client.name if item.client_id else None,
                    "client_id": item.client_id,
                    "assignees": [_person_name(a) for a in item.assignees.all()[:6]],
                }
            )
        ctx["content_calendar_count"] = qs.count()
        ctx["content_calendar"] = rows
    except Exception:
        pass


def _add_projects(ctx: dict, user) -> None:
    try:
        from projects.models import Project

        proj_qs = (
            Project.objects.exclude(status__in=Project.TERMINAL_STATUSES)
            .prefetch_related("members")
            .order_by("-updated_at")
        )
        if not is_superadmin(user):
            proj_qs = proj_qs.filter(members=user)

        rows = []
        for p in proj_qs[:12]:
            members = [_person_name(m) for m in p.members.all()[:8]]
            rows.append(
                {
                    "id": p.id,
                    "name": p.name,
                    "status": p.status,
                    "priority": p.priority,
                    "client": p.client or None,
                    "delivery_date": p.delivery_date.isoformat() if p.delivery_date else None,
                    "members": members,
                }
            )
        ctx["active_projects_count"] = proj_qs.count()
        ctx["active_projects"] = rows
    except Exception:
        pass


def _add_hr(ctx: dict, user) -> None:
    """Pending leaves, issued letters, employee records — scoped by HR access."""
    try:
        from hr.models import EmployeeRecord, HrLetter, Leave, LeaveBalance

        hr_access = ctx["access"]["hr"]
        year = timezone.localdate().year

        leave_qs = Leave.objects.filter(status=Leave.Status.PENDING).select_related("staff")
        if not hr_access:
            leave_qs = leave_qs.filter(staff=user)
        leave_qs = leave_qs.order_by("start_date")
        ctx["pending_leaves_count"] = leave_qs.count()
        ctx["pending_leaves"] = [
            {
                "id": lv.id,
                "staff": _person_name(lv.staff),
                "leave_type": lv.leave_type,
                "start_date": lv.start_date.isoformat(),
                "end_date": lv.end_date.isoformat(),
                "days": lv.days,
                "reason": (lv.reason or "")[:120] or None,
            }
            for lv in leave_qs[:12]
        ]

        bal_qs = LeaveBalance.objects.filter(year=year).select_related("staff").order_by(
            "staff__full_name", "staff__email"
        )
        if not hr_access:
            bal_qs = bal_qs.filter(staff=user)
        balances = []
        for b in bal_qs[:25]:
            balances.append(
                {
                    "staff": _person_name(b.staff),
                    "year": b.year,
                    "annual_allowance": b.annual_allowance,
                    "used": b.used,
                    "pending": b.pending,
                    "remaining": b.remaining,
                }
            )
        ctx["leave_balances_year"] = year
        ctx["leave_balances_count"] = bal_qs.count()
        ctx["leave_balances"] = balances

        letter_qs = HrLetter.objects.filter(status=HrLetter.Status.ISSUED).select_related(
            "staff", "created_by"
        )
        if not hr_access:
            letter_qs = letter_qs.filter(staff=user)
        letter_qs = letter_qs.order_by("-created_at")
        ctx["issued_documents_count"] = letter_qs.count()
        ctx["issued_documents"] = [
            {
                "id": d.id,
                "title": d.title or d.get_doc_type_display(),
                "doc_type": d.doc_type,
                "staff": _person_name(d.staff) if d.staff_id else None,
                "issued_by": _person_name(d.created_by) if d.created_by_id else None,
                "created_at": d.created_at.date().isoformat() if d.created_at else None,
            }
            for d in letter_qs[:12]
        ]

        if hr_access:
            rec_qs = EmployeeRecord.objects.select_related("staff", "uploaded_by").order_by(
                "-created_at"
            )[:12]
            ctx["employee_records"] = [
                {
                    "id": r.id,
                    "title": r.title,
                    "staff": _person_name(r.staff),
                    "uploaded_by": _person_name(r.uploaded_by) if r.uploaded_by_id else None,
                    "created_at": r.created_at.date().isoformat() if r.created_at else None,
                }
                for r in rec_qs
            ]
            ctx["employee_records_count"] = EmployeeRecord.objects.count()
        else:
            rec_qs = EmployeeRecord.objects.filter(staff=user).order_by("-created_at")[:8]
            ctx["employee_records"] = [
                {
                    "id": r.id,
                    "title": r.title,
                    "staff": _person_name(user),
                    "created_at": r.created_at.date().isoformat() if r.created_at else None,
                }
                for r in rec_qs
            ]
            ctx["employee_records_count"] = EmployeeRecord.objects.filter(staff=user).count()
    except Exception:
        pass


def _add_tickets(ctx: dict, user) -> None:
    try:
        from hr.models import Ticket

        qs = Ticket.objects.filter(status=Ticket.Status.OPEN).select_related("raised_by")
        if not ctx["access"]["hr"] and not is_superadmin(user):
            qs = qs.filter(raised_by=user)
        qs = qs.order_by("-urgency", "-created_at")
        ctx["open_tickets_count"] = qs.count()
        ctx["open_tickets"] = [
            {
                "id": t.id,
                "raised_by": _person_name(t.raised_by),
                "date": t.date.isoformat() if t.date else None,
                "urgency": t.urgency,
                "description": (t.description or "")[:160],
            }
            for t in qs[:10]
        ]
    except Exception:
        pass


def _add_clients(ctx: dict) -> None:
    try:
        from sales.models import Client

        qs = Client.objects.order_by("name")
        ctx["clients_count"] = qs.count()
        ctx["clients"] = list(
            qs[:15].values("id", "client_id", "name", "company", "poc_name", "contact_email")
        )
    except Exception:
        pass


def _add_sales(ctx: dict) -> None:
    try:
        from sales.models import Estimate, Invoice, Proposal

        # Proposals — open + recent accepted
        prop_qs = Proposal.objects.select_related("client").order_by("-updated_at")
        open_props = prop_qs.filter(
            status__in=[Proposal.Status.DRAFT, Proposal.Status.SENT]
        )
        ctx["open_proposals_count"] = open_props.count()
        ctx["proposals"] = [
            {
                "id": p.id,
                "title": p.title or "Untitled Proposal",
                "status": p.status,
                "client": p.client.name if p.client_id else None,
            }
            for p in prop_qs[:12]
        ]

        est_qs = Estimate.objects.select_related("client").order_by("-updated_at")
        open_ests = est_qs.filter(
            status__in=[Estimate.Status.DRAFT, Estimate.Status.SENT]
        )
        ctx["open_estimates_count"] = open_ests.count()
        ctx["estimates"] = [
            {
                "id": e.id,
                "title": e.title or "Untitled Estimate",
                "status": e.status,
                "client": e.client.name if e.client_id else None,
            }
            for e in est_qs[:12]
        ]

        # Invoices — unpaid focus + recent paid snapshot
        inv_qs = Invoice.objects.select_related("client").order_by("-updated_at")
        unpaid = inv_qs.exclude(status=Invoice.Status.PAID)
        overdue = inv_qs.filter(status=Invoice.Status.OVERDUE)
        ctx["overdue_invoices_count"] = overdue.count()
        ctx["open_invoices_count"] = unpaid.count()
        ctx["invoices"] = [
            {
                "id": inv.id,
                "invoice_number": inv.invoice_number or f"#{inv.id}",
                "status": inv.status,
                "amount": str(inv.amount) if inv.amount is not None else None,
                "due_date": inv.due_date.isoformat() if inv.due_date else None,
                "client": inv.client.name if inv.client_id else None,
            }
            for inv in inv_qs[:15]
        ]
        ctx["overdue_invoices"] = [
            row for row in ctx["invoices"] if row["status"] == Invoice.Status.OVERDUE
        ][:8]
    except Exception:
        pass


def _add_renewals(ctx: dict, today: date, soon: date) -> None:
    try:
        from renewals.models import Renewal

        base = Renewal.objects.select_related("client", "staff").exclude(
            status=Renewal.Status.RENEWED
        )
        upcoming = base.filter(
            due_date__lte=soon,
            due_date__gte=today,
            status=Renewal.Status.UPCOMING,
        )
        overdue = base.filter(Q(status=Renewal.Status.OVERDUE) | Q(due_date__lt=today)).exclude(
            status=Renewal.Status.RENEWED
        )

        def _row(r) -> dict:
            subject = r.display_subject()
            type_label = r.display_type()
            return {
                "id": r.id,
                "renewal_type": r.renewal_type,
                "renewal_type_detail": getattr(r, "renewal_type_detail", "") or "",
                "subject_type": r.subject_type,
                "subject": subject,
                "status": r.status,
                "due_date": r.due_date.isoformat() if r.due_date else None,
                "title": f"{subject} · {type_label}",
            }

        ctx["upcoming_renewals_count"] = upcoming.count()
        ctx["upcoming_renewals"] = [_row(r) for r in upcoming.order_by("due_date")[:8]]
        ctx["overdue_renewals_count"] = overdue.count()
        ctx["overdue_renewals"] = [_row(r) for r in overdue.order_by("due_date")[:8]]
    except Exception:
        pass


def context_as_text(ctx: dict) -> str:
    lines = [
        f"User: {ctx.get('user_name')} ({ctx.get('role')})",
        f"Today: {ctx.get('today')} ({ctx.get('weekday')})",
        f"Local time: {ctx.get('local_time')} ({ctx.get('timezone')}) — {ctx.get('part_of_day')}",
        "Product notes: Tasks=shared work; To-Dos=personal checklist; "
        "Calendar Reminders=timed calendar items (not to-dos). "
        "Dashboard Reminders card lists open reminders + to-dos + unread notifications; "
        "card tick dismisses only; refresh restores; mark done/read on source screens to clear.",
    ]
    access = ctx.get("access") or {}
    lines.append(
        "Module access: "
        + (
            ", ".join(
                k
                for k, v in (
                    ("hr", access.get("hr")),
                    ("sales", access.get("sales")),
                    ("renewals", access.get("renewals")),
                    ("reports", access.get("reports")),
                )
                if v
            )
            or "basic"
        )
    )

    if "employees_count" in ctx:
        level = ctx.get("employees_detail_level") or "directory"
        lines.append(f"Active employees/team ({level}): {ctx['employees_count']}")
        for e in ctx.get("employees") or []:
            bits = [e.get("name") or "—", e.get("role") or ""]
            if e.get("job_title"):
                bits.append(e["job_title"])
            if e.get("department"):
                bits.append(f"dept={e['department']}")
            if e.get("email"):
                bits.append(e["email"])
            for key in ("visa_renewal", "insurance_renewal", "iloe_renewal"):
                if e.get(key):
                    bits.append(f"{key}={e[key]}")
            lines.append("  - " + " | ".join(b for b in bits if b))

    if ctx.get("workload"):
        lines.append("Workload (open tasks by person):")
        for w in ctx["workload"]:
            lines.append(f"  - {w['person']}: {w['open_tasks']} open")

    if "open_tasks_count" in ctx:
        lines.append(f"Open tasks: {ctx['open_tasks_count']}")
        for t in ctx.get("open_tasks") or []:
            bits = [
                f"[{t['status']}]",
                t["title"],
                f"assignee={t.get('assignee') or '—'}",
            ]
            if t.get("project"):
                bits.append(f"project={t['project']}")
            if t.get("client_name"):
                bits.append(f"client={t['client_name']}")
            bits.append(f"due={t.get('due_date') or '—'}")
            if t.get("priority"):
                bits.append(f"priority={t['priority']}")
            lines.append("  - " + " | ".join(bits))

    if ctx.get("todos"):
        lines.append(f"Personal to-dos (open): {len(ctx['todos'])}")
        for t in ctx["todos"]:
            lines.append(f"  - {t['title']} due={t.get('due_date') or '—'}")

    if "open_reminders_count" in ctx:
        lines.append(f"Open calendar reminders (all, not done): {ctx['open_reminders_count']}")
    if ctx.get("overdue_reminders"):
        lines.append("Overdue calendar reminders (not done):")
        for r in ctx["overdue_reminders"]:
            lines.append(f"  - {r['title']} at {r.get('remind_at')}")
    if ctx.get("upcoming_reminders"):
        lines.append("Upcoming calendar reminders (7d):")
        for r in ctx["upcoming_reminders"]:
            who = ", ".join(r.get("assignees") or []) or "—"
            meet = f" | meet={r['meeting_url']}" if r.get("meeting_url") else ""
            lines.append(
                f"  - {r['title']} at {r.get('remind_at')} "
                f"| {r.get('visibility') or 'private'} | assignees={who}{meet}"
            )

    if "content_calendar_count" in ctx:
        lines.append(f"Content calendar items (14d, not done): {ctx['content_calendar_count']}")
        for item in ctx.get("content_calendar") or []:
            who = ", ".join(item.get("assignees") or []) or "—"
            lines.append(
                f"  - [{item.get('status')}] {item.get('title')} | {item.get('content_type')} "
                f"| client={item.get('client') or '—'} | date={item.get('scheduled_date')} "
                f"| deadline={item.get('deadline') or '—'} | assignees={who}"
            )

    if "active_projects_count" in ctx:
        lines.append(f"Active projects: {ctx['active_projects_count']}")
        for p in ctx.get("active_projects") or []:
            members = ", ".join(p.get("members") or []) or "—"
            lines.append(
                f"  - [{p['status']}] {p['name']} | client={p.get('client') or '—'} "
                f"| priority={p.get('priority') or '—'} | members={members} "
                f"| delivery={p.get('delivery_date') or '—'}"
            )

    if "pending_leaves_count" in ctx:
        lines.append(f"Pending leave requests: {ctx['pending_leaves_count']}")
        for lv in ctx.get("pending_leaves") or []:
            lines.append(
                f"  - {lv.get('staff')} | {lv.get('leave_type')} "
                f"{lv.get('start_date')}→{lv.get('end_date')} ({lv.get('days')}d)"
            )

    if "leave_balances" in ctx:
        year = ctx.get("leave_balances_year") or timezone.localdate().year
        lines.append(f"Leave balances ({year}): {ctx.get('leave_balances_count', 0)}")
        for b in ctx.get("leave_balances") or []:
            lines.append(
                f"  - {b.get('staff')} | allowance={b.get('annual_allowance')} "
                f"used={b.get('used')} pending={b.get('pending')} remaining={b.get('remaining')}"
            )

    if "issued_documents_count" in ctx:
        lines.append(f"Issued HR documents: {ctx['issued_documents_count']}")
        for d in ctx.get("issued_documents") or []:
            lines.append(
                f"  - {d.get('title')} | type={d.get('doc_type')} "
                f"| staff={d.get('staff') or '—'} | by={d.get('issued_by') or '—'} "
                f"| date={d.get('created_at') or '—'}"
            )

    if "employee_records_count" in ctx:
        lines.append(f"Employee record files: {ctx['employee_records_count']}")
        for r in ctx.get("employee_records") or []:
            lines.append(
                f"  - {r.get('title')} | staff={r.get('staff')} | date={r.get('created_at') or '—'}"
            )

    if "open_tickets_count" in ctx:
        lines.append(f"Open tickets: {ctx['open_tickets_count']}")
        for t in ctx.get("open_tickets") or []:
            lines.append(
                f"  - #{t.get('id')} [{t.get('urgency')}] by {t.get('raised_by')} "
                f"| {t.get('date') or '—'} | {(t.get('description') or '')[:80]}"
            )

    if "clients_count" in ctx:
        lines.append(f"Clients: {ctx['clients_count']}")
        for c in ctx.get("clients") or []:
            label = c.get("name") or c.get("company") or f"#{c.get('id')}"
            extra = []
            if c.get("client_id"):
                extra.append(c["client_id"])
            if c.get("poc_name"):
                extra.append(f"POC {c['poc_name']}")
            if c.get("contact_email"):
                extra.append(c["contact_email"])
            suffix = f" ({', '.join(extra)})" if extra else ""
            lines.append(f"  - {label}{suffix}")

    if "open_proposals_count" in ctx:
        lines.append(f"Open proposals (draft/sent): {ctx['open_proposals_count']}")
    if ctx.get("proposals"):
        lines.append("Proposals (recent):")
        for p in ctx["proposals"]:
            lines.append(
                f"  - [{p['status']}] {p['title']} | client={p.get('client') or '—'}"
            )

    if "open_estimates_count" in ctx:
        lines.append(f"Open estimates (draft/sent): {ctx['open_estimates_count']}")
    if ctx.get("estimates"):
        lines.append("Estimates (recent):")
        for e in ctx["estimates"]:
            lines.append(
                f"  - [{e['status']}] {e['title']} | client={e.get('client') or '—'}"
            )

    if "open_invoices_count" in ctx:
        lines.append(
            f"Invoices open (not paid): {ctx['open_invoices_count']}; "
            f"overdue: {ctx.get('overdue_invoices_count', 0)}"
        )
    if ctx.get("invoices"):
        lines.append("Invoices (recent):")
        for inv in ctx["invoices"]:
            lines.append(
                f"  - [{inv['status']}] {inv.get('invoice_number')} "
                f"| client={inv.get('client') or '—'} "
                f"| amount={inv.get('amount')} due={inv.get('due_date') or '—'}"
            )

    if "upcoming_renewals_count" in ctx:
        lines.append(f"Upcoming renewals (14d): {ctx['upcoming_renewals_count']}")
        for r in ctx.get("upcoming_renewals") or []:
            lines.append(
                f"  - [{r.get('status')}] {r.get('title')} due={r.get('due_date')}"
            )
    if "overdue_renewals_count" in ctx:
        lines.append(f"Overdue renewals: {ctx['overdue_renewals_count']}")
        for r in ctx.get("overdue_renewals") or []:
            lines.append(
                f"  - [{r.get('status')}] {r.get('title')} due={r.get('due_date')}"
            )

    lines.append(
        "NOTE: This context is READ-ONLY. You cannot create/edit/delete CRM records from chat."
    )
    return "\n".join(lines)
