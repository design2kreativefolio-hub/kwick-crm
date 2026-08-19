"""HR letter builder → branded PDF (WeasyPrint) with K watermark."""

from __future__ import annotations

import base64
from pathlib import Path

from django.template.loader import render_to_string
from django.utils import timezone

from .letter_content import COMPANY_NAME, COMPANY_SHORT, DOC_TYPE_LABELS, merged_content

ASSETS_DIR = Path(__file__).resolve().parent / "assets"


def _data_uri(filename: str) -> str:
    path = ASSETS_DIR / filename
    mime = "image/jpeg" if filename.lower().endswith((".jpg", ".jpeg")) else "image/png"
    data = path.read_bytes()
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def _format_date(value) -> str:
    if not value:
        return "—"
    try:
        from datetime import date, datetime

        if isinstance(value, (date, datetime)):
            return value.strftime("%d %b %Y")
        return datetime.fromisoformat(str(value)).strftime("%d %b %Y")
    except ValueError:
        return str(value)


def _money(value) -> str:
    if value is None or value == "":
        return "—"
    try:
        return f"{float(value):,.2f}"
    except (TypeError, ValueError):
        return str(value)


def _num(value) -> float:
    try:
        return float(str(value).replace(",", "") or 0)
    except (TypeError, ValueError):
        return 0.0


def build_context(letter) -> dict:
    content = merged_content(letter.doc_type, letter.content)
    earnings_total = (
        _num(content.get("basic"))
        + _num(content.get("housing_allowance"))
        + _num(content.get("leave_salary"))
        + _num(content.get("other_earnings"))
    )
    deductions_total = _num(content.get("absent_deductions")) + _num(content.get("other_deductions"))
    net_pay = earnings_total - deductions_total

    return {
        "doc_type": letter.doc_type,
        "doc_label": DOC_TYPE_LABELS.get(letter.doc_type, letter.doc_type),
        "company_name": COMPANY_NAME,
        "company_short": COMPANY_SHORT,
        "c": content,
        "date_display": _format_date(content.get("date")),
        "start_date_display": _format_date(content.get("start_date")),
        "end_date_display": _format_date(content.get("end_date")),
        "last_working_day_display": _format_date(content.get("last_working_day")),
        "resignation_date_display": _format_date(content.get("resignation_date")),
        "last_working_date_display": _format_date(content.get("last_working_date")),
        "effective_date_display": _format_date(content.get("effective_date")),
        "date_of_joining_display": _format_date(content.get("date_of_joining")),
        "reporting_date_display": _format_date(content.get("reporting_date")),
        "valid_until_display": _format_date(content.get("valid_until")),
        "earnings_total": _money(earnings_total),
        "deductions_total": _money(deductions_total),
        "net_pay": _money(net_pay),
        "logo_data_uri": _data_uri("logo.png"),
        "footer_data_uri": _data_uri("footer.png"),
        "watermark_data_uri": _data_uri("kwick-k-icon.png"),
        "generated_at": timezone.now().strftime("%d %b %Y"),
    }


def render_letter_pdf(letter, request) -> str:
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage
    from weasyprint import HTML

    import re

    html = render_to_string("hr/letter_pdf.html", build_context(letter))
    pdf_bytes = HTML(string=html).write_pdf()

    raw_name = (letter.title or "").strip() or DOC_TYPE_LABELS.get(letter.doc_type, "letter")
    slug = re.sub(r"[^\w\-]+", "_", raw_name, flags=re.UNICODE).strip("_")[:80] or "letter"
    key = f"hr-letters/{letter.pk}/{slug}.pdf"
    # Drop prior exports for this letter (any filename).
    folder = f"hr-letters/{letter.pk}/"
    try:
        dirs, files = default_storage.listdir(folder)
        for name in files:
            default_storage.delete(f"{folder}{name}")
    except Exception:
        pass
    if default_storage.exists(key):
        default_storage.delete(key)
    saved_path = default_storage.save(key, ContentFile(pdf_bytes))
    from common.media_urls import deliver_storage_url

    return deliver_storage_url(request, saved_path)
