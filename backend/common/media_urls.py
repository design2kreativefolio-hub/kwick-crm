"""Helpers for absolute media URLs (avatars, chat attachments, logos).

Local /media/ files require a logged-in session (media cookie or JWT).
API responses may still attach a short HMAC for cache-busting query params;
that signature alone is not enough to read the file.
"""

from __future__ import annotations

import hashlib
import hmac
import mimetypes
import re
import time
from urllib.parse import parse_qs, quote, unquote, urlencode, urlparse, urlunparse

from django.conf import settings
from django.core.files.storage import default_storage

_SIG_KEYS = {"exp", "sig"}
_DOWNLOAD_NAME_KEY = "name"
_HEX_PREFIX = re.compile(r"^[0-9a-f]{8}_", re.I)


def absolute_media_url(request, storage_url: str) -> str:
    """Turn a storage URL into a browser-reachable absolute URL.

    Prefer PUBLIC_API_URL / NEXT_PUBLIC_API_BASE_URL when set (correct on VPS
    even if the ASGI worker sees an internal host). Otherwise fall back to
    request.build_absolute_uri (works when nginx forwards Host + Proto).
    """
    if not storage_url:
        return ""
    if storage_url.startswith("http://") or storage_url.startswith("https://"):
        return storage_url
    path = storage_url if storage_url.startswith("/") else f"/{storage_url}"
    public = (getattr(settings, "PUBLIC_API_URL", "") or "").rstrip("/")
    if public:
        return f"{public}{path}"
    if request is not None:
        return request.build_absolute_uri(path)
    return path


unsigned_absolute_media_url = absolute_media_url


def persist_storage_url(request, saved_path: str, filename: str = "") -> str:
    """Unsigned URL to store on models (signatures are added on the way out)."""
    url = absolute_media_url(request, default_storage.url(saved_path))
    if filename:
        url = attach_download_name(url, filename)
    return url


storage_file_url = persist_storage_url


def deliver_storage_url(request, saved_path: str, filename: str = "") -> str:
    return sign_media_url(persist_storage_url(request, saved_path, filename=filename))


def original_upload_name(upload) -> str:
    return (getattr(upload, "name", None) or "file").replace("\\", "/").split("/")[-1]


def sanitize_download_name(name: str, *, fallback: str = "file") -> str:
    raw = (name or "").replace("\\", "/").split("/")[-1].strip()
    raw = re.sub(r"[\r\n\x00\"\\]+", "", raw)
    if not raw or raw in {".", ".."}:
        return fallback
    return raw[:180]


def filename_from_storage_key(key: str) -> str:
    """Human name from a stored path: drop the 8-char uniqueness prefix."""
    base = (key or "").replace("\\", "/").split("/")[-1]
    stripped = _HEX_PREFIX.sub("", base, count=1)
    return sanitize_download_name(stripped or base, fallback=base or "file")


def attach_download_name(url: str, filename: str) -> str:
    filename = sanitize_download_name(filename)
    if not url or not filename:
        return url or ""
    parsed = urlparse(url)
    qs = {k: v[-1] for k, v in parse_qs(parsed.query, keep_blank_values=True).items()}
    qs[_DOWNLOAD_NAME_KEY] = filename
    return urlunparse(
        (parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(qs), parsed.fragment)
    )


def download_name_for_key(key: str, requested: str = "") -> str:
    stored_ext = key.rsplit(".", 1)[-1].lower() if "." in (key or "") else ""
    base = sanitize_download_name(requested) if requested else ""
    if not base:
        base = filename_from_storage_key(key)
    if stored_ext:
        if "." in base:
            given_ext = base.rsplit(".", 1)[-1].lower()
            if given_ext != stored_ext:
                base = f"{base.rsplit('.', 1)[0]}.{stored_ext}"
        else:
            base = f"{base}.{stored_ext}"
    return base


def content_disposition_header(disposition: str, filename: str) -> str:
    filename = sanitize_download_name(filename)
    ascii_name = (
        filename.encode("ascii", "ignore").decode("ascii").replace('"', "").replace("\\", "").strip()
        or "file"
    )
    encoded = quote(filename, safe="")
    return f'{disposition}; filename="{ascii_name}"; filename*=UTF-8\'\'{encoded}'


