"""Artwork reference-number generator (spec §7)."""
from datetime import date

from .models import ArtworkSequence

COMPANY = "KF"  # Kreativefolio


def _initials(full_name: str) -> str:
    parts = [p for p in (full_name or "").split() if p]
    return "".join(p[0] for p in parts).upper()[:3] or "XX"


def build_artwork_id(
    *,
    client: str,
    brand: str,
    artwork_type: str,
    category_code: str,
    designer_name: str,
    on: date | None = None,
) -> str:
    """
    Format:
      {Company}_{Client}_{Brand}_{ArtworkType}__{YYMMDD}_{Initials}_{CategoryCode}-{YYYY}{Seq:04d}
    Example:
      KF_Nevo_Food_U_Cacao_Packaging_Design__240726_RH_K-20244002
    The sequence resets each calendar year, scoped per category_code, and is
    generated atomically (select_for_update).
    """
    on = on or date.today()
    seq = ArtworkSequence.next_number(year=on.year, category_code=category_code)
    return (
        f"{COMPANY}_{client}_{brand}_{artwork_type}"
        f"__{on:%y%m%d}_{_initials(designer_name)}"
        f"_{category_code}-{on.year}{seq:04d}"
    )
