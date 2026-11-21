"""Excel / CSV lead import (A1).

Two-step: the same upload is sent twice — first as a preview (parsed rows,
guessed column mapping, how many are duplicates), then committed with the
mapping the user confirmed. Nothing is stored between the steps, so there is
no temp-file cleanup, and re-importing the same sheet creates nothing new.
"""
from __future__ import annotations

import csv
import io
import re
from decimal import Decimal, InvalidOperation

from django.db import transaction

from . import services
from .models import Currency, Lead

MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 3000
PREVIEW_ROWS = 25

# Lead field -> header words that probably mean it (lowercase, matched as substrings).
FIELD_HINTS: dict[str, tuple[str, ...]] = {
    "company": ("company", "business", "organisation", "organization", "firm", "brand"),
    "contact_name": ("contact person", "contact name", "contact", "person", "full name", "name", "lead name"),
    "designation": ("designation", "title", "role", "position"),
    "phone": ("phone", "mobile", "tel", "contact number", "number"),
    "whatsapp": ("whatsapp", "whats app", "wa number"),
    "email": ("email", "e-mail", "mail"),
    "website": ("website", "web site", "url", "domain", "site"),
    "country": ("country",),
    "city": ("city", "location", "emirate", "area"),
    "source": ("source", "channel", "lead source", "origin"),
    "source_detail": ("campaign", "source detail", "referred", "referrer", "event"),
    "services": ("service", "interested", "requirement", "looking for"),
    "est_value": ("value", "budget", "amount", "estimate", "price", "deal size"),
    "currency": ("currency",),
    "notes": ("note", "remark", "comment", "feedback", "status update"),
}
FIELDS = list(FIELD_HINTS)

_SOURCE_WORDS = [
    ("meta_ads", ("meta", "facebook", "instagram", "fb ", "ads", "ad ")),
    ("website", ("website", "web", "site", "form", "seo", "google")),
    ("whatsapp", ("whatsapp", "whats app", "wa ")),
    ("referral", ("referral", "referred", "reference", "word of mouth")),
    ("event", ("event", "expo", "exhibition", "conference", "networking")),
    ("cold_outreach", ("cold", "outreach", "linkedin", "apollo", "walk", "email campaign")),
]


class ImportFileError(Exception):
    """Unreadable / oversize upload — shown to the user as-is."""


_PLACEHOLDERS = {"none", "n/a", "na", "nil", "null", "nan", "-", "--", "—", "–", "?", "not available", "unknown"}
_SKIP_SHEETS = ("summary", "instruction", "readme", "read me", "notes", "about", "legend", "lists", "chart")
_URLISH = re.compile(r"^(https?://|www\.|mailto:|tel:)", re.I)


def _clean(text: str) -> str:
    """Blank out 'None' / 'N/A' / 'None found on Google profile' style filler."""
    t = (text or "").strip()
    low = t.lower()
    if low in _PLACEHOLDERS or low.startswith(("none ", "none(", "n/a ")):
        return ""
    return t


def _cell_value(cell) -> str:
    """Text of a cell. A short label that carries a link ('Chat', 'Open map', 'Email')
    becomes the link target, so a WhatsApp / Maps / mailto link is not lost."""
    value = cell.value
    text = "" if value is None else _cell_text(value)
    link = getattr(cell, "hyperlink", None)
    target = (getattr(link, "target", None) or getattr(link, "location", None) or "") if link else ""
    if target and not _URLISH.match(text.strip()) and "@" not in text:
        return target[7:] if target.lower().startswith("mailto:") else target
    return text


def _header_score(row: list[str]) -> int:
    texts = [str(c).strip() for c in row]
    return len(guess_mapping([x for x in texts if x])) if any(texts) else 0


