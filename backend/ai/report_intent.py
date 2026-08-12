"""EDITH: detect report requests, clarify slots, generate PDF via reports app."""

from __future__ import annotations

import re

from common.permissions import has_module_access
from reports import report_pdf
from reports import services as report_services


REPORT_INTENT = re.compile(
    r"\b("
    r"report|pdf\s+report|activity\s+report|employee\s+report|client\s+report|"
    r"generate\s+(a\s+)?report|download\s+(a\s+)?report|"
    r"what\s+did\s+.+\s+do|"
    r"how\s+much\s+work\s+.+\s+(client|for)|"
    r"work\s+(done|completed)\s+for"
    r")\b",
    re.I,
)


def maybe_handle_report(user, history: list[dict], last_message: str) -> dict | None:
    """
    If the user is asking for an employee/client report, return a chat result
    dict (reply, links, attachments). Returns None when this is not a report ask.
    """
    last = (last_message or "").strip()
    transcript = _recent_user_text(history, last)
    last_has_intent = bool(REPORT_INTENT.search(last))
    history_has_intent = bool(REPORT_INTENT.search(transcript))
    if not last_has_intent and not (history_has_intent and _looks_like_slot_fill(last)):
        return None

    if not has_module_access(user, "reports"):
        return {
            "reply": (
                "I can generate Employee and Client reports, but you don't have "
                "Reports access yet. Ask a superadmin to grant the Reports module, "
                "or open Reports once you have it."
            ),
            "links": [{"label": "Reports", "href": "/reports", "icon": "bi-bar-chart-fill"}],
            "attachments": [],
        }

    report_type = _detect_type(transcript)
    period = report_services.parse_period_phrase(transcript)
    subject_hint = _extract_subject_hint(transcript, report_type)
    if not subject_hint and _looks_like_slot_fill(last) and re.fullmatch(
        r"[A-Za-z][A-Za-z0-9 .'-]{1,60}", last
    ):
        # Bare name reply after we asked which employee/client
        if not re.search(
            r"\b(employee|client|staff|month|year|report|pdf)\b", last, re.I
        ):
            subject_hint = last.strip()

    missing = []
    if not report_type:
        missing.append("whether this is an **employee** or **client** report")
    if report_type and not subject_hint:
        missing.append(
            "the **employee name**" if report_type == "employee" else "the **client name**"
        )
    if not period:
        missing.append("the **date range** (e.g. this month, last 6 months, this year, or from YYYY-MM-DD to YYYY-MM-DD)")

    if missing:
        ask = "To build that report I still need:\n" + "\n".join(f"• {m}" for m in missing)
        ask += "\n\nYou can also open Reports and pick everything there."
        return {
            "reply": ask,
            "links": [{"label": "Open Reports", "href": "/reports", "icon": "bi-bar-chart-fill"}],
            "attachments": [],
        }

    resolved = report_services.resolve_subject(report_type, subject_hint)
    matches = resolved.get("matches") or []
    if not matches:
        return {
            "reply": (
                f"I couldn't find a matching {'employee' if report_type == 'employee' else 'client'} "
                f"for “{subject_hint}”. Check the spelling, or pick them on the Reports page."
            ),
            "links": [{"label": "Open Reports", "href": "/reports", "icon": "bi-bar-chart-fill"}],
            "attachments": [],
        }
    if len(matches) > 1:
        lines = ["I found more than one match — which one did you mean?"]
        for m in matches[:6]:
            extra = m.get("email") or m.get("client_id") or m.get("company") or ""
            lines.append(f"• {m.get('name')}" + (f" ({extra})" if extra else ""))
        lines.append("\nReply with the exact name and I’ll generate the PDF.")
        return {
            "reply": "\n".join(lines),
            "links": [{"label": "Open Reports", "href": "/reports", "icon": "bi-bar-chart-fill"}],
            "attachments": [],
        }

    subject_id = matches[0]["id"]
    date_from, date_to = period
    try:
        report = report_services.build_report(report_type, subject_id, date_from, date_to)
        file_url = report_pdf.render_report_pdf(report, request=None)
    except Exception as exc:
        return {
            "reply": f"I tried to generate that report but hit an error: {exc}",
            "links": [{"label": "Open Reports", "href": "/reports", "icon": "bi-bar-chart-fill"}],
            "attachments": [],
        }

    name = (report.get("subject") or {}).get("name") or subject_hint
    filename = f"{report_type}-report-{name}.pdf".replace(" ", "-")
    return {
        "reply": report_services.summary_text(report),
        "links": [
            {"label": "Open Reports", "href": "/reports", "icon": "bi-bar-chart-fill"},
            {"label": "Download PDF", "href": file_url, "icon": "bi-file-earmark-pdf"},
        ],
        "attachments": [
            {
                "type": "document",
                "name": filename,
                "url": file_url,
            }
        ],
    }


