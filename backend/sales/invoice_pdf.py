"""Invoice builder -> branded PDF (WeasyPrint), same look as estimates."""

import base64
import uuid

from django.template.loader import render_to_string
from django.utils import timezone

from .invoice_content import line_amount, merged_content, subtotal
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


def _fmt_money(value) -> str:
    try:
        return f"{float(value):.2f}"
    except (TypeError, ValueError):
        return "0.00"


def build_context(invoice) -> dict:
    from .invoice_content import doc_label

    content = merged_content(invoice.content)
    kind = content.get("invoice_kind") or "standard"
    currency = content.get("currency") or "AED"
    items = []
    for i, item in enumerate(content.get("items") or [], start=1):
        raw_details = str(item.get("details") or "")
        details_lines = []
        for ln in raw_details.splitlines():
            cleaned = ln.strip().lstrip("•").lstrip("-").strip()
            if cleaned:
                details_lines.append(cleaned)
        amt = line_amount(item)
        items.append(
            {
                **item,
                "index": i,
                "qty_display": _fmt_money(item.get("qty", 1)),
                "rate_display": f"{currency} {_fmt_money(item.get('rate', 0))}",
                "amount_display": f"{currency} {_fmt_money(amt)}",
                "details_lines": details_lines,
            }
        )
    total = subtotal(content.get("items") or [])
    payment = content.get("payment") or {}
    return {
        "doc_label": doc_label(kind),
        "invoice_kind": kind,
        "is_petty_cash": kind == "petty_cash",
        "invoice_number": content.get("invoice_number") or invoice.invoice_number or "",
        "bill_to": content.get("bill_to") or "",
        "bill_to_email": content.get("bill_to_email") or "",
        "date_display": _format_date(content.get("date")) or timezone.now().strftime("%d %b %Y"),
        "due_display": _format_date(content.get("due_date")) or "—",
        "currency": currency,
        "items": items,
        "subtotal_display": f"{currency} {_fmt_money(total)}",
        "total_display": f"{currency} {_fmt_money(total)}",
        "payment": payment,
        "received_by": content.get("received_by") or "",
        "passed_by": content.get("passed_by") or "",
        "notes": content.get("notes") or "",
        "logo_data_uri": _data_uri("logo.png"),
    }


def render_invoice_pdf(invoice, request) -> str:
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage
    from weasyprint import HTML

    from common.duplicate import slug_filename

    content = merged_content(invoice.content)
    html = render_to_string("sales/invoice_pdf.html", build_context(invoice))
    pdf_bytes = HTML(string=html).write_pdf()

    raw_name = (content.get("title") or "").strip() or invoice.invoice_number or f"invoice-{invoice.pk}"
    slug = slug_filename(raw_name, fallback=f"invoice-{invoice.pk}")
    key = f"invoice-exports/{invoice.pk}/{slug}.pdf"
    folder = f"invoice-exports/{invoice.pk}/"
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


def ensure_invoice_number(invoice_number: str) -> str:
    number = (invoice_number or "").strip()
    if number:
        return number
    return f"DRAFT-{uuid.uuid4().hex[:10].upper()}"
