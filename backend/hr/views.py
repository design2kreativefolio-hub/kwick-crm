import uuid
from datetime import date

from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.db import transaction
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.generics import ListCreateAPIView
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import Module, Role, StaffProfile, UserStatus
from accounts.tasks import (
    dispatch_email_task,
    send_admin_changed_password_email,
    send_password_reset_email,
    send_status_change_email,
    send_welcome_email,
)
from common.permissions import HasModuleAccess, IsActive, has_module_access
from common.services import log_activity
from notifications.services import (
    notify_user,
    start_recurring_reminder,
    stop_recurring_reminder,
    users_with_module_access,
)

from .models import EmployeeCollateral, EmployeeRecord, HrLetter, Leave, LeaveBalance, Ticket
from .pdf import generate_collateral_pdf
from .serializers import (
    EmployeeCollateralSerializer,
    EmployeeRecordSerializer,
    HrLetterSerializer,
    LeaveBalanceSerializer,
    LeaveSerializer,
    StaffCreateSerializer,
    StaffListSerializer,
    StaffUpdateSerializer,
    TicketSerializer,
)
from .services import purge_staff_account

User = get_user_model()


def _phone_conflict_response(phone, exclude_user_id=None):
    """Phone isn't a login credential (unlike email, which is DB-unique and
    hard-blocked), so a duplicate is a data-quality nudge, not a rule — the
    manager sees who else has it and can choose to save anyway."""
    if not phone:
        return None
    qs = StaffProfile.objects.filter(phone=phone).select_related("user")
    if exclude_user_id is not None:
        qs = qs.exclude(user_id=exclude_user_id)
    conflict = qs.first()
    if not conflict:
        return None
    return Response(
        {
            "duplicate_warning": "phone",
            "field": "phone",
            "message": (
                f"This phone number is already used by "
                f"{conflict.user.full_name or conflict.user.email}."
            ),
        },
        status=status.HTTP_409_CONFLICT,
    )


def _notify_document(collateral):
    """A manager generated/uploaded a document for this employee — let them
    know via the existing in-app notification channel (spec follow-up: 'each
    time the manager uploads these, the employee should get a reminder')."""
    notify_user(
        user=collateral.staff,
        source="document",
        title=f"New document: {collateral.get_doc_type_display()}",
        body="A manager added a new document to your profile.",
        object_ref=f"collateral:{collateral.id}",
    )


