from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Module, Role
from calendar_app.services import build_agenda
from common.models import ActivityLog
from common.permissions import IsActive, IsSuperadmin, has_module_access, is_superadmin
from projects.models import Project
from renewals.models import Renewal
from sales.models import Client, Invoice, Proposal
from tasks.models import Task
from todos.models import TodoItem

User = get_user_model()


def _month_bounds(today=None):
    today = today or date.today()
    start = today.replace(day=1)
    return start, today


def _last_month_bounds(today=None):
    """[start, end) of the previous calendar month — powers a real trend comparison."""
    today = today or date.today()
    this_month_start = today.replace(day=1)
    last_month_end_day = this_month_start - timedelta(days=1)
    return last_month_end_day.replace(day=1), this_month_start


class SummaryView(APIView):
    """
    GET /api/dashboard/summary — scoped counts (spec §15.3).
    'Completed this month' is a live filter on completed_at, so it resets
    naturally on the 1st with no scheduled job (spec §15.4).
    """

    permission_classes = [IsActive]

    def get(self, request):
        user = request.user
        manager = is_superadmin(user)
        month_start, _ = _month_bounds()
        last_month_start, last_month_end = _last_month_bounds()

        my_tasks = Task.objects.filter(assignee=user)
        data = {
            "pending_tasks": my_tasks.exclude(status=Task.Status.COMPLETED).count(),
            "completed_this_month": my_tasks.filter(
                status=Task.Status.COMPLETED, completed_at__date__gte=month_start
            ).count(),
            # Real month-over-month comparison — powers the announcement banner's trend badge.
            "completed_last_month": my_tasks.filter(
                status=Task.Status.COMPLETED,
                completed_at__date__gte=last_month_start,
                completed_at__date__lt=last_month_end,
            ).count(),
            "ongoing_projects": Project.objects.filter(members=user).exclude(
                status=Project.Status.COMPLETED
            ).count(),
            # Task status breakdown, own tasks — powers a donut/segmented-bar widget.
            "task_status_breakdown": self._status_counts(
                my_tasks, Task.Status.choices, "status"
            ),
        }

        if manager:
            all_tasks = Task.objects.all()
            data.update(
                {
                    "company_total_tasks": all_tasks.count(),
                    "company_completed_this_month": all_tasks.filter(
                        status=Task.Status.COMPLETED, completed_at__date__gte=month_start
                    ).count(),
                    "company_completed_last_month": all_tasks.filter(
                        status=Task.Status.COMPLETED,
                        completed_at__date__gte=last_month_start,
                        completed_at__date__lt=last_month_end,
                    ).count(),
                    "total_invoices": Invoice.objects.count(),
                    "pending_invoices": Invoice.objects.filter(
                        status__in=[Invoice.Status.SENT, Invoice.Status.OVERDUE]
                    ).count(),
                    # Real month-over-month invoice growth — second genuine trend badge.
                    "invoices_this_month": Invoice.objects.filter(
                        created_at__date__gte=month_start
                    ).count(),
                    "invoices_last_month": Invoice.objects.filter(
                        created_at__date__gte=last_month_start,
                        created_at__date__lt=last_month_end,
                    ).count(),
                    "company_ongoing_projects": Project.objects.exclude(
                        status=Project.Status.COMPLETED
                    ).count(),
                    "company_task_status_breakdown": self._status_counts(
                        all_tasks, Task.Status.choices, "status"
                    ),
                    "project_status_breakdown": self._status_counts(
                        Project.objects.all(), Project.Status.choices, "status"
                    ),
                }
            )
        return Response(data)

    @staticmethod
    def _status_counts(queryset, choices, field):
        counts = dict(
            queryset.values_list(field).annotate(count=Count("id")).order_by()
        )
        return [
            {"status": value, "label": label, "count": counts.get(value, 0)}
            for value, label in choices
        ]


class RemindersView(APIView):
    """GET /api/dashboard/reminders — merged, priority-ordered feed (spec §15.3)."""

    permission_classes = [IsActive]

    def get(self, request):
        today = date.today()
        scope = "all" if is_superadmin(request.user) else "self"
        items = build_agenda(
            user=request.user, dt_from=today, dt_to=today + timedelta(days=30), scope=scope
        )
        return Response({"items": items})


