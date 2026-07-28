from datetime import date, timedelta

from django.db.models import Count
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek
from rest_framework.response import Response
from rest_framework.views import APIView

from calendar_app.services import build_agenda
from common.permissions import IsActive, IsManager, is_manager
from projects.models import Project
from sales.models import Invoice
from tasks.models import Task


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
        manager = is_manager(user)
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
            "ongoing_projects": Project.objects.filter(
                members=user, status=Project.Status.ONGOING
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
                    "company_ongoing_projects": Project.objects.filter(
                        status=Project.Status.ONGOING
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
        scope = "all" if is_manager(request.user) else "self"
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
        if scope == "company" and not is_manager(request.user):
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

    permission_classes = [IsManager]

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