class StaffViewSet(viewsets.ViewSet):
    """Staff directory — superadmin, or anyone granted HR access (spec §5.1/§5.3)."""

    permission_classes = [HasModuleAccess]
    required_module = Module.HR_STAFF

    def list(self, request):
        qs = (
            User.objects.filter(role=Role.EMPLOYEE, purged_at__isnull=True)
            .select_related("profile")
        )
        search = request.query_params.get("search")
        if search:
            qs = qs.filter(full_name__icontains=search) | qs.filter(email__icontains=search)
        return Response(StaffListSerializer(qs, many=True).data)

    def create(self, request):
        phone = request.data.get("phone")
        if phone and not request.data.get("confirm_duplicate_phone"):
            conflict = _phone_conflict_response(phone)
            if conflict:
                return conflict

        serializer = StaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        dispatch_email_task(send_welcome_email, user.id)
        return Response(serializer.to_representation(user), status=status.HTTP_201_CREATED)

    def retrieve(self, request, pk=None):
        try:
            user = User.objects.select_related("profile").get(
                pk=pk, role=Role.EMPLOYEE, purged_at__isnull=True
            )
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
                "records": EmployeeRecordSerializer(user.records.all(), many=True).data,
                "leave_balance": LeaveBalanceSerializer(balance).data,
                "leaves": LeaveSerializer(user.leaves.all(), many=True).data,
                "tickets": TicketSerializer(user.tickets.all(), many=True).data,
            }
        )

    def partial_update(self, request, pk=None):
        try:
            user = User.objects.get(pk=pk, role=Role.EMPLOYEE, purged_at__isnull=True)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        phone = request.data.get("phone")
        if phone and not request.data.get("confirm_duplicate_phone"):
            conflict = _phone_conflict_response(phone, exclude_user_id=user.id)
            if conflict:
                return conflict

        serializer = StaffUpdateSerializer(data=request.data, context={"user": user})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(StaffListSerializer(user).data)

    @action(detail=True, methods=["post"])
    def reset_password(self, request, pk=None):
        """Email a set-password link. Current password stays valid until they use it."""
        try:
            user = User.objects.get(pk=pk, role=Role.EMPLOYEE, purged_at__isnull=True)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        dispatch_email_task(send_password_reset_email, user.id)
        return Response({"detail": "Password reset link sent. The current password still works until they use the link."})

    @action(detail=True, methods=["post"])
    def set_password(self, request, pk=None):
        """Admin sets a new password now (no current password required) and emails the employee."""
        try:
            user = User.objects.get(pk=pk, role=Role.EMPLOYEE, purged_at__isnull=True)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        password = (request.data.get("password") or "").strip()
        if len(password) < 8:
            return Response({"detail": "Password must be at least 8 characters."}, status=400)
        user.set_password(password)
        user.save(update_fields=["password", "updated_at"])
        dispatch_email_task(send_admin_changed_password_email, user.id)
        log_activity(
            actor=request.user,
            action=f"set a new password for {user.full_name or user.email}",
        )
        return Response({"detail": "Password updated. A notification email was sent to the employee."})

    @action(detail=True, methods=["post"])
    def set_status(self, request, pk=None):
        """Manager enables/disables an employee's CRM access (spec follow-up)."""
        try:
            user = User.objects.get(pk=pk, role=Role.EMPLOYEE, purged_at__isnull=True)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        new_status = request.data.get("status")
        if new_status not in (UserStatus.ACTIVE, UserStatus.DISABLED):
            return Response({"detail": "status must be 'active' or 'disabled'."}, status=400)
        user.status = new_status
        user.save(update_fields=["status", "updated_at"])
        dispatch_email_task(send_status_change_email, user.id, new_status)
        return Response(StaffListSerializer(user).data)

    @action(detail=True, methods=["post"])
    def delete_account(self, request, pk=None):
        """Permanently remove personal details after the account is disabled.
        Tasks, projects, and other work history stay in the database."""
        try:
            user = User.objects.select_related("profile").get(pk=pk, role=Role.EMPLOYEE)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        label = user.full_name or user.email
        try:
            purge_staff_account(user=user, actor=request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        log_activity(actor=request.user, action=f"Deleted staff account: {label}")
        return Response({"detail": "Account deleted."}, status=status.HTTP_200_OK)


class StaffAvatarUploadView(APIView):
    """Manager sets/replaces an employee's photo — used both from the Add
    Staff form and the staff edit page (spec follow-up)."""

    permission_classes = [HasModuleAccess]
    required_module = Module.HR_STAFF
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, pk):
        try:
            staff = User.objects.get(pk=pk, role=Role.EMPLOYEE, purged_at__isnull=True)
        except User.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        upload = request.FILES.get("file")
        if not upload:
            return Response({"detail": "file is required."}, status=400)

        profile, _ = StaffProfile.objects.get_or_create(user=staff)
        ext = upload.name.rsplit(".", 1)[-1].lower() if "." in upload.name else "jpg"
        key = f"avatars/{staff.pk}.{ext}"
        if default_storage.exists(key):
            default_storage.delete(key)
        saved_path = default_storage.save(key, upload)
        from time import time

        from common.media_urls import absolute_media_url

        base = absolute_media_url(request, default_storage.url(saved_path))
        profile.avatar_url = f"{base}{'&' if '?' in base else '?'}v={int(time())}"
        profile.save(update_fields=["avatar_url", "updated_at"])
        return Response({"avatar_url": profile.avatar_url})


class EmployeeCollateralView(APIView):
    """Manager generates a collateral PDF → Object Storage (spec §5.3)."""

    permission_classes = [HasModuleAccess]
    required_module = Module.HR_DOCUMENTS

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
        _notify_document(collateral)
        return Response(
            EmployeeCollateralSerializer(collateral).data, status=status.HTTP_201_CREATED
        )


