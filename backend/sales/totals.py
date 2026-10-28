"""Discount + VAT maths shared by estimates and invoices (mirrors frontend/src/lib/docTotals.ts).

Order: discount comes off the subtotal, VAT is then charged on the discounted amount.
"""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

DISCOUNT_TYPES = ("none", "percent", "amount")
DEFAULT_VAT_PERCENT = 5

TOTALS_DEFAULTS = {
    "vat_enabled": False,
    "vat_percent": DEFAULT_VAT_PERCENT,
    "discount_type": "none",
    "discount_value": 0,
}


def _dec(value, fallback="0") -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(fallback)


def _money(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def compute_totals(sub: float, content: dict) -> dict:
    sub_d = _dec(sub)
    dtype = content.get("discount_type")
    dvalue = max(_dec(content.get("discount_value")), Decimal("0"))
    if dtype == "percent":
        discount = sub_d * min(dvalue, Decimal("100")) / Decimal("100")
    elif dtype == "amount":
        discount = min(dvalue, sub_d)
    else:
        discount = Decimal("0")
    discount = Decimal(str(_money(discount)))
    taxable = sub_d - discount
    vat_enabled = bool(content.get("vat_enabled"))
    vat_percent = max(_dec(content.get("vat_percent"), str(DEFAULT_VAT_PERCENT)), Decimal("0"))
    vat = Decimal(str(_money(taxable * vat_percent / Decimal("100")))) if vat_enabled else Decimal("0")
    return {
        "subtotal": _money(sub_d),
        "discount": _money(discount),
        "taxable": _money(taxable),
        "vat_enabled": vat_enabled,
        "vat_percent": float(vat_percent),
        "vat": _money(vat),
        "total": _money(taxable + vat),
    }
