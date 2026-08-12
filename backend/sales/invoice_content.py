"""Canonical shape of Invoice.content — mirrored in frontend/src/lib/invoiceContent.ts."""

from decimal import Decimal, InvalidOperation


DEFAULT_NOTES = "Thanks for your business."

DEFAULT_PAYMENT = {
    "payment_method": "Bank Transfer",
    "bank_name": "",
    "account_name": "",
    "iban": "",
    "paid_amount": "",
}

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
        "bill_to": "",
        "bill_to_email": "",
        "client_id": None,
        "date": None,
        "due_date": None,
        "currency": "AED",
        "items": [default_line_item()],
        "payment": dict(DEFAULT_PAYMENT),
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
        elif key == "payment" and isinstance(value, dict):
            base["payment"] = {**DEFAULT_PAYMENT, **value}
        elif key == "invoice_kind":
            continue
        else:
            base[key] = value
    base["invoice_kind"] = kind
    return base


def doc_label(kind: str | None) -> str:
    return KIND_DOC_LABELS.get(kind or "standard", "INVOICE")
