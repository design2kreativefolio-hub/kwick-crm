"""Artwork reference-number generator (spec §7)."""
from datetime import date

from .models import ArtworkSequence

COMPANY = "KF"  # Kreativefolio


def _initials(full_name: str) -> str:
    parts = [p for p in (full_name or "").split() if p]
    return "".join(p[0] for p in parts).upper()[:3] or "XX"


def build_artwork_id(
    *,
    country_code: str,
    product_name: str,
    designer_name: str,
    on: date | None = None,
) -> str:
    """
    Format:
      {Company}_{Country}_{ProductName}_{Designer}_{DDMMYY}_K-{YYYY}{Seq:04d}
    Example:
      KF_UAE_Cacao_RH_260730_K-20260001
    The sequence resets each calendar year, scoped per country_code, and is
    generated atomically (select_for_update).
    """
    on = on or date.today()
    seq = ArtworkSequence.next_number(year=on.year, category_code=country_code)
    return (
        f"{COMPANY}_{country_code}_{product_name}_{_initials(designer_name)}"
        f"_{on:%d%m%y}_K-{on.year}{seq:04d}"
    )
