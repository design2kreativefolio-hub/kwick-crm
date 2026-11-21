import json
from datetime import datetime, timedelta

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from accounts.models import Module
from common.permissions import HasModuleAccess, IsSuperadmin, is_superadmin
from common.services import log_activity as log_audit

from . import ai, importer, mail, proposal_links, reports, scoring, services
from .models import Activity, Deal, FollowUp, Lead, LeadCaptureSource
from .serializers import (
    ActivitySerializer,
    DealSerializer,
    FollowUpSerializer,
    LeadCaptureSourceSerializer,
    LeadSerializer,
)
from .services import BDError


class AIThrottle(UserRateThrottle):
    scope = "bd_ai"


MAX_CARD_BYTES = 6 * 1024 * 1024
CARD_TYPES = {"image/jpeg", "image/png", "image/webp"}


class BDScopedMixin:
    """Everything in this module is owner-scoped on the server: a BDE only ever
    sees their own rows (someone else's id is a 404, never a 403, so ids can't
    be probed); the superadmin sees all, and may narrow with ?owner=<id>."""

    permission_classes = [HasModuleAccess]
    required_module = Module.BD
    owner_field = "owner"

    def scope(self, qs):
        user = self.request.user
        if is_superadmin(user):
            owner = self.request.query_params.get("owner")
            if owner and owner.isdigit():
                qs = qs.filter(**{self.owner_field: int(owner)})
            return qs
        return qs.filter(**{self.owner_field: user})


def scoped_leads(request):
    qs = Lead.objects.select_related("owner", "deal")
    if is_superadmin(request.user):
        return qs
    return qs.filter(owner=request.user)


def _bad(message, **extra):
    return Response({"detail": message, **extra}, status=status.HTTP_400_BAD_REQUEST)


def _aware(value):
    """Parse an ISO datetime (or date) from the client into an aware datetime."""
    if not value:
        return None
    dt = parse_datetime(str(value))
    if dt is None:
        d = parse_date(str(value))
        if d is None:
            return None
        dt = datetime(d.year, d.month, d.day, 9, 0)
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt)
    return dt


class DuplicateConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This looks like a duplicate."

    def __init__(self, matches):
        super().__init__()
        self.detail = {
            "detail": "This looks like a duplicate.",
            "duplicates": matches,
            "can_override": not any(m["hard"] for m in matches),
        }


def _duplicate_response(matches):
    return Response(
        {
            "detail": "This looks like a duplicate.",
            "duplicates": matches,
            "can_override": not any(m["hard"] for m in matches),
        },
        status=status.HTTP_409_CONFLICT,
    )


