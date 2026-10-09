"""Token-based, read-only client calendar (no login). Only the shared client's
data is ever reachable, and only the fields below are ever returned."""

from __future__ import annotations

import mimetypes

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import FileResponse, Http404, HttpResponse
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from common.media_urls import (
    content_disposition_header,
    download_name_for_key,
    media_key_from_url,
)
from common.uploads import BLOCKED_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS

from .models import ClientCalendarShare, ContentCalendarComment, ContentCalendarItem

INLINE_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | frozenset({"pdf"})


class PublicShareThrottle(AnonRateThrottle):
    scope = "public_share"


class PublicCommentThrottle(AnonRateThrottle):
    scope = "public_comment"


class _PublicBase(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [PublicShareThrottle]

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        # Private, token-gated data: never cache or index, never leak via Referer.
        response["Cache-Control"] = "private, no-store"
        response["X-Robots-Tag"] = "noindex, nofollow"
        response["Referrer-Policy"] = "no-referrer"
        return response

    def get_share(self, token: str) -> ClientCalendarShare:
        if not token or len(token) > 64:
            raise Http404()
        share = ClientCalendarShare.objects.select_related("client").filter(token=token).first()
        if share is None or not share.is_usable():
            raise Http404()
        return share

    def get_item(self, share: ClientCalendarShare, item_id) -> ContentCalendarItem:
        item = ContentCalendarItem.objects.filter(pk=item_id, client=share.client).first()
        if item is None:
            raise Http404()
        return item


def _comment_payload(c: ContentCalendarComment) -> dict:
    return {
        "id": c.id,
        "from_client": c.from_client,
        "author_name": c.author_name or ("Client" if c.from_client else "Team"),
        "body": c.body,
        "created_at": c.created_at,
    }


class PublicCalendarView(_PublicBase):
    def get(self, request, token):
        share = self.get_share(token)
        client = share.client
        items = (
            ContentCalendarItem.objects.filter(client=client)
            .prefetch_related("comments")
            .order_by("scheduled_date", "id")
        )
        out = []
        for it in items:
            files = []
            for idx, url in enumerate(it.client_post_files or []):
                key = media_key_from_url(url)
                name = download_name_for_key(key, "") if key else "file"
                ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
                kind = "image" if ext in IMAGE_EXTENSIONS else "video" if ext in VIDEO_EXTENSIONS else "file"
                files.append({"index": idx, "name": name, "kind": kind})
            out.append(
                {
                    "id": it.id,
                    "title": it.title,
                    "content_type": it.content_type,
                    "description": it.description,
                    "scheduled_date": it.scheduled_date,
                    "post_files": files,
                    "post_caption": it.client_post_caption if files else "",
                    "comment_count": len(it.comments.all()),
                }
            )
        return Response(
            {
                "client": {"name": client.name, "accent_color": client.accent_color or ""},
                "expires_at": share.expires_at,
                "items": out,
            }
        )


class PublicCalendarFileView(_PublicBase):
    def get(self, request, token, item_id, index):
        share = self.get_share(token)
        item = self.get_item(share, item_id)
        files = list(item.client_post_files or [])
        if index < 0 or index >= len(files):
            raise Http404()
        key = media_key_from_url(files[index])
        # Only files uploaded through the client-post flow are ever served here.
        if not key or not key.startswith(f"client-share/{share.client_id}/"):
            raise Http404()
        ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
        if ext in BLOCKED_EXTENSIONS or not default_storage.exists(key):
            raise Http404()

        content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
        filename = download_name_for_key(key, "")
        disposition = "attachment" if request.query_params.get("download") else (
            "inline" if ext in INLINE_EXTENSIONS else "attachment"
        )
        if getattr(settings, "USE_X_ACCEL_REDIRECT", False) and not getattr(settings, "S3_ENABLED", False):
            response = HttpResponse(content_type=content_type)
            response["X-Accel-Redirect"] = f"/internal-media/{key}"
        else:
            response = FileResponse(default_storage.open(key, "rb"), content_type=content_type)
        response["Content-Disposition"] = content_disposition_header(disposition, filename)
        response["X-Content-Type-Options"] = "nosniff"
        return response


class PublicCalendarCommentsView(_PublicBase):
    def get_throttles(self):
        if self.request.method == "POST":
            return [PublicCommentThrottle()]
        return super().get_throttles()

    def get(self, request, token, item_id):
        item = self.get_item(self.get_share(token), item_id)
        return Response([_comment_payload(c) for c in item.comments.all()])

    def post(self, request, token, item_id):
        item = self.get_item(self.get_share(token), item_id)
        body = str(request.data.get("body") or "").strip()
        name = str(request.data.get("name") or "").strip()[:120]
        if not body:
            return Response({"detail": "Comment cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)
        if item.comments.count() >= 200:
            return Response({"detail": "Comment limit reached."}, status=status.HTTP_400_BAD_REQUEST)
        ContentCalendarComment.objects.create(
            item=item, from_client=True, author_name=name or "Client", body=body[:2000]
        )
        self._notify_team(item, name or "Client", body)
        return Response([_comment_payload(c) for c in item.comments.all()], status=status.HTTP_201_CREATED)

    @staticmethod
    def _notify_team(item, who: str, body: str) -> None:
        """Best-effort ping to the item's assignees; never blocks the comment."""
        try:
            from notifications.services import notify_user

            for user in item.assignees.all():
                notify_user(
                    user=user,
                    source="project",
                    title=f"{who} commented on \"{item.title}\"",
                    body=f"{item.client.name}: {body[:200]}",
                    object_ref=f"calendar_comment:{item.id}:{user.id}",
                )
        except Exception:
            pass
