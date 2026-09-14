"""Canonical shape of Invoice.content — mirrored in frontend/src/lib/invoiceContent.ts."""

from decimal import Decimal, InvalidOperation


DEFAULT_NOTES = "Thanks for your business."
DEFAULT_ITEMS_HEADING = "Item & Description"
DEFAULT_NOTES_HEADING = "Notes"
DEFAULT_PAYMENT_HEADING = "Payment Details"

# Legacy structured bank block — only used to migrate old invoices into the
# free-form `payment_details` rich text.
_LEGACY_PAYMENT_FIELDS = [
    ("Payment Method", "payment_method"),
    ("Bank Name", "bank_name"),
    ("Account Name", "account_name"),
    ("IBAN / Account Number", "iban"),
    ("Paid Amount", "paid_amount"),
]


def _legacy_payment_html(payment) -> str:
    if not isinstance(payment, dict):
        return ""
    rows = [(label, str(payment.get(key) or "").strip()) for label, key in _LEGACY_PAYMENT_FIELDS]
    rows = [(label, val) for label, val in rows if val]
    if not any(label != "Payment Method" for label, _ in rows):
        return ""

    def esc(s):
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    items = "".join(f"<li><strong>{esc(label)}:</strong> {esc(val)}</li>" for label, val in rows)
    return f"<ul>{items}</ul>"

INVOICE_KINDS = ("standard", "proforma", "petty_cash")

KIND_TITLES = {
    "standard": "Invoice",
    "proforma": "Proforma Invoice",
    "petty_cash": "Petty Cash Invoice",
}

KIND_DOC_LABELS = {
    "standard": "INVOICE",
    "proforma": "PROFORMA INVOICE",
    "petty_cash": "PETTY CASH INVOICE",
}


def default_line_item() -> dict:
    return {
        "description": "",
        "details": "",
        "show_details": True,
        "qty": 1,
        "rate": 0,
    }


def default_content(kind: str = "standard") -> dict:
    if kind not in INVOICE_KINDS:
        kind = "standard"
    return {
        "title": KIND_TITLES[kind],
        "invoice_kind": kind,
        "invoice_number": "",
        "doc_heading": "",
        "items_heading": DEFAULT_ITEMS_HEADING,
        "notes_heading": DEFAULT_NOTES_HEADING,
        "bill_to": "",
        "bill_to_email": "",
        "client_id": None,
        "date": None,
        "due_date": None,
        "currency": "AED",
        "items": [default_line_item()],
        "payment_heading": DEFAULT_PAYMENT_HEADING,
        "payment_details": "",
        "received_by": "",
        "passed_by": "",
        "notes": DEFAULT_NOTES,
    }


def _num(value, fallback=0):
    try:
        return float(Decimal(str(value)))
    except (InvalidOperation, TypeError, ValueError):
        return float(fallback)


def line_amount(item: dict) -> float:
    return round(_num(item.get("qty"), 1) * _num(item.get("rate"), 0), 2)


def subtotal(items: list) -> float:
    return round(sum(line_amount(i) for i in items or []), 2)


def merged_content(raw: dict | None) -> dict:
    raw = raw or {}
    kind = raw.get("invoice_kind") or "standard"
    if kind not in INVOICE_KINDS:
        kind = "standard"
    base = default_content(kind)
    for key, default_value in base.items():
        value = raw.get(key)
        if value is None:
            continue
        if key == "items" and isinstance(value, list):
            base["items"] = [{**default_line_item(), **item} for item in value] or [default_line_item()]
        elif key == "invoice_kind":
            continue
        else:
            base[key] = value
    base["invoice_kind"] = kind
    # One-time migration: fold an old structured bank block into payment_details.
    if not (base.get("payment_details") or "").strip():
        legacy = _legacy_payment_html(raw.get("payment"))
        if legacy:
            base["payment_details"] = legacy
    return base


def doc_label(kind: str | None) -> str:
    return KIND_DOC_LABELS.get(kind or "standard", "INVOICE")