def _pick_table(sheets: list[tuple[str, list[list[str]]]], wanted: str | None):
    """Choose the sheet that actually holds the leads, and its header row."""
    best = None
    for name, rows in sheets:
        rows = [r for r in rows if any(str(c).strip() for c in r)]
        if len(rows) < 2:
            continue
        if wanted is not None and name != wanted:
            continue
        # header = the best-scoring of the first few rows (titles/notes often sit above it)
        scored = [(_header_score(r), -i) for i, r in enumerate(rows[:10])]
        score, neg = max(scored)
        header_at = -neg
        lowered = name.lower()
        penalty = 1 if any(w in lowered for w in _SKIP_SHEETS) else 0
        key = (wanted is not None, -penalty, score, len(rows) - header_at - 1)
        if best is None or key > best[0]:
            best = (key, name, rows, header_at)
    return best


def read_table_info(upload, sheet: str | None = None):
    """(headers, rows, info) from an .xlsx or .csv upload. All cells become text.
    `info` = {"sheet": chosen sheet or "", "sheets": [names]}. A workbook with a
    Summary page in front of the real data is handled by picking the sheet that
    looks like a lead list."""
    name = (getattr(upload, "name", "") or "").lower()
    if upload.size and upload.size > MAX_BYTES:
        raise ImportFileError("That file is too large (5 MB max).")
    data = upload.read()
    info = {"sheet": "", "sheets": []}
    if name.endswith(".csv"):
        text = None
        for enc in ("utf-8-sig", "cp1252"):
            try:
                text = data.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        if text is None:
            raise ImportFileError("Couldn't read that CSV — save it as UTF-8 and try again.")
        try:
            dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        sheets = [("", list(csv.reader(io.StringIO(text), dialect)))]
    elif name.endswith(".xlsx") or name.endswith(".xlsm"):
        try:
            from openpyxl import load_workbook
        except ImportError:  # pragma: no cover
            raise ImportFileError("Excel import isn't available on this server.")
        try:
            # Not read-only: link targets (WhatsApp / Maps / mailto) are only available this way.
            wb = load_workbook(io.BytesIO(data), data_only=True)
        except Exception:
            raise ImportFileError("Couldn't read that Excel file. Is it a valid .xlsx?")
        sheets = []
        for ws in wb.worksheets:
            if ws.sheet_state != "visible":
                continue
            rows_ = []
            for row in ws.iter_rows():
                rows_.append([_cell_value(c) for c in row])
                if len(rows_) > MAX_ROWS + 15:
                    break
            sheets.append((ws.title, rows_))
        wb.close()
        info["sheets"] = [n for n, _ in sheets]
    else:
        raise ImportFileError("Upload an .xlsx or .csv file.")

    picked = _pick_table(sheets, sheet if sheet in info["sheets"] else None)
    if not picked:
        raise ImportFileError("The sheet needs a header row and at least one lead.")
    _, sheet_name, raw_rows, header_at = picked
    info["sheet"] = sheet_name
    headers = [str(h).strip() for h in raw_rows[header_at]]
    rows = [[_clean(str(c)) for c in r] for r in raw_rows[header_at + 1 :]]
    rows = [r for r in rows if any(c for c in r)]
    if not rows:
        raise ImportFileError("The sheet needs a header row and at least one lead.")
    if len(rows) > MAX_ROWS:
        raise ImportFileError(f"Too many rows ({len(rows)}). Split the sheet into files of {MAX_ROWS} or fewer.")
    width = len(headers)
    rows = [(r + [""] * width)[:width] for r in rows]
    return headers, rows, info


def read_table(upload) -> tuple[list[str], list[list[str]]]:
    headers, rows, _ = read_table_info(upload)
    return headers, rows


def _cell_text(value) -> str:
    if isinstance(value, float) and value.is_integer():
        return str(int(value))  # phone numbers / ids that Excel stored as floats
    return str(value)


def guess_mapping(headers: list[str]) -> dict[str, str]:
    """{lead field: header} — each header is claimed by at most one field."""
    mapping: dict[str, str] = {}
    used: set[int] = set()
    # Exact-ish matches first so "Contact Person" doesn't lose to "Phone number".
    for field in FIELDS:
        for hint in FIELD_HINTS[field]:
            for idx, header in enumerate(headers):
                if idx in used:
                    continue
                h = header.lower().strip()
                if h == hint:
                    mapping[field] = header
                    used.add(idx)
                    break
            if field in mapping:
                break
    for field in FIELDS:
        if field in mapping:
            continue
        for hint in FIELD_HINTS[field]:
            hit = next(
                (i for i, h in enumerate(headers) if i not in used and hint in h.lower()), None
            )
            if hit is not None:
                mapping[field] = headers[hit]
                used.add(hit)
                break
    return mapping


