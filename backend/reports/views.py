from datetime import date, timedelta

from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Module, User, UserStatus
from common.permissions import HasModuleAccess
from projects.models import Project
from renewals.models import Renewal
from sales.models import Invoice, Proposal
from tasks.models import Task

from . import report_pdf, services


class ReportSummaryView(APIView):
    """GET /api/reports/summary — cross-module summary (spec §16)."""

    permission_classes = [HasModuleAccess]
    required_module = Module.REPORTS

    def get(self, request):
        soon = date.today() + timedelta(days=30)
        return Response(
            {
                "open_proposals": Proposal.objects.filter(
                    status__in=[Proposal.Status.DRAFT, Proposal.Status.SENT]
                ).count(),
                "overdue_invoices": Invoice.objects.filter(status=Invoice.Status.OVERDUE).count(),
                "active_projects": Project.objects.exclude(
                    status=Project.Status.COMPLETED
                ).count(),
                "open_tasks": Task.objects.exclude(status=Task.Status.COMPLETED).count(),
                "upcoming_renewals": Renewal.objects.filter(
                    due_date__lte=soon, status=Renewal.Status.UPCOMING
                ).count(),
                "pending_approvals": User.objects.filter(
                    status=UserStatus.AWAITING_APPROVAL
                ).count(),
            }
        )


class ReportOptionsView(APIView):
    """GET /api/reports/options — employees + clients for the report builder."""

    permission_classes = [HasModuleAccess]
    required_module = Module.REPORTS

    def get(self, request):
        return Response(services.report_options())


class ReportGenerateView(APIView):
    """POST /api/reports/generate — { type, subject_id, date_from, date_to }."""

    permission_classes = [HasModuleAccess]
    required_module = Module.REPORTS

    def post(self, request):
        payload, error, status = _parse_report_request(request.data)
        if error:
            return Response({"detail": error}, status=status)
        try:
            report = services.build_report(**payload)
        except LookupError as exc:
            return Response({"detail": str(exc)}, status=404)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(report)


class ReportPdfView(APIView):
    """POST /api/reports/pdf — same body as generate; returns { file_url }."""

    permission_classes = [HasModuleAccess]
    required_module = Module.REPORTS

    def post(self, request):
        payload, error, status = _parse_report_request(request.data)
        if error:
            return Response({"detail": error}, status=status)
        try:
            report = services.build_report(**payload)
            file_url = report_pdf.render_report_pdf(report, request)
        except LookupError as exc:
            return Response({"detail": str(exc)}, status=404)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        except Exception as exc:
            return Response({"detail": f"PDF failed: {exc}"}, status=500)
        return Response({"file_url": file_url, "summary": report.get("summary"), "type": report.get("type")})


def _parse_report_request(data) -> tuple[dict | None, str | None, int]:
    report_type = (data.get("type") or "").strip().lower()
    if report_type not in {"employee", "client"}:
        return None, "type must be employee or client.", 400
    try:
        subject_id = int(data.get("subject_id"))
    except (TypeError, ValueError):
        return None, "subject_id is required.", 400
    date_from = services.parse_iso_date(data.get("date_from"))
    date_to = services.parse_iso_date(data.get("date_to"))
    if not date_from or not date_to:
        return None, "date_from and date_to are required (YYYY-MM-DD).", 400
    return (
        {
            "report_type": report_type,
            "subject_id": subject_id,
            "date_from": date_from,
            "date_to": date_to,
        },
        None,
        200,
    )
