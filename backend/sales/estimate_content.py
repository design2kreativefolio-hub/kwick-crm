"""Canonical shape of Estimate.content — mirrored in frontend/src/lib/estimateContent.ts."""

from decimal import Decimal, InvalidOperation


DEFAULT_NOTES = "Looking forward for your business."

DEFAULT_TERMS = (
    "1. 100% Advance Payment\n"
    "2. Delivery of the website within 15 working days after receiving the advance "
    "payment & all the content and materials from the client.\n"
    "3. Prices may vary if the services are changed\n"
    "4. This proposal is valid for 7 days from the date of issue.\n"
    "5. No refunds once the project has been started\n"
    "6. 2 Rounds of Corrections are Free of Charge. Extra Corrections will be charged accordingly."
)


def default_line_item() -> dict:
    return {
        "description": "",
        "details": "",
        "qty": 1,
        "rate": 0,
    }


def default_content() -> dict:
    return {
        "quote_number": "",
        "bill_to": "",
        "client_id": None,
        "date": None,
        "expiry_date": None,
        "currency": "AED",
        "items": [default_line_item()],
        "notes": DEFAULT_NOTES,
        "terms": DEFAULT_TERMS,
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
        else:
            base[key] = value
    return base
