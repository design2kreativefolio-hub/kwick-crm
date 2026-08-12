"""Branded Employee/Client report PDF via WeasyPrint."""

from __future__ import annotations

import base64
from pathlib import Path

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.template.loader import render_to_string
from django.utils import timezone

from common.duplicate import slug_filename

ASSETS_DIR = Path(__file__).resolve().parent.parent / "sales" / "proposal_assets"


def _data_uri(filename: str) -> str:
    path = ASSETS_DIR / filename
    if not path.exists():
        return ""
    mime = "image/jpeg" if filename.lower().endswith((".jpg", ".jpeg")) else "image/png"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def _display_date(iso: str) -> str:
    if not iso:
        return "—"
    try:
        from datetime import date

        return date.fromisoformat(iso[:10]).strftime("%d %b %Y")
    except ValueError:
        return iso


def build_pdf_context(report: dict) -> dict:
    from reports.charts import build_report_charts

    subject = report.get("subject") or {}
    title = "Employee Report" if report.get("type") == "employee" else "Client Report"
    charts = build_report_charts(report)
    return {
        "title": title,
        "subject_name": subject.get("name") or "",
        "subject_meta": subject.get("email")
        or subject.get("client_id")
        or subject.get("company")
        or "",
        "date_from": _display_date(report.get("date_from") or ""),
        "date_to": _display_date(report.get("date_to") or ""),
        "generated_at": timezone.localtime().strftime("%d %b %Y %H:%M"),
        "summary": report.get("summary") or {},
        "report": report,
        "logo_data_uri": _data_uri("logo.png"),
        "charts": charts,
    }


def render_report_pdf(report: dict, request=None) -> str:
    from django.conf import settings
    from weasyprint import HTML

    html = render_to_string("reports/report_pdf.html", build_pdf_context(report))
    pdf_bytes = HTML(string=html).write_pdf()

    subject = report.get("subject") or {}
    kind = report.get("type") or "report"
    raw = f"{kind}-{subject.get('name') or subject.get('id') or 'report'}"
    slug = slug_filename(raw, fallback=f"{kind}-report")
    stamp = timezone.localtime().strftime("%Y%m%d%H%M%S")
    key = f"report-exports/{kind}/{slug}-{stamp}.pdf"
    saved_path = default_storage.save(key, ContentFile(pdf_bytes))
    url = default_storage.url(saved_path)
    if request is not None:
        return request.build_absolute_uri(url)
    if url.startswith("http"):
        return url
    # Absolute URL for EDITH chat links (browser needs a full host)
    api_base = (getattr(settings, "PUBLIC_API_BASE", None) or "").rstrip("/")
    if not api_base:
        # Derive from FRONTEND_URL host → assume API on :8000 for local docker
        front = (getattr(settings, "FRONTEND_URL", None) or "http://localhost:3000").rstrip("/")
        if "localhost" in front or "127.0.0.1" in front:
            api_base = "http://localhost:8000"
        else:
            api_base = front
    if not url.startswith("/"):
        url = f"/{url}"
    return f"{api_base}{url}"
