from datetime import date

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import ListCreateAPIView
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Role
from common.permissions import IsActive, IsManager, is_manager
from notifications.services import start_recurring_reminder, stop_recurring_reminder

from .models import EmployeeCollateral, Leave, LeaveBalance, Ticket
from .pdf import generate_collateral_pdf
from .serializers import (
    EmployeeCollateralSerializer,
    LeaveBalanceSerializer,
    LeaveSerializer,
    StaffCreateSerializer,
    StaffListSerializer,
    TicketSerializer,
)

User = get_user_model()


class StaffViewSet(viewsets.ViewSet):
    """Manager-only staff directory (spec §5.1/§5.3)."""

    permission_classes = [IsManager]

    def list(self, request):
        qs = User.objects.filter(role=Role.EMPLOYEE).select_related("profile")
        search = request.query_params.get("search")
        if search:
            qs = qs.filter(full_name__icontains=search) | qs.filter(email__icontains=search)
        return Response(StaffListSerializer(qs, many=True).data)

    def create(self, request):
        serializer = StaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(serializer.to_representation(user), status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        try:
            user = User.objects.select_related("profile").get(pk=pk)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        year = date.today().year
        balance, _ = LeaveBalance.objects.get_or_create(staff=user, year=year)
        return Response(
            {
                "staff": StaffListSerializer(user).data,
                "collaterals": EmployeeCollateralSerializer(
                    user.collaterals.all(), many=True
                ).data,
                "leave_balance": LeaveBalanceSerializer(balance).data,
                "leaves": LeaveSerializer(user.leaves.all(), many=True).data,
                "tickets": TicketSerializer(user.tickets.all(), many=True).data,
            }
        )


class EmployeeCollateralView(APIView):
    """Manager generates a collateral PDF → Object Storage (spec §5.3)."""

    permission_classes = [IsManager]

    def post(self, request, doc_type):
        staff_id = request.data.get("staff")
        try:
            staff = User.objects.get(pk=staff_id)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Invalid staff."}, status=status.HTTP_400_BAD_REQUEST)
        collateral = EmployeeCollateral.objects.create(
            staff=staff,
            doc_type=doc_type,
            generated_by=request.user,
            generated_at=timezone.now(),
        )
        # TODO: fill real letter copy (spec §19) — one shared HTML template base (§5.4).
        collateral.file_url = generate_collateral_pdf(collateral)
        collateral.save(update_fields=["file_url", "updated_at"])
        return Response(
            EmployeeCollateralSerializer(collateral).data, status=status.HTTP_201_CREATED
        )


class MyCollateralsView(APIView):
    """Employee sees their own issued letters (Edit Profile page, spec §5.3)."""

    permission_classes = [IsActive]

    def get(self, request):
        qs = EmployeeCollateral.objects.filter(staff=request.user)
        return Response(EmployeeCollateralSerializer(qs, many=True).data)


class LeaveViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveSerializer
    permission_classes = [IsActive]

    def get_queryset(self):
        qs = Leave.objects.select_related("staff")
        if is_manager(self.request.user):
            staff = self.request.query_params.get("staff")
            return qs.filter(staff_id=staff) if staff else qs
        return qs.filter(staff=self.request.user)

    def perform_create(self, serializer):
        # Leave requests are always submitted for the requesting user (spec §5.3: POST is employee-only).
        staff = self.request.user
        leave = serializer.save(staff=staff)
        self._recalc_balance(staff)
        # Recurring manager reminder until actioned (spec §5.4 / §17.1).
        start_recurring_reminder(
            source="leave_request",
            title="Leave request pending",
            body=f"{staff.full_name or staff.email} requested {leave.leave_type} leave.",
            object_ref=f"leave:{leave.id}",
        )

    @action(detail=True, methods=["patch"], permission_classes=[IsManager])
    def decision(self, request, pk=None):
        """PATCH approve/reject (spec §5.3: PATCH /api/hr/leaves/{id})."""
        leave = self.get_object()
        new_status = request.data.get("status")
        if new_status not in {Leave.Status.APPROVED, Leave.Status.REJECTED}:
            return Response(
                {"detail": "status must be 'approved' or 'rejected'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        leave.status = new_status
        leave.save(update_fields=["status", "updated_at"])
        self._recalc_balance(leave.staff)
        # Manager stops receiving the reminder the instant they action it (spec §5.5).
        stop_recurring_reminder(object_ref=f"leave:{leave.id}")
        return Response(LeaveSerializer(leave).data)

    # PATCH on the detail route also approves/rejects, matching the spec path exactly.
    def partial_update(self, request, *args, **kwargs):
        if not is_manager(request.user):
            return Response({"detail": "Manager role required."}, status=status.HTTP_403_FORBIDDEN)
        return self.decision(request, pk=kwargs.get("pk"))

    @staticmethod
    def _recalc_balance(staff):
        """Balance nets approved + pending against the 30-day allowance (spec §5.5)."""
        year = date.today().year
        balance, _ = LeaveBalance.objects.get_or_create(staff=staff, year=year)
        paid_types = [Leave.LeaveType.ANNUAL, Leave.LeaveType.OTHER]
        leaves = Leave.objects.filter(
            staff=staff, leave_type__in=paid_types, start_date__year=year
        )
        used = sum(l.days for l in leaves if l.status == Leave.Status.APPROVED)
        pending = sum(l.days for l in leaves if l.status == Leave.Status.PENDING)
        balance.used = used
        balance.pending = pending
        balance.save(update_fields=["used", "pending", "updated_at"])


class LeaveBalanceView(APIView):
    """Employee: own balance for the current year (spec §5.3)."""

    permission_classes = [IsActive]

    def get(self, request):
        year = date.today().year
        balance, _ = LeaveBalance.objects.get_or_create(staff=request.user, year=year)
        return Response(LeaveBalanceSerializer(balance).data)


class TicketViewSet(viewsets.ModelViewSet):
    serializer_class = TicketSerializer
    permission_classes = [IsActive]

    def get_queryset(self):
        qs = Ticket.objects.select_related("raised_by")
        if is_manager(self.request.user):
            staff = self.request.query_params.get("staff")
            return qs.filter(raised_by_id=staff) if staff else qs
        return qs.filter(raised_by=self.request.user)

    def perform_create(self, serializer):
        ticket = serializer.save(raised_by=self.request.user)
        start_recurring_reminder(
            source="ticket",
            title="Ticket raised",
            body=f"{self.request.user.full_name or self.request.user.email}: {ticket.description[:60]}",
            object_ref=f"ticket:{ticket.id}",
        )

    def partial_update(self, request, *args, **kwargs):
        # Only a manager marks resolved (spec §5.3).
        if not is_manager(request.user):
            return Response({"detail": "Manager role required."}, status=status.HTTP_403_FORBIDDEN)
        ticket = self.get_object()
        ticket.status = request.data.get("status", ticket.status)
        ticket.save(update_fields=["status", "updated_at"])
        if ticket.status == Ticket.Status.RESOLVED:
            stop_recurring_reminder(object_ref=f"ticket:{ticket.id}")
        return Response(TicketSerializer(ticket).data)
