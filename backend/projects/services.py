"""Artwork reference-number generator (spec §7)."""
from datetime import date

from .models import ArtworkSequence

COMPANY = "KF"  # Kreativefolio
SERIES_YEAR = 2024  # fixed series label — the numbering never resets/rolls to the real current year


def _initials(full_name: str) -> str:
    parts = [p for p in (full_name or "").split() if p]
    return "".join(p[0] for p in parts).upper()[:3] or "XX"


def build_artwork_id(
    *,
    company_name: str,
    country_code: str,
    product_name: str,
    designer_name: str,
    on: date | None = None,
) -> str:
    """
    Format:
      KF_{CompanyName}_{Country}_{ProductName}_{Designer}_{DDMMYY}_K-{SeriesYear}{Seq:04d}
    Example:
      KF_Acme_UAE_Cacao_RH_260730_K-20244001
    The {DDMMYY} segment is the real generation date, but the sequence's
    leading "year" digits are a fixed series label (SERIES_YEAR) rather than
    the actual current year — the count starts at 4001 and steps by 1000
    (4001, 5001, 6001, …) so suffixes read 20244001, 20245001, 20246001.
    Generated atomically per country_code via select_for_update.
    """
    on = on or date.today()
    seq = ArtworkSequence.next_number(year=SERIES_YEAR, category_code=country_code)
    return (
        f"{COMPANY}_{company_name}_{country_code}_{product_name}_{_initials(designer_name)}"
        f"_{on:%d%m%y}_K-{SERIES_YEAR}{seq:04d}"
    )