def _parse_value(text: str):
    cleaned = re.sub(r"[^\d.,]", "", text or "")
    if not cleaned:
        return None
    if cleaned.count(",") and cleaned.count("."):
        cleaned = cleaned.replace(",", "")
    elif cleaned.count(",") == 1 and len(cleaned.split(",")[1]) <= 2:
        cleaned = cleaned.replace(",", ".")
    else:
        cleaned = cleaned.replace(",", "")
    try:
        return Decimal(cleaned).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None


def _guess_source(text: str, default: str) -> str:
    t = f" {(text or '').lower()} "
    if not t.strip():
        return default
    for exact in Lead.Source.values:
        if t.strip().replace(" ", "_") == exact:
            return exact
    for source, words in _SOURCE_WORDS:
        if any(w in t for w in words):
            return source
    return Lead.Source.OTHER


def _guess_services(text: str) -> list[str]:
    from sales.models import Client

    t = (text or "").lower()
    found = []
    for svc in Client.Service:
        label = svc.label.lower()
        keys = {svc.value.replace("_", " "), label, label.split(" ")[0]}
        if svc.value == "web_design":
            keys |= {"website", "web"}
        if svc.value == "ads_leads":
            keys |= {"ads", "lead gen", "leads"}
        if svc.value == "photo_video":
            keys |= {"photo", "video", "shoot"}
        if svc.value == "digital_marketing":
            keys |= {"marketing", "social media", "seo", "smm"}
        if svc.value == "graphic_design":
            keys |= {"graphic", "design", "logo", "packaging"}
        if any(k and k in t for k in keys):
            found.append(svc.value)
    return found


def row_to_lead_data(row: list[str], headers: list[str], mapping: dict[str, str], *, default_source: str):
    index = {h: i for i, h in enumerate(headers)}

    def cell(field):
        header = mapping.get(field)
        if not header or header not in index:
            return ""
        return row[index[header]].strip()

    value_text = cell("est_value")
    currency = cell("currency").upper()
    if currency not in Currency.values:
        currency = "USD" if ("usd" in value_text.lower() or "$" in value_text) else "AED"
    def wa_number(text: str) -> str:
        """A WhatsApp cell can be a number or a wa.me / api.whatsapp.com link."""
        m = re.search(r"(?:wa\.me/|phone=)\+?(\d{7,15})", text or "")
        digits = m.group(1) if m else re.sub(r"\D", "", text or "")
        return f"+{digits}" if 7 <= len(digits) <= 15 else ""

    def phone_text(text: str) -> str:
        return text if re.search(r"\d{5,}", re.sub(r"[\s().-]", "", text or "")) else ""

    data = {
        "company": cell("company")[:200],
        "contact_name": cell("contact_name")[:150],
        "designation": cell("designation")[:120],
        "phone": phone_text(cell("phone"))[:40],
        "whatsapp": wa_number(cell("whatsapp"))[:40],
        "email": cell("email")[:254],
        "website": cell("website")[:300],
        "country": (cell("country") or "UAE")[:80],
        "city": cell("city")[:80],
        "source": _guess_source(cell("source"), default_source),
        "source_detail": cell("source_detail")[:200],
        "services": _guess_services(cell("services")),
        "est_value": _parse_value(value_text) or Decimal("0.00"),
        "currency": currency,
    }
    if "@" not in data["email"] or " " in data["email"]:
        data["email"] = ""
    return data, _note(row, headers, mapping, cell("notes"))


_ROW_NUMBER_HEADERS = {"#", "no", "no.", "sr", "sr.", "s.no", "s no", "sl no", "sl.no", "sno", "id", "serial"}


