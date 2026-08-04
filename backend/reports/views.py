from datetime import date, timedelta

from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Module, UserStatus
from accounts.models import User
from common.permissions import HasModuleAccess
from projects.models import Project
from renewals.models import Renewal
from sales.models import Invoice, Proposal
from tasks.models import Task


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
