"""Allowlisted file uploads — reject executable / active content."""

from __future__ import annotations

from django.core.files.images import get_image_dimensions

IMAGE_EXTENSIONS = frozenset({"jpg", "jpeg", "png", "gif", "webp"})
VIDEO_EXTENSIONS = frozenset({"mp4", "mov", "webm", "m4v"})
DOCUMENT_EXTENSIONS = frozenset({"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt"})
CHAT_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | frozenset({"pdf"})
CLIENT_FILE_EXTENSIONS = IMAGE_EXTENSIONS | DOCUMENT_EXTENSIONS
# Content calendar attachments are briefs / refs — same office files as before lock-down.
CALENDAR_EXTENSIONS = CLIENT_FILE_EXTENSIONS

# Never store these, even if a caller forgets to pass an allowlist.
BLOCKED_EXTENSIONS = frozenset(
    {
        "html",
        "htm",
        "shtml",
        "xhtml",
        "svg",
        "svgz",
        "js",
        "mjs",
        "xml",
        "php",
        "exe",
        "sh",
        "bat",
        "cmd",
        "hta",
        "wasm",
    }
)

MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
MAX_FILE_BYTES = MAX_DOCUMENT_BYTES
MAX_CHAT_BYTES = 30 * 1024 * 1024
MAX_CALENDAR_BYTES = 15 * 1024 * 1024

HR_FILE_EXTENSIONS = CLIENT_FILE_EXTENSIONS
CALENDAR_FILE_EXTENSIONS = CALENDAR_EXTENSIONS


class UploadRejected(ValueError):
    """Safe to return as API `detail`."""


def filename_extension(name: str) -> str:
    original = (name or "file").replace("\\", "/").split("/")[-1]
    if "." not in original:
        return ""
    return original.rsplit(".", 1)[-1].lower()[:8]


def check_upload(upload, *, allowed: frozenset[str], max_bytes: int) -> str:
    """Validate size + extension. Returns the sanitized extension."""
    if upload is None:
        raise UploadRejected("file is required.")
    size = getattr(upload, "size", None) or 0
    if size <= 0:
        raise UploadRejected("File is empty.")
    if size > max_bytes:
        mb = max(1, max_bytes // (1024 * 1024))
        raise UploadRejected(f"File is too large ({mb}MB limit).")

    ext = filename_extension(getattr(upload, "name", "") or "")
    if not ext:
        raise UploadRejected("File must have an extension.")
    if ext in BLOCKED_EXTENSIONS or ext not in allowed:
        raise UploadRejected("Unsupported file type.")

    content_type = (getattr(upload, "content_type", "") or "").lower()
    if content_type.startswith("text/html") or content_type in {"image/svg+xml", "application/javascript"}:
        raise UploadRejected("Unsupported file type.")

    if ext in IMAGE_EXTENSIONS:
        _require_image(upload)
    elif ext == "pdf":
        _require_pdf_magic(upload)

    return ext


def _require_image(upload) -> None:
    try:
        get_image_dimensions(upload)
    except Exception as exc:
        raise UploadRejected("File must be a valid image.") from exc
    if hasattr(upload, "seek"):
        upload.seek(0)


def _require_pdf_magic(upload) -> None:
    pos = upload.tell() if hasattr(upload, "tell") else 0
    try:
        head = upload.read(5)
    finally:
        if hasattr(upload, "seek"):
            upload.seek(pos)
    if head != b"%PDF-":
        raise UploadRejected("File must be a valid PDF.")


def validated_extension(upload, *, allowed, max_bytes: int) -> str:
    """DRF-friendly wrapper: raises ValidationError on a bad file."""
    from rest_framework.exceptions import ValidationError

    try:
        return check_upload(upload, allowed=frozenset(allowed), max_bytes=max_bytes)
    except UploadRejected as exc:
        raise ValidationError(str(exc)) from exc