def _note(row, headers, mapping, notes: str) -> str:
    """The notes cell plus every column that has no Lead field of its own (sector,
    rating, priority, pitch, address, map link...), so nothing in the sheet is lost."""
    claimed = set(mapping.values())
    lines = [notes.strip()] if notes.strip() else []
    for header, value in zip(headers, row):
        h = header.strip()
        v = value.strip()
        if not h or not v or h in claimed or h.lower() in _ROW_NUMBER_HEADERS:
            continue
        lines.append(f"{h}: {v[:300]}")
    return "\n".join(lines)[:4000]


def _fallback_key(data) -> str:
    return re.sub(r"\s+", " ", f"{data['company']}|{data['contact_name']}".lower()).strip()


def analyse(user, headers, rows, mapping, *, default_source="other", owner=None):
    """Classify every row: ok / duplicate / empty. Returns a list of dicts
    {row, data, note, status, reason}."""
    seen_keys: set[str] = set()
    existing_fallback: set[str] = set()
    owner_id = (owner or user).pk
    for company, contact in Lead.objects.filter(owner_id=owner_id).values_list("company", "contact_name"):
        existing_fallback.add(_fallback_key({"company": company, "contact_name": contact}))

    results = []
    for n, row in enumerate(rows, start=2):  # row 1 = headers
        data, note = row_to_lead_data(row, headers, mapping, default_source=default_source)
        entry = {"row": n, "data": data, "note": note, "status": "ok", "reason": ""}
        if not (data["company"] or data["contact_name"]):
            entry.update(status="skipped", reason="No company or contact name")
            results.append(entry)
            continue

        keys = {
            "p": services.normalise_phone(data["phone"]),
            "w": services.normalise_phone(data["whatsapp"]),
            "e": services.normalise_email(data["email"]),
            "d": services.website_domain(data["website"]),
        }
        has_identity = any(keys.values())
        in_file = None
        for k, v in keys.items():
            if v and f"{'p' if k == 'w' else k}:{v}" in seen_keys:
                in_file = k
        if has_identity:
            if in_file:
                entry.update(status="duplicate", reason="Repeated earlier in this file")
            else:
                matches = services.find_duplicates(
                    user,
                    phone=data["phone"],
                    whatsapp=data["whatsapp"],
                    email=data["email"],
                    website=data["website"],
                )
                if matches:
                    what = "a client" if matches[0]["type"] == "client" else "an existing lead"
                    entry.update(status="duplicate", reason=f"Already {what} ({', '.join(matches[0]['fields'])})")
        else:
            fk = _fallback_key(data)
            if fk in existing_fallback or f"f:{fk}" in seen_keys:
                entry.update(status="duplicate", reason="Same company and contact already exist")

        # Remember every identity in the file — including rows rejected above —
        # so a later row for the same person can't slip through.
        for k, v in keys.items():
            if v:
                seen_keys.add(f"{'p' if k == 'w' else k}:{v}")
        if not has_identity:
            seen_keys.add(f"f:{_fallback_key(data)}")
        results.append(entry)
    return results


def summarise(results) -> dict:
    return {
        "total": len(results),
        "ok": sum(1 for r in results if r["status"] == "ok"),
        "duplicates": sum(1 for r in results if r["status"] == "duplicate"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
    }


@transaction.atomic
def commit(user, results, *, owner=None, source_detail="Excel import"):
    """Create a Lead for every `ok` row. `owner` fixed => all to that user,
    otherwise assigned by round-robin (superadmin importing for the team)."""
    from . import services as svc
    from .models import Activity

    created = 0
    for entry in results:
        if entry["status"] != "ok":
            continue
        data = entry["data"]
        lead_owner = owner or svc.pick_owner()
        lead = Lead.objects.create(
            owner=lead_owner,
            raw_payload={"import_row": entry["row"], "import_source": source_detail},
            **{**data, "source_detail": data["source_detail"] or source_detail},
        )
        if entry["note"]:
            svc.log_activity(
                lead=lead, user=user, kind=Activity.Kind.NOTE, body=entry["note"]
            )
        created += 1
    return created
