"""Token-based public endpoints (no login): lead capture and the proposal link.

Every response is private/no-store and noindex. Capture is throttled and has a
honeypot; the proposal endpoints only ever reach the one proposal the token
belongs to."""
from __future__ import annotations

from django.http import Http404
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from . import capture, proposal_links
from .models import LeadCaptureSource, ProposalLink

# Form plugins fill these only if they are bots — humans never see them.
HONEYPOTS = ("_gotcha", "hp", "hp_url", "bd_hp", "honeypot", "website_url_confirm")


class CaptureThrottle(AnonRateThrottle):
    scope = "bd_capture"


class ProposalThrottle(AnonRateThrottle):
    scope = "bd_proposal"


class AcceptThrottle(AnonRateThrottle):
    scope = "bd_accept"


class _PublicBase(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        response["Cache-Control"] = "private, no-store"
        response["X-Robots-Tag"] = "noindex, nofollow"
        response["Referrer-Policy"] = "no-referrer"
        return response


class CaptureView(_PublicBase):
    """POST /api/public/bd/capture/<token> — from a WordPress form webhook or a
    plain <form>/fetch on the website."""

    throttle_classes = [CaptureThrottle]
    parser_classes = [JSONParser, FormParser, MultiPartParser]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        # The token is the credential (no cookies), so a browser form on the
        # marketing site may call this cross-origin.
        response["Access-Control-Allow-Origin"] = "*"
        return response

    def options(self, request, *args, **kwargs):
        response = Response(status=status.HTTP_204_NO_CONTENT)
        response["Access-Control-Allow-Methods"] = "POST, OPTIONS"
        response["Access-Control-Allow-Headers"] = "Content-Type"
        response["Access-Control-Max-Age"] = "86400"
        return response

    def post(self, request, token):
        if not token or len(token) > 64:
            raise Http404()
        source = LeadCaptureSource.objects.filter(
            token=token, kind=LeadCaptureSource.Kind.WEBSITE, active=True
        ).first()
        if source is None:
            raise Http404()

        data = request.data
        if any(str(data.get(h, "")).strip() for h in HONEYPOTS):
            return Response({"ok": True})  # pretend success, store nothing

        detail = str(data.get("form_name") or data.get("form") or data.get("page") or source.name)[:200]
        lead, _created = capture.ingest_lead(
            source,
            data,
            lead_source="website",
            source_detail=detail,
            raw={"submitted": capture.flatten(data)},
        )
        if lead is None:
            return Response(
                {"detail": "Please include a name, phone number or email."}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response({"ok": True})


class _ProposalBase(_PublicBase):
    throttle_classes = [ProposalThrottle]

    def get_link(self, token: str) -> ProposalLink:
        if not token or len(token) > 64:
            raise Http404()
        link = (
            ProposalLink.objects.select_related("proposal", "deal__lead", "deal__owner").filter(token=token).first()
        )
        if link is None or not link.is_usable():
            raise Http404()
        return link


class PublicProposalView(_ProposalBase):
    def get(self, request, token):
        link = self.get_link(token)
        if request.query_params.get("p") != "1":  # ?p=1 = the owner previewing; don't count it
            proposal_links.record_view(link)
        proposal = link.proposal
        return Response(
            {
                "title": proposal.title,
                "content": proposal_links.sign_media(proposal.content),
                "accepted_at": link.accepted_at,
                "accepted_name": link.accepted_name,
                "expires_at": link.expires_at,
            }
        )


class PublicProposalAcceptView(_ProposalBase):
    throttle_classes = [AcceptThrottle]

    def post(self, request, token):
        link = self.get_link(token)
        name = str(request.data.get("name", "")).strip()
        if len(name) < 2:
            return Response({"detail": "Please type your full name to accept."}, status=status.HTTP_400_BAD_REQUEST)
        newly = proposal_links.accept(link, name)
        return Response({"ok": True, "already_accepted": not newly})
