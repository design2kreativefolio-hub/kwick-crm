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


def default_line_item() -> dict:
    return {
        "description": "",
        "details": "",
        "qty": 1,
        "rate": 0,
    }


def default_content() -> dict:
    return {
        "title": "Invoice",
        "invoice_number": "",
        "bill_to": "",
        "bill_to_email": "",
        "client_id": None,
        "date": None,
        "due_date": None,
        "currency": "AED",
        "items": [default_line_item()],
        "payment": dict(DEFAULT_PAYMENT),
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
    base = default_content()
    raw = raw or {}
    for key, default_value in base.items():
        value = raw.get(key)
        if value is None:
            continue
        if key == "items" and isinstance(value, list):
            base["items"] = [{**default_line_item(), **item} for item in value] or [default_line_item()]
        elif key == "payment" and isinstance(value, dict):
            base["payment"] = {**DEFAULT_PAYMENT, **value}
        else:
            base[key] = value
    return base
