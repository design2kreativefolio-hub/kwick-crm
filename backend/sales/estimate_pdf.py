"""Estimate / QUOTE builder -> branded PDF (WeasyPrint)."""

import base64

from django.template.loader import render_to_string
from django.utils import timezone

from .estimate_content import line_amount, merged_content, subtotal
from .proposal_pdf import ASSETS_DIR


def _data_uri(filename: str) -> str:
    mime = "image/jpeg" if filename.lower().endswith((".jpg", ".jpeg")) else "image/png"
    data = (ASSETS_DIR / filename).read_bytes()
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def _format_date(value) -> str:
    if not value:
        return ""
    try:
        from datetime import date, datetime

        if isinstance(value, (date, datetime)):
            return value.strftime("%d %b %Y")
        return datetime.fromisoformat(str(value)).strftime("%d %b %Y")
    except ValueError:
        return str(value)


def build_context(estimate) -> dict:
    content = merged_content(estimate.content)
    items = []
    for i, item in enumerate(content.get("items") or [], start=1):
        raw_details = str(item.get("details") or "")
        details_lines = []
        for ln in raw_details.splitlines():
            cleaned = ln.strip().lstrip("•").lstrip("-").strip()
            if cleaned:
                details_lines.append(cleaned)
        items.append(
            {
                **item,
                "index": i,
                "amount": line_amount(item),
                "qty_display": _fmt_money(item.get("qty", 1)),
                "rate_display": _fmt_money(item.get("rate", 0)),
                "amount_display": _fmt_money(line_amount(item)),
                "details_lines": details_lines,
            }
        )
    total = subtotal(content.get("items") or [])
    currency = content.get("currency") or "AED"
    terms_lines = []
    for ln in str(content.get("terms") or "").splitlines():
        cleaned = ln.strip()
        if not cleaned:
            continue
        # Strip leading "1. " / "2. " so the <ol> can renumber cleanly.
        if len(cleaned) > 2 and cleaned[0].isdigit() and cleaned[1] in ".)":
            cleaned = cleaned[2:].strip()
        elif len(cleaned) > 3 and cleaned[0].isdigit() and cleaned[1].isdigit() and cleaned[2] in ".)":
            cleaned = cleaned[3:].strip()
        terms_lines.append(cleaned)
    return {
        "quote_number": content.get("quote_number") or "",
        "bill_to": content.get("bill_to") or "",
        "date_display": _format_date(content.get("date")) or timezone.now().strftime("%d %b %Y"),
        "expiry_display": _format_date(content.get("expiry_date")),
        "currency": currency,
        "items": items,
        "subtotal_display": _fmt_money(total),
        "total_display": f"{currency}{_fmt_money(total)}",
        "notes": content.get("notes") or "",
        "terms_lines": terms_lines,
        "logo_data_uri": _data_uri("logo.png"),
    }


def _fmt_money(value) -> str:
    try:
        return f"{float(value):.2f}"
    except (TypeError, ValueError):
        return "0.00"


def render_estimate_pdf(estimate, request) -> str:
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage
    from weasyprint import HTML

    from common.duplicate import slug_filename

    content = merged_content(estimate.content)
    html = render_to_string("sales/estimate_pdf.html", build_context(estimate))
    pdf_bytes = HTML(string=html).write_pdf()

    raw_name = (
        (estimate.title or "").strip()
        or (content.get("quote_number") or "").strip()
        or f"estimate-{estimate.pk}"
    )
    slug = slug_filename(raw_name, fallback=f"estimate-{estimate.pk}")
    key = f"estimate-exports/{estimate.pk}/{slug}.pdf"
    folder = f"estimate-exports/{estimate.pk}/"
    try:
        _dirs, files = default_storage.listdir(folder)
        for name in files:
            default_storage.delete(f"{folder}{name}")
    except Exception:
        pass
    if default_storage.exists(key):
        default_storage.delete(key)
    saved_path = default_storage.save(key, ContentFile(pdf_bytes))
    from common.media_urls import deliver_storage_url

    return deliver_storage_url(request, saved_path)