class EmployeeCollateralUploadView(APIView):
    """Manager uploads a document directly (e.g. a salary certificate PDF)
    instead of auto-generating one from a template (spec follow-up)."""

    permission_classes = [HasModuleAccess]
    required_module = Module.HR_DOCUMENTS
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        staff_id = request.data.get("staff")
        doc_type = request.data.get("doc_type")
        upload = request.FILES.get("file")
        if not staff_id or not doc_type or not upload:
            return Response({"detail": "staff, doc_type and file are required."}, status=400)
        try:
            staff = User.objects.get(pk=staff_id)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Invalid staff."}, status=400)

        ext = upload.name.rsplit(".", 1)[-1].lower() if "." in upload.name else "pdf"
        key = f"collaterals/{staff.pk}/{doc_type}-{uuid.uuid4().hex}.{ext}"
        saved_path = default_storage.save(key, upload)

        collateral = EmployeeCollateral.objects.create(
            staff=staff,
            doc_type=doc_type,
            generated_by=request.user,
            generated_at=timezone.now(),
            file_url=request.build_absolute_uri(default_storage.url(saved_path)),
        )
        _notify_document(collateral)
        return Response(
            EmployeeCollateralSerializer(collateral).data, status=status.HTTP_201_CREATED
        )


class EmployeeCollateralDetailView(APIView):
    """DELETE a generated/uploaded document (spec follow-up: 'offer letter you
    can remove')."""

    permission_classes = [HasModuleAccess]
    required_module = Module.HR_DOCUMENTS

    def delete(self, request, pk):
        try:
            collateral = EmployeeCollateral.objects.get(pk=pk)
        except EmployeeCollateral.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        collateral.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmployeeRecordUploadView(APIView):
    """Attach a freeform document to an employee's HR record — a title the
    uploader types plus a file, distinct from the fixed collateral letters
    (spec follow-up)."""

    permission_classes = [HasModuleAccess]
    required_module = Module.HR_DOCUMENTS
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        staff_id = request.data.get("staff")
        title = request.data.get("title")
        upload = request.FILES.get("file")
        if not staff_id or not title or not upload:
            return Response({"detail": "staff, title and file are required."}, status=400)
        try:
            staff = User.objects.get(pk=staff_id)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Invalid staff."}, status=400)

        ext = upload.name.rsplit(".", 1)[-1].lower() if "." in upload.name else "pdf"
        key = f"employee-records/{staff.pk}/{uuid.uuid4().hex}.{ext}"
        saved_path = default_storage.save(key, upload)

        record = EmployeeRecord.objects.create(
            staff=staff,
            title=title,
            uploaded_by=request.user,
            file_url=request.build_absolute_uri(default_storage.url(saved_path)),
        )
        notify_user(
            user=staff,
            source="document",
            title=f"New record: {record.title}",
            body="A new document was added to your HR record.",
            object_ref=f"employee_record:{record.id}",
        )
        return Response(EmployeeRecordSerializer(record).data, status=status.HTTP_201_CREATED)


class EmployeeRecordDetailView(APIView):
    """DELETE an attached HR record."""

    permission_classes = [HasModuleAccess]
    required_module = Module.HR_DOCUMENTS

    def delete(self, request, pk):
        try:
            record = EmployeeRecord.objects.get(pk=pk)
        except EmployeeRecord.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        record.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyCollateralsView(APIView):
    """Employee sees their own issued letters (Edit Profile page, spec §5.3)."""

    permission_classes = [IsActive]

    def get(self, request):
        qs = EmployeeCollateral.objects.filter(staff=request.user)
        return Response(EmployeeCollateralSerializer(qs, many=True).data)