class PerformanceView(APIView):
    """
    GET /api/dashboard/performance?granularity=daily|weekly|monthly&scope=self|company
    Two-series time-series — completed vs. created — so the toggle re-queries
    rather than re-labelling (spec §15.4). scope=company is manager-only.
    """

    permission_classes = [IsActive]

    TRUNC = {"daily": TruncDay, "weekly": TruncWeek, "monthly": TruncMonth}

    def get(self, request):
        granularity = request.query_params.get("granularity", "daily")
        if granularity not in self.TRUNC:
            granularity = "daily"
        scope = request.query_params.get("scope", "self")
        if scope == "company" and not is_superadmin(request.user):
            scope = "self"

        base = Task.objects.all()
        if scope == "self":
            base = base.filter(assignee=request.user)
        trunc = self.TRUNC[granularity]

        def _bucketed(queryset, date_field):
            rows = (
                queryset.annotate(bucket=trunc(date_field))
                .values("bucket")
                .annotate(count=Count("id"))
                .order_by("bucket")
            )
            return {
                row["bucket"].date().isoformat(): row["count"]
                for row in rows
                if row["bucket"] is not None
            }

        completed = _bucketed(
            base.filter(status=Task.Status.COMPLETED, completed_at__isnull=False), "completed_at"
        )
        created = _bucketed(base, "created_at")

        buckets = sorted(set(completed) | set(created))
        return Response(
            {
                "granularity": granularity,
                "scope": scope,
                "series": [
                    {
                        "bucket": bucket,
                        "completed": completed.get(bucket, 0),
                        "created": created.get(bucket, 0),
                    }
                    for bucket in buckets
                ],
            }
        )


class ProjectsTrendView(APIView):
    """GET /api/dashboard/projects-trend?months=12 — projects started per month (spec §15.3)."""

    permission_classes = [IsSuperadmin]

    def get(self, request):
        months = int(request.query_params.get("months", 12))
        since = (date.today().replace(day=1)) - timedelta(days=31 * months)
        series = (
            Project.objects.filter(start_date__gte=since)
            .annotate(bucket=TruncMonth("start_date"))
            .values("bucket")
            .annotate(count=Count("id"))
            .order_by("bucket")
        )
        return Response(
            {
                "months": months,
                "series": [
                    {"bucket": row["bucket"].isoformat(), "count": row["count"]}
                    for row in series
                    if row["bucket"] is not None
                ],
            }
        )