# ---------------------------------------------------------------------------
# Leads
# ---------------------------------------------------------------------------
class LeadViewSet(BDScopedMixin, viewsets.ModelViewSet):
    queryset = Lead.objects.select_related("owner", "deal")
    serializer_class = LeadSerializer
    filterset_fields = ["status", "source", "currency"]
    search_fields = ["company", "contact_name", "phone", "whatsapp", "email", "website"]
    ordering_fields = ["created_at", "next_follow_up_at", "last_activity_at", "est_value", "company", "score"]

    def get_permissions(self):
        if self.action == "reassign":  # only the admin hands leads to another BDE
            return [IsSuperadmin()]
        return super().get_permissions()

    def get_queryset(self):
        qs = self.scope(super().get_queryset())
        params = self.request.query_params
        service = params.get("service")
        if service:
            qs = qs.filter(services__contains=[service])
        due = params.get("follow_up")
        if due:
            now = timezone.now()
            start = timezone.localtime(now).replace(hour=0, minute=0, second=0, microsecond=0)
            end = start + timedelta(days=1)
            if due == "overdue":
                qs = qs.filter(next_follow_up_at__lt=start)
            elif due == "today":
                qs = qs.filter(next_follow_up_at__gte=start, next_follow_up_at__lt=end)
            elif due == "due":  # overdue or today
                qs = qs.filter(next_follow_up_at__lt=end)
            elif due == "none":
                qs = qs.filter(next_follow_up_at__isnull=True)
        if params.get("view") == "work":  # the inbox: not qualified, not closed
            qs = qs.filter(status__in=[Lead.Status.NEW, Lead.Status.CONTACTED], deal__isnull=True)
        stage = params.get("stage")
        if stage in (Lead.Status.NEW, Lead.Status.CONTACTED):
            qs = qs.filter(deal__isnull=True, status=stage)
        elif stage in {s.value for s in Deal.Stage}:
            qs = qs.filter(deal__stage=stage)
        band = params.get("score")
        if band in ("hot", "warm", "cold"):
            open_ = [Lead.Status.NEW, Lead.Status.CONTACTED, Lead.Status.QUALIFIED]
            qs = qs.filter(status__in=open_)
            if band == "hot":
                qs = qs.filter(score__gte=scoring.HOT)
            elif band == "warm":
                qs = qs.filter(score__gte=scoring.WARM, score__lt=scoring.HOT)
            else:
                qs = qs.filter(score__lt=scoring.WARM)
        has_value = params.get("has_value")
        if has_value in ("yes", "no"):
            valued = Q(est_value__gt=0) | Q(deal__value__gt=0)
            qs = qs.filter(valued) if has_value == "yes" else qs.exclude(valued)
        added = params.get("added")
        if added in ("today", "7", "30", "90"):
            start = timezone.localtime(timezone.now()).replace(hour=0, minute=0, second=0, microsecond=0)
            if added != "today":
                start -= timedelta(days=int(added))
            qs = qs.filter(created_at__gte=start)
        return qs

    # -- create / update with duplicate protection --------------------------
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        matches = services.find_duplicates(
            request.user,
            phone=data.get("phone", ""),
            whatsapp=data.get("whatsapp", ""),
            email=data.get("email", ""),
            website=data.get("website", ""),
        )
        if matches and (
            any(m["hard"] for m in matches) or not request.data.get("confirm_duplicate")
        ):
            return _duplicate_response(matches)

        if is_superadmin(request.user):
            owner = self._owner_from_request(request.data.get("owner")) or services.pick_owner()
        else:
            owner = request.user
        if owner is None:
            return _bad("No one is available to own this lead.")

        lead = serializer.save(owner=owner)
        note = (request.data.get("note") or "").strip()
        if note:
            services.log_activity(
                lead=lead, user=request.user, kind=Activity.Kind.NOTE, body=note
            )
        out = LeadSerializer(Lead.objects.select_related("owner", "deal").get(pk=lead.pk))
        return Response(out.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        data = serializer.validated_data
        touched = {"phone", "whatsapp", "email", "website"} & set(data)
        if touched:
            merged = {
                f: data.get(f, getattr(serializer.instance, f)) for f in ("phone", "whatsapp", "email", "website")
            }
            matches = services.find_duplicates(
                self.request.user, exclude_lead_id=serializer.instance.pk, **merged
            )
            if matches and (
                any(m["hard"] for m in matches) or not self.request.data.get("confirm_duplicate")
            ):
                raise DuplicateConflict(matches)
        serializer.save()

    @staticmethod
    def _owner_from_request(raw):
        if not raw:
            return None
        from accounts.models import User

        user = User.objects.filter(pk=raw, status="active").first()
        if user and (is_superadmin(user) or services.active_bdes().filter(pk=user.pk).exists()):
            return user
        return None

    # -- actions ------------------------------------------------------------
    @action(detail=False, methods=["post"], url_path="check-duplicate")
    def check_duplicate(self, request):
        d = request.data
        matches = services.find_duplicates(
            request.user,
            phone=d.get("phone", ""),
            whatsapp=d.get("whatsapp", ""),
            email=d.get("email", ""),
            website=d.get("website", ""),
            exclude_lead_id=d.get("exclude") or None,
        )
        return Response({"duplicates": matches, "can_override": not any(m["hard"] for m in matches)})

    @action(detail=False, methods=["get"])
    def owners(self, request):
        """People a lead can belong to — drives the owner filter and reassign."""
        if is_superadmin(request.user):
            users = list(services.active_bdes().order_by("full_name", "email"))
        else:
            users = [request.user]
        return Response(
            [{"id": u.pk, "name": u.full_name or u.email, "email": u.email} for u in users]
        )

    @action(detail=False, methods=["post"])
    def reassign(self, request):
        ids = request.data.get("lead_ids") or []
        if not isinstance(ids, list) or not ids:
            return _bad("Pick at least one lead.")
        new_owner = self._owner_from_request(request.data.get("owner"))
        if new_owner is None:
            return _bad("Pick an active BDE to hand these leads to.")
        count = services.reassign_leads(ids, new_owner, request.user)
        log_audit(
            actor=request.user,
            action=f"reassigned {count} lead(s) to {new_owner.full_name or new_owner.email}",
        )
        return Response({"reassigned": count})

    @action(detail=True, methods=["post"])
    def qualify(self, request, pk=None):
        lead = self.get_object()
        try:
            deal = services.qualify_lead(
                lead,
                request.user,
                title=(request.data.get("title") or "").strip(),
                value=request.data.get("value"),
                currency=request.data.get("currency"),
                expected_close_date=parse_date(str(request.data.get("expected_close_date") or "")),
            )
        except BDError as exc:
            return _bad(str(exc))
        return Response(DealSerializer(deal).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], throttle_classes=[AIThrottle])
    def edith(self, request, pk=None):
        """EDITH helpers on one lead: summary, draft (whatsapp / email), next_step, score.
        Produces text for the BDE to read and edit - nothing is sent or saved."""
        lead = self.get_object()
        if not ai.ready():
            return Response({"detail": "EDITH isn't switched on yet. Ask the admin to set it up."}, status=503)
        act = request.data.get("action")
        try:
            if act == "summary":
                return Response({"text": ai.summarise(lead)})
            if act == "next_step":
                return Response({"text": ai.next_step(lead)})
            if act == "score":
                return Response({"text": ai.explain_score(lead)})
            if act == "draft":
                channel = "email" if request.data.get("channel") == "email" else "whatsapp"
                return Response({**ai.draft(lead, request.user, channel), "channel": channel})
        except ai.AIError as exc:
            return Response({"detail": str(exc)}, status=502)
        return _bad("Unknown EDITH action.")

    @action(
        detail=False,
        methods=["post"],
        url_path="scan-card",
        parser_classes=[MultiPartParser, FormParser],
        throttle_classes=[AIThrottle],
    )
    def scan_card(self, request):
        """Read a business card photo into lead form fields (nothing is saved here)."""
        if not ai.ready():
            return Response({"detail": "EDITH isn't switched on yet. Ask the admin to set it up."}, status=503)
        upload = request.FILES.get("image")
        if not upload:
            return _bad("Choose a photo of the card.")
        if upload.content_type not in CARD_TYPES:
            return _bad("Use a JPG, PNG or WebP photo.")
        if upload.size > MAX_CARD_BYTES:
            return _bad("That photo is too large (6 MB max).")
        try:
            fields = ai.scan_card(upload.read(), upload.content_type)
        except ai.AIError as exc:
            return Response({"detail": str(exc)}, status=502)
        return Response({"fields": fields})

    @action(detail=False, methods=["post"], url_path="bulk-qualify")
    def bulk_qualify(self, request):
        """Qualify several leads at once. Ones that already have a deal, or are
        closed, are skipped and counted."""
        leads = self._bulk_leads(request)
        if leads is None:
            return _bad("Pick at least one lead.")
        done = skipped = 0
        for lead in leads:
            try:
                services.qualify_lead(lead, request.user)
                done += 1
            except BDError:
                skipped += 1
        log_audit(actor=request.user, action=f"qualified {done} lead(s) in bulk")
        return Response({"qualified": done, "skipped": skipped})

    @action(detail=False, methods=["post"], url_path="bulk-disqualify")
    def bulk_disqualify(self, request):
        reason = (request.data.get("reason") or "").strip()
        if not reason:
            return _bad("A reason is required to disqualify leads.")
        leads = self._bulk_leads(request)
        if leads is None:
            return _bad("Pick at least one lead.")
        done = skipped = 0
        for lead in leads:
            try:
                services.disqualify_lead(lead, request.user, reason)
                done += 1
            except BDError:
                skipped += 1
        log_audit(actor=request.user, action=f"disqualified {done} lead(s) in bulk")
        return Response({"disqualified": done, "skipped": skipped})

    @action(detail=False, methods=["post"], url_path="bulk-delete")
    def bulk_delete(self, request):
        """Permanently remove leads and everything on them (timeline, notes, follow-ups, the deal,
        proposal links, their alerts). A BDE can only delete their own; the admin any. Sales
        records already created from a won deal (client, invoice, documents) are not touched."""
        leads = self._bulk_leads(request)
        if leads is None:
            return _bad("Pick at least one lead.")
        for lead in leads:
            lead.delete()
        log_audit(actor=request.user, action=f"deleted {len(leads)} lead(s)")
        return Response({"deleted": len(leads), "skipped": 0})

    def perform_destroy(self, instance):
        log_audit(actor=self.request.user, action=f'deleted lead "{instance.display_name}"')
        instance.delete()

    def _bulk_leads(self, request):
        ids = request.data.get("lead_ids") or []
        if not isinstance(ids, list) or not ids or len(ids) > 500:
            return None
        ids = [int(i) for i in ids if str(i).isdigit()]
        # scope() keeps a BDE to their own leads, so other people's ids just drop out
        return list(self.scope(Lead.objects.select_related("owner", "deal")).filter(pk__in=ids))

    @action(detail=True, methods=["post"])
    def disqualify(self, request, pk=None):
        lead = self.get_object()
        try:
            services.disqualify_lead(lead, request.user, request.data.get("reason", ""))
        except BDError as exc:
            return _bad(str(exc))
        return Response(self._fresh(lead))

    @action(detail=True, methods=["post"], url_path="send-email")
    def send_email(self, request, pk=None):
        """One-to-one email from the sales mailbox; logged on the timeline."""
        lead = self.get_object()
        try:
            activity = mail.send_lead_email(
                lead=lead,
                user=request.user,
                subject=request.data.get("subject", ""),
                body=request.data.get("body", ""),
            )
        except BDError as exc:
            return _bad(str(exc))
        return Response(ActivitySerializer(activity).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        lead = self.get_object()
        try:
            services.reopen_lead(lead, request.user)
        except BDError as exc:
            return _bad(str(exc))
        return Response(self._fresh(lead))

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        """Board / stage-picker entry point. Handles the whole journey, so a
        card can be dropped on any column: New/Contacted flip the lead's status;
        anything later creates the deal if needed, then moves it."""
        lead = self.get_object()
        stage = request.data.get("stage")
        try:
            if stage in (Lead.Status.NEW, Lead.Status.CONTACTED):
                if hasattr(lead, "deal"):
                    raise BDError("A qualified deal can't go back to the lead stage.")
                if lead.status in (Lead.Status.DISQUALIFIED, Lead.Status.CONVERTED):
                    raise BDError("Re-open this lead first.")
                if lead.status != stage:
                    old = lead.get_status_display()
                    lead.status = stage
                    lead.save(update_fields=["status", "updated_at"])
                    services.system_note(
                        lead, f"Stage: {old} → {lead.get_status_display()}", user=request.user,
                        kind="stage_change",
                    )
            elif stage in {s.value for s in Deal.Stage}:
                if lead.status == Lead.Status.DISQUALIFIED and not hasattr(lead, "deal"):
                    raise BDError("Re-open this lead first.")
                deal = getattr(lead, "deal", None) or services.qualify_lead(lead, request.user)
                if stage == Deal.Stage.QUALIFIED and deal.stage == Deal.Stage.QUALIFIED:
                    pass
                else:
                    services.move_deal(
                        deal,
                        stage,
                        request.user,
                        lost_reason=request.data.get("lost_reason", ""),
                        lost_note=request.data.get("lost_note", ""),
                        win_options=_win_options(request.data),
                    )
            else:
                raise BDError("Unknown stage.")
        except BDError as exc:
            return _bad(str(exc))
        return Response(self._fresh(lead))

    @action(detail=False, methods=["post"], url_path="import", parser_classes=[MultiPartParser, FormParser])
    def import_leads(self, request):
        upload = request.FILES.get("file")
        if not upload:
            return _bad("Choose a file to import.")
        try:
            headers, rows, info = importer.read_table_info(upload, request.data.get("sheet") or None)
        except importer.ImportFileError as exc:
            return _bad(str(exc))

        mapping = importer.guess_mapping(headers)
        raw_mapping = request.data.get("mapping")
        if raw_mapping:
            try:
                supplied = json.loads(raw_mapping)
            except ValueError:
                return _bad("Column mapping was not valid.")
            mapping = {
                f: h for f, h in supplied.items() if f in importer.FIELDS and h and h in headers
            }

        default_source = request.data.get("default_source") or Lead.Source.OTHER
        if default_source not in Lead.Source.values:
            default_source = Lead.Source.OTHER
        owner = None
        if is_superadmin(request.user):
            owner = self._owner_from_request(request.data.get("owner"))  # None → round-robin
        else:
            owner = request.user

        if not (mapping.get("company") or mapping.get("contact_name")):
            return _bad(
                "Map at least a Company or Contact column so leads can be named.",
                headers=headers,
                mapping=mapping,
            )

        results = importer.analyse(
            request.user, headers, rows, mapping, default_source=default_source, owner=owner
        )
        summary = importer.summarise(results)
        if str(request.data.get("commit")) in ("1", "true", "True"):
            created = importer.commit(request.user, results, owner=owner)
            summary["created"] = created
            log_audit(actor=request.user, action=f"imported {created} lead(s) from a spreadsheet")
            return Response({"committed": True, "summary": summary})

        preview = [
            {"row": r["row"], "status": r["status"], "reason": r["reason"], "data": {
                k: (str(v) if not isinstance(v, (list, str)) else v) for k, v in r["data"].items()
            }}
            for r in results[: importer.PREVIEW_ROWS]
        ]
        return Response(
            {
                "committed": False,
                "headers": headers,
                "sheet": info["sheet"],
                "sheets": info["sheets"],
                "mapping": mapping,
                "fields": importer.FIELDS,
                "summary": summary,
                "rows": preview,
            }
        )

    def _fresh(self, lead):
        lead = Lead.objects.select_related("owner", "deal").get(pk=lead.pk)
        return LeadSerializer(lead).data


def _win_options(data):
    client_id = data.get("client_id")
    return {"client_id": int(client_id) if str(client_id or "").isdigit() else None}


# ---------------------------------------------------------------------------
# Deals
# ---------------------------------------------------------------------------
class DealViewSet(
    BDScopedMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Deal.objects.select_related("lead", "owner")
    serializer_class = DealSerializer
    filterset_fields = ["stage", "currency"]
    search_fields = ["title", "lead__company", "lead__contact_name"]
    ordering_fields = ["updated_at", "value", "expected_close_date", "stage_changed_at"]

    def get_permissions(self):
        # Clients and invoices belong to Sales: only the admin links / drafts them.
        if self.action in ("link_client", "create_invoice"):
            return [IsSuperadmin()]
        return super().get_permissions()

    def get_queryset(self):
        return self.scope(super().get_queryset())

    def get_serializer_context(self):
        return {**super().get_serializer_context(), "request": self.request}

    def perform_update(self, serializer):
        deal = serializer.instance
        if deal.stage in (Deal.Stage.WON, Deal.Stage.LOST) and (
            "value" in serializer.validated_data or "currency" in serializer.validated_data
        ):
            raise ValidationError("Closed deals can't be re-valued.")
        serializer.save()

    @action(detail=True, methods=["post"])
    def move(self, request, pk=None):
        deal = self.get_object()
        try:
            services.move_deal(
                deal,
                request.data.get("stage"),
                request.user,
                lost_reason=request.data.get("lost_reason", ""),
                lost_note=request.data.get("lost_note", ""),
                win_options=_win_options(request.data),
            )
        except BDError as exc:
            return _bad(str(exc))
        return Response(DealSerializer(Deal.objects.select_related("lead", "owner").get(pk=deal.pk)).data)

    @action(detail=True, methods=["get", "post"], url_path="proposal-link")
    def proposal_link(self, request, pk=None):
        """GET: the current tracked link (or null). POST: create / reuse one."""
        deal = self.get_object()
        if request.method == "GET":
            link = (
                deal.proposal_links.filter(active=True, proposal_id=deal.proposal_id).order_by("-created_at").first()
                if deal.proposal_id
                else None
            )
            return Response(proposal_links.link_payload(link) if link and link.is_usable() else None)
        try:
            link = proposal_links.get_or_create_link(deal, request.user)
        except BDError as exc:
            return _bad(str(exc))
        return Response(proposal_links.link_payload(link))

    @action(detail=True, methods=["post"], url_path="link-client")
    def link_client(self, request, pk=None):
        from sales.models import Client

        deal = self.get_object()
        if deal.stage != Deal.Stage.WON:
            return _bad("Only a won deal can be linked to a client.")
        client = Client.objects.filter(pk=request.data.get("client_id") or 0).first()
        if client is None:
            return _bad("Pick the client.")
        services.link_client(deal, client)
        log_audit(actor=request.user, action=f'linked deal "{deal.title}" to client {client.client_id}')
        return Response(DealSerializer(Deal.objects.select_related("lead", "owner", "client").get(pk=deal.pk)).data)

    @action(detail=True, methods=["post"], url_path="create-invoice")
    def create_invoice(self, request, pk=None):
        deal = self.get_object()
        try:
            services.create_deal_invoice(deal, request.user)
        except BDError as exc:
            return _bad(str(exc))
        log_audit(actor=request.user, action=f'drafted an invoice from deal "{deal.title}"')
        return Response(DealSerializer(Deal.objects.select_related("lead", "owner", "client").get(pk=deal.pk)).data)

    @action(detail=True, methods=["post"])
    def win(self, request, pk=None):
        deal = self.get_object()
        try:
            services.win_deal(deal, request.user, **_win_options(request.data))
        except BDError as exc:
            return _bad(str(exc))
        log_audit(actor=request.user, action=f'won deal "{deal.title}"')
        return Response(DealSerializer(Deal.objects.select_related("lead", "owner").get(pk=deal.pk)).data)


# ---------------------------------------------------------------------------
# Activities (timeline)
# ---------------------------------------------------------------------------
class ActivityViewSet(
    BDScopedMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Activity.objects.select_related("user", "lead")
    serializer_class = ActivitySerializer
    owner_field = "lead__owner"
    filterset_fields = ["kind", "lead", "deal"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_permissions(self):
        if self.action == "destroy":
            return [IsSuperadmin()]
        return super().get_permissions()

    def get_queryset(self):
        return self.scope(super().get_queryset())

    def create(self, request, *args, **kwargs):
        lead = get_object_or_404(scoped_leads(request), pk=request.data.get("lead") or 0)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data["kind"] not in Activity.LOGGABLE:
            return _bad("That activity type can't be logged by hand.")
        activity = services.log_activity(
            lead=lead,
            user=request.user,
            kind=data["kind"],
            direction=data.get("direction") or "out",
            outcome=data.get("outcome", ""),
            body=data.get("body", ""),
            occurred_at=data.get("occurred_at"),
            meeting_url=data.get("meeting_url", ""),
        )
        next_fu = request.data.get("next_follow_up")
        if isinstance(next_fu, dict) and next_fu.get("due_at"):
            due = _aware(next_fu.get("due_at"))
            if due is None:
                return _bad("The follow-up date wasn't valid.")
            services.create_follow_up(
                lead=lead,
                owner=lead.owner,
                due_at=due,
                note=(next_fu.get("note") or "")[:300],
                kind=next_fu.get("kind") or "follow_up",
                meeting_url=next_fu.get("meeting_url") or "",
            )
        lead.refresh_from_db()
        return Response(
            {**ActivitySerializer(activity).data, "lead_status": lead.status},
            status=status.HTTP_201_CREATED,
        )

    def perform_update(self, serializer):
        if serializer.instance.kind not in Activity.LOGGABLE:
            raise ValidationError("System entries can't be edited.")
        serializer.save()


# ---------------------------------------------------------------------------
# Follow-ups
# ---------------------------------------------------------------------------
class FollowUpViewSet(BDScopedMixin, viewsets.ModelViewSet):
    queryset = FollowUp.objects.select_related("lead", "owner")
    serializer_class = FollowUpSerializer
    filterset_fields = ["lead", "kind"]
    ordering_fields = ["due_at", "created_at"]

    def get_queryset(self):
        qs = self.scope(super().get_queryset())
        state = self.request.query_params.get("state")
        now = timezone.now()
        if state == "open":
            qs = qs.filter(done_at__isnull=True)
        elif state == "done":
            qs = qs.filter(done_at__isnull=False)
        elif state == "overdue":
            qs = qs.filter(done_at__isnull=True, due_at__lt=now)
        return qs

    def create(self, request, *args, **kwargs):
        lead = get_object_or_404(scoped_leads(request), pk=request.data.get("lead") or 0)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        follow_up = services.create_follow_up(
            lead=lead,
            owner=lead.owner,
            due_at=serializer.validated_data["due_at"],
            note=serializer.validated_data.get("note", ""),
            kind=serializer.validated_data.get("kind", "follow_up"),
            meeting_url=serializer.validated_data.get("meeting_url", ""),
        )
        return Response(FollowUpSerializer(follow_up).data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        instance = serializer.instance
        due_changed = "due_at" in serializer.validated_data and (
            serializer.validated_data["due_at"] != instance.due_at
        )
        follow_up = serializer.save()
        if due_changed:
            follow_up.notified_at = None  # re-arm the reminder for the new time
            follow_up.save(update_fields=["notified_at", "updated_at"])
        done = self.request.data.get("done")
        if done is True and follow_up.done_at is None:
            services.complete_follow_up(follow_up)
        elif done is False and follow_up.done_at is not None:
            follow_up.done_at = None
            follow_up.save(update_fields=["done_at", "updated_at"])
        services.sync_next_follow_up(follow_up.lead)

    def perform_destroy(self, instance):
        lead = instance.lead
        instance.delete()
        services.sync_next_follow_up(lead)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        follow_up = services.complete_follow_up(self.get_object())
        return Response(FollowUpSerializer(follow_up).data)


# ---------------------------------------------------------------------------
# Read-only screens
# ---------------------------------------------------------------------------
class _ScopedAPIView(APIView):
    permission_classes = [HasModuleAccess]
    required_module = Module.BD

    def owner_filter(self, qs, field="owner"):
        user = self.request.user
        if is_superadmin(user):
            owner = self.request.query_params.get("owner")
            return qs.filter(**{field: int(owner)}) if owner and owner.isdigit() else qs
        return qs.filter(**{field: user})


class MyDayView(_ScopedAPIView):
    """GET /api/bd/my-day"""

    def get(self, request):
        return Response(
            services.build_my_day(
                self.owner_filter(Lead.objects.all()),
                self.owner_filter(Deal.objects.all()),
                self.owner_filter(FollowUp.objects.all()),
            )
        )


class PipelineView(_ScopedAPIView):
    """GET /api/bd/pipeline — the board: one column per stage with AED totals."""

    def get(self, request):
        params = request.query_params
        try:
            closed_limit = max(10, min(int(params.get("closed_limit", 50)), 500))
        except ValueError:
            closed_limit = 50
        sort = params.get("sort") if params.get("sort") in ("follow_up", "value", "newest", "quiet") else "follow_up"
        deals = services.filter_deals(self.owner_filter(Deal.objects.all()), params)
        return Response(
            services.build_pipeline(
                self.owner_filter(Lead.objects.all()), deals, closed_limit=closed_limit, sort=sort
            )
        )


# ---------------------------------------------------------------------------
# Phase 2: capture sources, mail status, reports
# ---------------------------------------------------------------------------
class CaptureSourceViewSet(viewsets.ModelViewSet):
    """Superadmin: issue, pause or rotate the tokens website forms post to."""

    permission_classes = [IsSuperadmin]
    serializer_class = LeadCaptureSourceSerializer
    queryset = LeadCaptureSource.objects.select_related("default_owner")
    pagination_class = None

    def get_queryset(self):
        return super().get_queryset().filter(kind=LeadCaptureSource.Kind.WEBSITE)

    def perform_create(self, serializer):
        serializer.save(kind=LeadCaptureSource.Kind.WEBSITE)

    @action(detail=True, methods=["post"])
    def rotate(self, request, pk=None):
        """Replace the token (the old form URL stops working immediately)."""
        from .models import _new_token

        source = self.get_object()
        source.token = _new_token()
        source.save(update_fields=["token", "updated_at"])
        return Response(self.get_serializer(source).data)


class MailStatusView(_ScopedAPIView):
    """GET /api/bd/mail-status. Lets the UI offer sending from Kwick only when
    the server can actually send, and tells the superadmin what is switched on."""

    def get(self, request):
        from . import capture

        out = {
            "can_send": mail.can_send(),
            "from": mail.from_address() if mail.can_send() else "",
            "ai": ai.ready(),  # EDITH helpers + card scan
        }
        if is_superadmin(request.user):
            out.update({"can_read": mail.can_read(), "meta": capture.meta_configured()})
        return Response(out)


class ReportView(APIView):
    """GET /api/bd/reports?days=30[&owner=<id>] - superadmin only."""

    permission_classes = [IsSuperadmin]

    def get(self, request):
        try:
            days = max(1, min(int(request.query_params.get("days", 30)), 365))
        except ValueError:
            days = 30
        end = timezone.now()
        owner = request.query_params.get("owner")
        data = reports.build_report(
            end - timedelta(days=days), end, owner=int(owner) if owner and owner.isdigit() else None
        )
        data["days"] = days
        return Response(data)