class LeaveViewSet(viewsets.ModelViewSet):
    serializer_class = LeaveSerializer
    permission_classes = [IsActive]
    # Used by approve/reject actions (HasModuleAccess).
    required_module = Module.HR_STAFF

    def get_queryset(self):
        qs = Leave.objects.select_related("staff")
        if has_module_access(self.request.user, Module.HR):
            staff = self.request.query_params.get("staff")
            return qs.filter(staff_id=staff) if staff else qs
        return qs.filter(staff=self.request.user)

    def perform_create(self, serializer):
        """Employees request for themselves (pending). HR/superadmin can log
        past leave for a staff member — usually as approved so it counts
        against annual balance immediately (over-allowance allowed)."""
        user = self.request.user
        is_hr = has_module_access(user, Module.HR)
        staff_id = self.request.data.get("staff")

        if is_hr and staff_id:
            try:
                staff = User.objects.get(pk=staff_id, role=Role.EMPLOYEE, purged_at__isnull=True)
            except User.DoesNotExist as exc:
                raise ValidationError({"staff": "Staff not found."}) from exc
            raw_status = self.request.data.get("status") or Leave.Status.APPROVED
            if raw_status not in {Leave.Status.APPROVED, Leave.Status.PENDING}:
                raw_status = Leave.Status.APPROVED
            leave = serializer.save(staff=staff, status=raw_status)
            self._recalc_balance(staff)
            log_activity(
                actor=user,
                action=f"added {leave.leave_type} leave for \"{staff.full_name or staff.email}\" ({leave.status})",
            )
            if leave.status == Leave.Status.PENDING:
                start_recurring_reminder(
                    source="leave_request",
                    title="Leave request pending",
                    body=f"{staff.full_name or staff.email} requested {leave.leave_type} leave.",
                    object_ref=f"leave:{leave.id}",
                    users=users_with_module_access(Module.HR),
                )
            return

        # Employee self-request — always pending for own account.
        leave = serializer.save(staff=user, status=Leave.Status.PENDING)
        self._recalc_balance(user)
        start_recurring_reminder(
            source="leave_request",
            title="Leave request pending",
            body=f"{user.full_name or user.email} requested {leave.leave_type} leave.",
            object_ref=f"leave:{leave.id}",
            users=users_with_module_access(Module.HR),
        )

    @action(detail=True, methods=["post"])
    def retract(self, request, pk=None):
        """Employee (or HR) retracts a leave request that is still pending."""
        leave = self.get_object()
        is_owner = leave.staff_id == request.user.id
        is_hr = has_module_access(request.user, Module.HR)
        if not is_owner and not is_hr:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
        if leave.status != Leave.Status.PENDING:
            return Response(
                {"detail": "Only pending leave requests can be retracted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        leave.status = Leave.Status.CANCELLED
        leave.save(update_fields=["status", "updated_at"])
        self._recalc_balance(leave.staff)
        stop_recurring_reminder(object_ref=f"leave:{leave.id}")
        return Response(LeaveSerializer(leave).data)

    @action(detail=True, methods=["patch"], permission_classes=[HasModuleAccess])
    def decision(self, request, pk=None):
        """PATCH approve/reject (spec §5.3: PATCH /api/hr/leaves/{id})."""
        leave = self.get_object()
        new_status = request.data.get("status")
        if new_status not in {Leave.Status.APPROVED, Leave.Status.REJECTED}:
            return Response(
                {"detail": "status must be 'approved' or 'rejected'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if leave.status != Leave.Status.PENDING:
            return Response(
                {"detail": "Only pending leave requests can be decided."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        leave.status = new_status
        leave.save(update_fields=["status", "updated_at"])
        self._recalc_balance(leave.staff)
        # Everyone with HR access stops receiving the reminder the instant it's actioned (spec §5.5).
        stop_recurring_reminder(object_ref=f"leave:{leave.id}")
        return Response(LeaveSerializer(leave).data)

    # PATCH on the detail route also approves/rejects, matching the spec path exactly.
    def partial_update(self, request, *args, **kwargs):
        if not has_module_access(request.user, Module.HR):
            return Response({"detail": "HR access required."}, status=status.HTTP_403_FORBIDDEN)
        return self.decision(request, pk=kwargs.get("pk"))

    @staticmethod
    def _recalc_balance(staff):
        """Balance nets approved + pending against the 30-day allowance (spec §5.5).
        Used may exceed annual_allowance; remaining can be negative."""
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
    required_module = Module.HR_STAFF
    serializer_class = TicketSerializer
    permission_classes = [IsActive]

    def get_queryset(self):
        qs = Ticket.objects.select_related("raised_by")
        if has_module_access(self.request.user, Module.HR):
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
            users=users_with_module_access(Module.HR),
        )

    def partial_update(self, request, *args, **kwargs):
        # Only someone with HR access marks resolved (spec §5.3).
        if not has_module_access(request.user, Module.HR):
            return Response({"detail": "HR access required."}, status=status.HTTP_403_FORBIDDEN)
        ticket = self.get_object()
        ticket.status = request.data.get("status", ticket.status)
        ticket.save(update_fields=["status", "updated_at"])
        if ticket.status == Ticket.Status.RESOLVED:
            stop_recurring_reminder(object_ref=f"ticket:{ticket.id}")
        return Response(TicketSerializer(ticket).data)


class HrLetterViewSet(viewsets.ModelViewSet):
    """HR Documents builder — create/edit letters, export PDF, assign to staff
    (except offer letters)."""

    serializer_class = HrLetterSerializer
    permission_classes = [HasModuleAccess]
    required_module = Module.HR_DOCUMENTS
    filterset_fields = ["doc_type", "status", "staff"]
    search_fields = ["title", "staff__full_name", "staff__email", "doc_type"]

    def get_queryset(self):
        return HrLetter.objects.select_related("staff", "created_by")

    def perform_create(self, serializer):
        letter = serializer.save(created_by=self.request.user)
        self._maybe_notify(letter, before_staff_id=None)

    def perform_update(self, serializer):
        before = serializer.instance.staff_id
        letter = serializer.save()
        self._maybe_notify(letter, before_staff_id=before)

    def _maybe_notify(self, letter, before_staff_id):
        if letter.doc_type == HrLetter.DocType.OFFER or not letter.staff_id:
            return
        if letter.staff_id == before_staff_id:
            return
        notify_user(
            user=letter.staff,
            source="document",
            title=f"New document: {letter.get_doc_type_display()}",
            body="A letter has been prepared for you. Open Profile → Documents to download.",
            object_ref=f"hr_letter:{letter.id}",
        )

    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        """POST /api/hr/letters/{id}/duplicate — clone as draft named `title_duplicate`."""
        from common.duplicate import deep_copy_json, duplicate_label

        src = self.get_object()
        base = (src.title or src.get_doc_type_display()).strip()
        title = duplicate_label(
            base,
            exists=lambda t: HrLetter.objects.filter(title=t).exists(),
        )
        letter = HrLetter.objects.create(
            doc_type=src.doc_type,
            title=title,
            staff=src.staff,
            content=deep_copy_json(src.content),
            status=HrLetter.Status.DRAFT,
            file_url="",
            created_by=request.user,
        )
        return Response(HrLetterSerializer(letter).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def pdf(self, request, pk=None):
        from django.utils import timezone

        from .letter_pdf import render_letter_pdf

        letter = self.get_object()
        url = render_letter_pdf(letter, request)
        letter.file_url = url
        letter.status = HrLetter.Status.ISSUED
        letter.save(update_fields=["file_url", "status", "updated_at"])
        if letter.staff_id and letter.doc_type != HrLetter.DocType.OFFER:
            notify_user(
                user=letter.staff,
                source="document",
                title=f"Document ready: {letter.get_doc_type_display()}",
                body="Your letter PDF is ready to download from Profile → Documents.",
                object_ref=f"hr_letter:{letter.id}:pdf:{timezone.now().timestamp()}",
            )
        return Response({"file_url": url, **HrLetterSerializer(letter).data})


class MyHrLettersView(APIView):
    """Employee: letters assigned to them (issued PDFs)."""

    permission_classes = [IsActive]

    def get(self, request):
        qs = (
            HrLetter.objects.filter(staff=request.user, status=HrLetter.Status.ISSUED)
            .exclude(doc_type=HrLetter.DocType.OFFER)
            .exclude(file_url="")
            .order_by("-updated_at")
        )
        return Response(HrLetterSerializer(qs, many=True).data)