def _looks_like_slot_fill(text: str) -> bool:
    q = (text or "").lower().strip()
    if not q or len(q) > 160:
        return False
    if re.search(r"\b(employee|client|staff|this month|last month|this year|6 months|six months)\b", q):
        return True
    if report_services.parse_period_phrase(q):
        return True
    if re.search(r"\b\d{4}-\d{2}-\d{2}\b", q):
        return True
    # Likely a bare name reply after we asked which person/client
    if re.fullmatch(r"[A-Za-z][A-Za-z0-9 .'-]{1,60}", text.strip()):
        return True
    return False


def _recent_user_text(history: list[dict], last_message: str) -> str:
    parts = []
    for m in history[-8:]:
        if (m.get("role") or "") == "user":
            parts.append(m.get("content") or "")
    if last_message and (not parts or parts[-1] != last_message):
        parts.append(last_message)
    return "\n".join(parts)


def _detect_type(text: str) -> str | None:
    q = text.lower()
    if re.search(r"\b(employee|staff|team\s+member|person)\b", q) or re.search(
        r"\bwhat\s+did\b", q
    ):
        return "employee"
    if re.search(r"\b(client|customer|account)\b", q) or re.search(
        r"\b(domain|hosting|renewal|invoices?\s+for)\b", q
    ):
        return "client"
    return None


def _extract_subject_hint(text: str, report_type: str | None) -> str:
    q = text.strip()
    # Patterns: "report on X", "report for X", "employee report for X", "what did X do"
    patterns = [
        r"(?:report|pdf)\s+(?:on|for|about)\s+(.+?)(?:\s+for\s+(?:this|last|the)|\s+from\s+|\s+between\s+|$)",
        r"(?:employee|staff|client)\s+report\s+(?:on|for|about)\s+(.+?)(?:\s+for\s+|\s+from\s+|$)",
        r"what\s+did\s+(.+?)\s+do\b",
        r"work\s+(?:done|completed)\s+for\s+(.+?)(?:\s+for\s+|\s+from\s+|$)",
        r"how\s+much\s+work\s+(?:did\s+we\s+do\s+)?(?:for|on)\s+(.+?)(?:\s+for\s+|\s+from\s+|$)",
    ]
    for pat in patterns:
        m = re.search(pat, q, re.I)
        if m:
            hint = _clean_hint(m.group(1))
            if hint:
                return hint

    # Fallback: after "named" / "called"
    m = re.search(r"\b(?:named|called)\s+([A-Za-z][A-Za-z0-9 .'-]{1,60})", q, re.I)
    if m:
        return _clean_hint(m.group(1))

    return ""


def _clean_hint(raw: str) -> str:
    hint = (raw or "").strip(" \t\n\r\"'`.,")
    hint = re.sub(
        r"\b(this|last|current|past)\s+(month|year|week|6\s+months|six\s+months)\b",
        "",
        hint,
        flags=re.I,
    )
    hint = re.sub(r"\b(please|thanks|thank you|pdf|report)\b", "", hint, flags=re.I)
    hint = re.sub(r"\s+", " ", hint).strip(" \t-,.")
    # Drop if it's only a period phrase
    if report_services.parse_period_phrase(hint):
        return ""
    if len(hint) < 2:
        return ""
    return hint
