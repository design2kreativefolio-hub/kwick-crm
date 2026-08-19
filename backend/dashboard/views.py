from datetime import date, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Module, Role, UserStatus
from common.models import ActivityLog
from common.permissions import IsActive, IsSuperadmin, has_module_access, is_superadmin
from common.uploads import IMAGE_EXTENSIONS, UploadRejected, check_upload
from hr.models import HrLetter
from projects.models import Project
from renewals.models import Renewal
from sales.models import Client, Estimate, Invoice, Proposal
from tasks.models import Task
from tasks.services import tasks_for_user
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

        my_tasks = tasks_for_user(user)
        terminal = [Task.Status.COMPLETED, Task.Status.PUBLISHED]
        data = {
            "pending_tasks": my_tasks.exclude(status__in=terminal).count(),
            "completed_this_month": my_tasks.filter(
                status__in=terminal, completed_at__date__gte=month_start
            ).count(),
            # Real month-over-month comparison — powers the announcement banner's trend badge.
            "completed_last_month": my_tasks.filter(
                status__in=terminal,
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
            pending_users = (
                User.objects.filter(role=Role.EMPLOYEE, status=UserStatus.AWAITING_APPROVAL)
                .order_by("-created_at")[:10]
            )
            all_tasks = Task.objects.all()
            data.update(
                {
                    "pending_approvals": User.objects.filter(
                        role=Role.EMPLOYEE, status=UserStatus.AWAITING_APPROVAL
                    ).count(),
                    "pending_approval_users": [
                        {
                            "id": u.id,
                            "full_name": u.full_name,
                            "email": u.email,
                            "created_at": u.created_at.isoformat(),
                        }
                        for u in pending_users
                    ],
                    "company_total_tasks": all_tasks.count(),
                    "company_completed_this_month": all_tasks.filter(
                        status__in=terminal, completed_at__date__gte=month_start
                    ).count(),
                    "company_completed_last_month": all_tasks.filter(
                        status__in=terminal,
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
    """GET /api/dashboard/reminders — open reminders, to-dos, and notifications for the card."""

    permission_classes = [IsActive]

    def get(self, request):
        from dashboard.card_feed import build_dashboard_card_items

        return Response({"items": build_dashboard_card_items(request.user)})


class ReminderDismissView(APIView):
    """POST /api/dashboard/reminders/dismiss — hide from card only (not mark done/read)."""

    permission_classes = [IsActive]

    def post(self, request):
        from notifications.models import DashboardCardDismiss

        kind = (request.data.get("kind") or "").strip()
        object_id = request.data.get("id")
        valid = {c.value for c in DashboardCardDismiss.Kind}
        if kind not in valid:
            return Response({"detail": "Invalid kind."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            object_id = int(object_id)
        except (TypeError, ValueError):
            return Response({"detail": "Invalid id."}, status=status.HTTP_400_BAD_REQUEST)

        DashboardCardDismiss.objects.get_or_create(
            user=request.user,
            kind=kind,
            object_id=object_id,
        )
        return Response({"detail": "ok"})


class ReminderRestoreView(APIView):
    """POST /api/dashboard/reminders/restore — clear card dismissals so pending items show again."""

    permission_classes = [IsActive]

    def post(self, request):
        from dashboard.card_feed import build_dashboard_card_items
        from notifications.models import DashboardCardDismiss

        deleted, _ = DashboardCardDismiss.objects.filter(user=request.user).delete()
        return Response(
            {"detail": "ok", "restored": deleted, "items": build_dashboard_card_items(request.user)}
        )


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

        if scope == "company":
            base = Task.objects.all()
        else:
            base = tasks_for_user(request.user)
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

        tasks = Task.objects.all() if mgr else tasks_for_user(request.user)
        for t in tasks.filter(Q(title__icontains=q) | Q(description__icontains=q))[:5]:
            results.append(
                {
                    "type": "task",
                    "id": t.id,
                    "label": t.title,
                    "sublabel": "Task",
                    "href": f"/tasks/{t.id}",
                    "icon": "bi-check-square-fill",
                }
            )

        # Projects are shared company-wide — same list for every active user.
        for p in Project.objects.filter(name__icontains=q).distinct()[:5]:
            results.append(
                {
                    "type": "project",
                    "id": p.id,
                    "label": p.name,
                    "sublabel": "Project",
                    "href": f"/projects/{p.id}",
                    "icon": "bi-folder-fill",
                }
            )

        # Clients without Sales access still show via Projects > Clients.
        if not has_sales:
            for c in Client.objects.filter(
                Q(name__icontains=q)
                | Q(company__icontains=q)
                | Q(client_id__icontains=q)
                | Q(poc_name__icontains=q)
            )[:5]:
                results.append(
                    {
                        "type": "project_client",
                        "id": c.id,
                        "label": c.name,
                        "sublabel": c.company or c.client_id or "Client",
                        "href": f"/projects/clients/{c.id}/calendar",
                        "icon": "bi-person-lines-fill",
                    }
                )

        if has_hr:
            staff = User.objects.filter(role=Role.EMPLOYEE, purged_at__isnull=True).filter(
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

            letters = HrLetter.objects.filter(
                Q(title__icontains=q) | Q(doc_type__icontains=q)
            )
            for letter in letters[:5]:
                label = (letter.title or "").strip() or letter.get_doc_type_display()
                results.append(
                    {
                        "type": "hr_document",
                        "id": letter.id,
                        "label": label,
                        "sublabel": letter.get_doc_type_display(),
                        "href": f"/hr/documents/{letter.id}",
                        "icon": "bi-folder2-open",
                    }
                )

        if has_sales:
            clients = Client.objects.filter(
                Q(name__icontains=q)
                | Q(company__icontains=q)
                | Q(client_id__icontains=q)
                | Q(poc_name__icontains=q)
                | Q(contact_email__icontains=q)
                | Q(contact_phone__icontains=q)
            )
            for c in clients[:5]:
                results.append(
                    {
                        "type": "client",
                        "id": c.id,
                        "label": c.name,
                        "sublabel": c.company or c.client_id or "Client",
                        "href": f"/sales/clients/{c.id}",
                        "icon": "bi-briefcase-fill",
                    }
                )

            proposals = Proposal.objects.select_related("client").filter(
                Q(title__icontains=q)
                | Q(client__name__icontains=q)
                | Q(client__company__icontains=q)
            )
            for p in proposals[:5]:
                results.append(
                    {
                        "type": "proposal",
                        "id": p.id,
                        "label": p.title or f"Proposal #{p.id}",
                        "sublabel": (p.client.name if p.client_id else None) or "Proposal",
                        "href": f"/sales/proposals/{p.id}",
                        "icon": "bi-file-earmark-text-fill",
                    }
                )

            estimates = Estimate.objects.select_related("client").filter(
                Q(title__icontains=q)
                | Q(client__name__icontains=q)
                | Q(client__company__icontains=q)
                | Q(content__quote_number__icontains=q)
            )
            for e in estimates[:5]:
                results.append(
                    {
                        "type": "estimate",
                        "id": e.id,
                        "label": e.title or f"Estimate #{e.id}",
                        "sublabel": (e.client.name if e.client_id else None) or "Estimate",
                        "href": f"/sales/estimates/{e.id}",
                        "icon": "bi-file-earmark-ruled-fill",
                    }
                )

            invoices = Invoice.objects.select_related("client").filter(
                Q(invoice_number__icontains=q)
                | Q(content__title__icontains=q)
                | Q(client__name__icontains=q)
                | Q(client__company__icontains=q)
            )
            for inv in invoices[:5]:
                content_title = ((inv.content or {}).get("title") or "").strip()
                label = content_title or inv.invoice_number or f"Invoice #{inv.id}"
                results.append(
                    {
                        "type": "invoice",
                        "id": inv.id,
                        "label": label,
                        "sublabel": inv.invoice_number or "Invoice",
                        "href": f"/sales/invoices/{inv.id}",
                        "icon": "bi-receipt",
                    }
                )

        if has_renewals:
            renewals = Renewal.objects.select_related("client", "staff").filter(
                Q(renewal_type__icontains=q)
                | Q(renewal_type_detail__icontains=q)
                | Q(notes__icontains=q)
                | Q(subject_name__icontains=q)
                | Q(client__name__icontains=q)
                | Q(client__company__icontains=q)
                | Q(staff__full_name__icontains=q)
            )
            for r in renewals[:5]:
                results.append(
                    {
                        "type": "renewal",
                        "id": r.id,
                        "label": f"{r.display_type()} — {r.display_subject()}",
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

        return Response({"results": results[:30]})


class ActivityLogListView(APIView):
    """GET /api/dashboard/logs — manager-only audit trail (spec follow-up:
    who added/edited a task, client, or project, and when)."""

    permission_classes = [IsSuperadmin]

    def get(self, request):
        from passwords.models import PasswordAccessLog
        from passwords.services import access_log_message

        activity = [
            {
                "id": log.id,
                "kind": "activity",
                "actor_name": (log.actor.full_name or log.actor.email) if log.actor else "Deleted user",
                "action": log.action,
                "created_at": log.created_at.isoformat(),
            }
            for log in ActivityLog.objects.select_related("actor")[:200]
        ]
        password_logs = [
            {
                "id": log.id,
                "kind": "password_vault",
                "actor_name": (log.user.full_name or log.user.email) if log.user else "Unknown",
                "action": access_log_message(log),
                "created_at": log.created_at.isoformat(),
            }
            for log in PasswordAccessLog.objects.select_related("user")[:200]
        ]
        merged = sorted(activity + password_logs, key=lambda r: r["created_at"], reverse=True)[:250]
        return Response(merged)


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


SUPPORT_EMAIL = "design@kreativefolio.com"
SUPPORT_WHATSAPP = "+971505211969"
MAX_SUPPORT_IMAGES = 5
MAX_SUPPORT_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


class SupportContactView(APIView):
    """POST /api/dashboard/support — email a grievance to design@kreativefolio.com
    with optional image attachments from the logged-in user."""

    permission_classes = [IsActive]
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        return Response(
            {
                "support_email": SUPPORT_EMAIL,
                "whatsapp": SUPPORT_WHATSAPP,
                "whatsapp_display": "+971 50 521 1969",
            }
        )

    def post(self, request):
        from django.core.mail import EmailMessage

        name = (request.data.get("name") or request.user.full_name or "").strip()
        email = (request.data.get("email") or request.user.email or "").strip()
        message = (request.data.get("message") or "").strip()
        if not message:
            return Response({"detail": "Please describe your issue."}, status=400)
        if not email:
            return Response({"detail": "Email is required."}, status=400)

        files = request.FILES.getlist("images") or request.FILES.getlist("images[]")
        if len(files) > MAX_SUPPORT_IMAGES:
            return Response(
                {"detail": f"You can attach up to {MAX_SUPPORT_IMAGES} images."},
                status=400,
            )
        for f in files:
            try:
                check_upload(f, allowed=IMAGE_EXTENSIONS, max_bytes=MAX_SUPPORT_IMAGE_BYTES)
            except UploadRejected as exc:
                return Response({"detail": str(exc)}, status=400)

        body = (
            f"Support request from Kwick\n"
            f"{'=' * 40}\n"
            f"Name: {name or '—'}\n"
            f"Email: {email}\n"
            f"User ID: {request.user.pk}\n"
            f"Role: {getattr(request.user, 'role', '')}\n"
            f"{'=' * 40}\n\n"
            f"{message}\n"
        )
        mail = EmailMessage(
            subject=f"[Kwick Support] {name or email}",
            body=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[SUPPORT_EMAIL],
            reply_to=[email],
        )
        for f in files:
            mail.attach(f.name, f.read(), f.content_type or "application/octet-stream")

        try:
            mail.send(fail_silently=False)
        except Exception:
            return Response(
                {"detail": "Couldn't send your message right now. Please email or WhatsApp us directly."},
                status=502,
            )
        return Response({"detail": "Support request sent.", "support_email": SUPPORT_EMAIL})