def normalize_media_key(key: str) -> str:
    """Reject path traversal. Empty string means invalid."""
    cleaned = unquote(key or "").replace("\\", "/").lstrip("/")
    parts = [p for p in cleaned.split("/") if p and p != "."]
    if not parts or ".." in parts:
        return ""
    return "/".join(parts)


def media_key_from_url(url: str) -> str:
    """Extract a local storage key from a /media/… URL. Empty if not ours."""
    if not url:
        return ""
    parsed = urlparse(url)
    path = unquote(parsed.path or "")
    marker = "/media/"
    if marker not in path:
        if path.startswith("media/"):
            return normalize_media_key(path[len("media/") :])
        return ""
    return normalize_media_key(path.split(marker, 1)[-1])


def read_media_bytes(url: str) -> tuple[bytes, str] | None:
    """Read a stored object without an HTTP round trip (PDF/DOCX inlining)."""
    key = media_key_from_url(url)
    if not key or not default_storage.exists(key):
        return None
    with default_storage.open(key, "rb") as handle:
        data = handle.read()
    mime = mimetypes.guess_type(key)[0] or "application/octet-stream"
    return data, mime


def read_local_media_bytes(url: str) -> bytes | None:
    got = read_media_bytes(url)
    return None if got is None else got[0]


def _max_age() -> int:
    return int(getattr(settings, "MEDIA_AUTH_MAX_AGE", 12 * 60 * 60))


def _signature(key: str, expires: int) -> str:
    secret = (settings.SECRET_KEY or "").encode("utf-8")
    digest = hmac.new(secret, f"{key}:{expires}".encode("utf-8"), hashlib.sha256).hexdigest()
    return digest[:32]


def sign_media_url(url: str) -> str:
    """Attach exp+sig so a browser can fetch /media/ without an Authorization header."""
    if not url or not isinstance(url, str):
        return url or ""
    if url.startswith("http://") or url.startswith("https://"):
        if "/media/" not in urlparse(url).path:
            return url
    key = media_key_from_url(url)
    if not key:
        return url
    parsed = urlparse(url)
    qs = {k: v[-1] for k, v in parse_qs(parsed.query, keep_blank_values=True).items() if k not in _SIG_KEYS}
    expires = int(time.time()) + _max_age()
    qs["exp"] = str(expires)
    qs["sig"] = _signature(key, expires)
    query = urlencode(qs)
    rebuilt = urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, query, parsed.fragment))
    if rebuilt.startswith("http://") or rebuilt.startswith("https://"):
        return rebuilt
    return absolute_media_url(None, rebuilt if rebuilt.startswith("/") else f"/{rebuilt}")


def verify_media_signature(key: str, expires: str, sig: str) -> bool:
    try:
        exp = int(expires)
    except (TypeError, ValueError):
        return False
    if exp < int(time.time()):
        return False
    expected = _signature(key, exp)
    return hmac.compare_digest(expected, sig or "")


def scrub_media_url(url: str) -> str:
    """Strip signature query params before persisting a URL the client sent back."""
    if not url or not isinstance(url, str):
        return url
    if not media_key_from_url(url) and "/media/" not in url:
        return url
    parsed = urlparse(url)
    qs = {k: v[-1] for k, v in parse_qs(parsed.query, keep_blank_values=True).items() if k not in _SIG_KEYS}
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, parsed.params, urlencode(qs), parsed.fragment))


def sign_media_tree(value):
    if isinstance(value, str):
        if "/media/" in value or value.startswith("media/"):
            return sign_media_url(value)
        return value
    if isinstance(value, list):
        return [sign_media_tree(item) for item in value]
    if isinstance(value, dict):
        return {k: sign_media_tree(v) for k, v in value.items()}
    return value


def scrub_media_tree(value):
    if isinstance(value, str):
        if "/media/" in value or value.startswith("media/"):
            return scrub_media_url(value)
        return value
    if isinstance(value, list):
        return [scrub_media_tree(item) for item in value]
    if isinstance(value, dict):
        return {k: scrub_media_tree(v) for k, v in value.items()}
    return value


def user_avatar_url(user) -> str:
    profile = getattr(user, "profile", None)
    if profile is None:
        return ""
    raw = (getattr(profile, "avatar_url", None) or "").strip()
    return sign_media_url(raw) if raw else ""
