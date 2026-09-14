"""Authenticated local media. nginx must proxy /media/ here, not alias the volume."""

from __future__ import annotations

import mimetypes

from django.conf import settings
from django.core.files.storage import default_storage
from django.http import FileResponse, HttpResponse, HttpResponseForbidden, HttpResponseNotFound
from django.views import View

from .media_acl import user_can_read_media
from .media_auth import media_user
from .media_urls import content_disposition_header, download_name_for_key, normalize_media_key
from .uploads import BLOCKED_EXTENSIONS, IMAGE_EXTENSIONS, VIDEO_EXTENSIONS

INLINE_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | frozenset({"pdf"})


class ProtectedMediaView(View):
    def get(self, request, key):
        return self._serve(request, key)

    def head(self, request, key):
        return self._serve(request, key)

    def _serve(self, request, key):
        key = normalize_media_key(key)
        if not key:
            return HttpResponseNotFound()

        user = media_user(request)
        if user is None:
            return HttpResponse("Authentication required.", status=401)
        if not user_can_read_media(user, key):
            return HttpResponseForbidden("You don't have access to this file.")

        ext = key.rsplit(".", 1)[-1].lower() if "." in key else ""
        if ext in BLOCKED_EXTENSIONS:
            return HttpResponseForbidden("Unsupported file type.")

        if not default_storage.exists(key):
            return HttpResponseNotFound()

        guessed, _encoding = mimetypes.guess_type(key)
        if ext in BLOCKED_EXTENSIONS or guessed in {"text/html", "image/svg+xml", "application/javascript"}:
            content_type = "application/octet-stream"
        else:
            content_type = guessed or "application/octet-stream"

        filename = download_name_for_key(key, request.GET.get("name") or "")
        disposition_type = "inline" if ext in INLINE_EXTENSIONS else "attachment"
        disposition = content_disposition_header(disposition_type, filename)

        if getattr(settings, "USE_X_ACCEL_REDIRECT", False) and not getattr(settings, "S3_ENABLED", False):
            response = HttpResponse(content_type=content_type)
            response["X-Accel-Redirect"] = f"/internal-media/{key}"
        else:
            handle = default_storage.open(key, "rb")
            response = FileResponse(handle, content_type=content_type)
        response["Content-Disposition"] = disposition
        response["X-Content-Type-Options"] = "nosniff"
        response["X-Frame-Options"] = "DENY"
        response["Cache-Control"] = "private, no-store"
        return response