class GlobalSearchView(APIView):
    """GET /api/dashboard/search?q= — powers the Topbar search box. Each
    result category respects the same visibility rules as its own module's
    list endpoint (employees only see their own tasks/projects; staff,
    client, renewal, proposal and invoice results need the matching
    HR/Sales/Renewals module access, same as those modules' own pages)."""

    permission_classes = [IsActive]

    def get(self, request):
        q = request.query_params.get("q", "").strip()
        if len(q) < 2:
            return Response({"results": []})

        mgr = is_superadmin(request.user)
        has_hr = has_module_access(request.user, Module.HR)
        has_sales = has_module_access(request.user, Module.SALES)
        has_renewals = has_module_access(request.user, Module.RENEWALS)
        results = []

        tasks = Task.objects.all() if mgr else Task.objects.filter(assignee=request.user)
        for t in tasks.filter(Q(title__icontains=q) | Q(description__icontains=q))[:5]:
            results.append(
                {
                    "type": "task",
                    "id": t.id,
                    "label": t.title,
                    "sublabel": "Task",
                    "href": "/tasks",
                    "icon": "bi-check-square-fill",
                }
            )

        projects = Project.objects.all() if mgr else Project.objects.filter(members=request.user)
        for p in projects.filter(name__icontains=q).distinct()[:5]:
            results.append(
                {
                    "type": "project",
                    "id": p.id,
                    "label": p.name,
                    "sublabel": "Project",
                    "href": "/projects",
                    "icon": "bi-folder-fill",
                }
            )

        if has_hr:
            staff = User.objects.filter(role=Role.EMPLOYEE).filter(
                Q(full_name__icontains=q) | Q(email__icontains=q)
            )
            for s in staff[:5]:
                results.append(
                    {
                        "type": "staff",
                        "id": s.id,
                        "label": s.full_name or s.email,
                        "sublabel": "Staff",
                        "href": f"/hr/staff/{s.id}",
                        "icon": "bi-people-fill",
                    }
                )

        if has_sales:
            clients = Client.objects.filter(Q(name__icontains=q) | Q(company__icontains=q))
            for c in clients[:5]:
                results.append(
                    {
                        "type": "client",
                        "id": c.id,
                        "label": c.name,
                        "sublabel": c.company or "Client",
                        "href": "/sales",
                        "icon": "bi-briefcase-fill",
                    }
                )

            proposals = Proposal.objects.select_related("client").filter(
                Q(title__icontains=q) | Q(client__name__icontains=q)
            )
            for p in proposals[:5]:
                results.append(
                    {
                        "type": "proposal",
                        "id": p.id,
                        "label": p.title,
                        "sublabel": "Proposal",
                        "href": "/sales",
                        "icon": "bi-file-earmark-text-fill",
                    }
                )

            invoices = Invoice.objects.select_related("client").filter(
                Q(invoice_number__icontains=q) | Q(client__name__icontains=q)
            )
            for inv in invoices[:5]:
                results.append(
                    {
                        "type": "invoice",
                        "id": inv.id,
                        "label": inv.invoice_number,
                        "sublabel": "Invoice",
                        "href": "/sales",
                        "icon": "bi-receipt",
                    }
                )

        if has_renewals:
            renewals = Renewal.objects.select_related("client", "staff").filter(
                Q(renewal_type__icontains=q)
                | Q(notes__icontains=q)
                | Q(client__name__icontains=q)
                | Q(staff__full_name__icontains=q)
            )
            for r in renewals[:5]:
                subject = r.client.name if r.subject_type == "client" and r.client else (
                    r.staff.full_name or r.staff.email if r.staff else "—"
                )
                results.append(
                    {
                        "type": "renewal",
                        "id": r.id,
                        "label": f"{r.get_renewal_type_display()} — {subject}",
                        "sublabel": "Renewal",
                        "href": "/renewals",
                        "icon": "bi-calendar-check-fill",
                    }
                )

        todos = TodoItem.objects.filter(owner=request.user, text__icontains=q)
        for item in todos[:5]:
            results.append(
                {
                    "type": "todo",
                    "id": item.id,
                    "label": item.text,
                    "sublabel": "To-Do",
                    "href": "/todo",
                    "icon": "bi-ui-checks-grid",
                }
            )

        return Response({"results": results[:20]})


class ActivityLogListView(APIView):
    """GET /api/dashboard/logs — manager-only audit trail (spec follow-up:
    who added/edited a task, client, or project, and when)."""

    permission_classes = [IsSuperadmin]

    def get(self, request):
        logs = ActivityLog.objects.select_related("actor")[:200]
        return Response(
            [
                {
                    "id": log.id,
                    "actor_name": (log.actor.full_name or log.actor.email) if log.actor else "Deleted user",
                    "action": log.action,
                    "created_at": log.created_at.isoformat(),
                }
                for log in logs
            ]
        )


class TodayTasksView(APIView):
    """GET /api/dashboard/today-tasks — manager-only. Replaces the plain
    "recent tasks" list on the manager Dashboard: every employee's tasks
    that are relevant to today (due today, or added today), so a manager
    can see who's doing what today without opening each employee's board."""

    permission_classes = [IsSuperadmin]

    def get(self, request):
        today = date.today()
        qs = (
            Task.objects.select_related("project", "assignee")
            .filter(Q(due_date=today) | Q(created_at__date=today))
            .order_by("due_date", "-created_at")[:20]
        )
        return Response(
            [
                {
                    "id": t.id,
                    "title": t.title,
                    "project_name": t.project.name if t.project else "",
                    "assignee_name": t.assignee.full_name or t.assignee.email,
                    "status": t.status,
                    "priority": t.priority,
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                    "created_at": t.created_at.isoformat(),
                }
                for t in qs
            ]
        )
