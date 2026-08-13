"""Proposal builder -> branded PDF (WeasyPrint), matching PROPOSAL
INSTRUCTIONS - KWICK.docx. See proposal_content.py for the content shape."""

import base64
import mimetypes
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from django.template.loader import render_to_string
from django.utils import timezone

from .proposal_content import merged_content, terms_html

ASSETS_DIR = Path(__file__).resolve().parent / "proposal_assets"

SOCIAL_PLATFORM_LABELS = {
    "instagram": "Instagram",
    "facebook": "Facebook",
    "linkedin": "LinkedIn",
    "tiktok": "TikTok",
    "youtube": "YouTube",
    "snapchat": "Snapchat",
    "google_ads": "Google Ads",
}


def _data_uri(filename: str) -> str:
    mime = "image/jpeg" if filename.lower().endswith((".jpg", ".jpeg")) else "image/png"
    data = (ASSETS_DIR / filename).read_bytes()
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def _fetch_data_uri(url: str) -> str:
    """Download a proposal image and inline it as a data URI. WeasyPrint
    would otherwise fetch each <img src="https://..."> itself, serially,
    during layout — with S3/OVH-hosted images that's one blocking network
    round trip per image, and proposals easily reference a dozen. Fetching
    them all up front, in parallel, turns that into one short concurrent
    burst instead. Falls back to the original URL on any failure so
    WeasyPrint gets a chance to fetch it itself rather than showing nothing."""
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = resp.read()
            mime = resp.headers.get_content_type() or mimetypes.guess_type(url)[0] or "image/png"
        return f"data:{mime};base64,{base64.b64encode(data).decode()}"
    except Exception:
        return url


def _prefetch_images(content: dict) -> dict:
    urls = set()
    for key in ("about_client", "traffic", "onpage_seo", "keyword_strategy"):
        urls.update(u for u in content[key].get("image_urls", []) if u)
    if content["full_page_image"].get("image_url"):
        urls.add(content["full_page_image"]["image_url"])
    for p in content["social_medias"].get("platforms", []):
        urls.update(u for u in p.get("image_urls", []) if u)
    for item in content.get("custom_sections") or []:
        urls.update(u for u in item.get("image_urls", []) if u)

    if not urls:
        return {}
    with ThreadPoolExecutor(max_workers=min(8, len(urls))) as pool:
        results = pool.map(_fetch_data_uri, urls)
    return dict(zip(urls, results))


def _format_date(value) -> str:
    if not value:
        return timezone.now().strftime("%d/%m/%Y")
    try:
        from datetime import date, datetime

        if isinstance(value, (date, datetime)):
            return value.strftime("%d/%m/%Y")
        return datetime.fromisoformat(str(value)).strftime("%d/%m/%Y")
    except ValueError:
        return str(value)


def build_context(proposal) -> dict:
    content = merged_content(proposal.content)
    inlined = _prefetch_images(content)

    def resolve(url):
        return inlined.get(url, url) if url else url

    home = dict(content["home"])
    home["date_display"] = _format_date(home.get("date"))
    client_display_name = home.get("client_name") or "Client"

    about_client = dict(content["about_client"])
    about_client["image_urls"] = [resolve(u) for u in about_client.get("image_urls", [])]

    traffic = dict(content["traffic"])
    traffic["image_urls"] = [resolve(u) for u in traffic.get("image_urls", [])]

    onpage_seo = dict(content["onpage_seo"])
    onpage_seo["image_urls"] = [resolve(u) for u in onpage_seo.get("image_urls", [])]

    keyword_strategy = dict(content["keyword_strategy"])
    keyword_strategy["image_urls"] = [resolve(u) for u in keyword_strategy.get("image_urls", [])]

    full_page_image = dict(content["full_page_image"])
    full_page_image["image_url"] = resolve(full_page_image.get("image_url"))

    visible_platforms = []
    for p in content["social_medias"].get("platforms", []):
        if not p.get("enabled", True):
            continue
        p = dict(p)
        p["platform_label"] = SOCIAL_PLATFORM_LABELS.get(p.get("platform"), p.get("platform", "").title())
        p["image_urls"] = [resolve(u) for u in p.get("image_urls", [])]
        visible_platforms.append(p)

    visible_pricing = [item for item in content["pricing"] if item.get("enabled", True)]

    custom_sections = []
    for item in content.get("custom_sections") or []:
        if not item.get("enabled", True):
            continue
        item = dict(item)
        item["image_urls"] = [resolve(u) for u in item.get("image_urls", [])]
        custom_sections.append(item)

    return {
        "home": home,
        "client_display_name": client_display_name,
        "about_kreativefolio": content["about_kreativefolio"],
        "about_client": about_client,
        "traffic": traffic,
        "technical_seo": content["technical_seo"],
        "keyword_strategy": keyword_strategy,
        "onpage_seo": onpage_seo,
        "geo": content["geo"],
        "social_medias": content["social_medias"],
        "visible_platforms": visible_platforms,
        "what_we_can_do": content["what_we_can_do"],
        "visible_pricing": visible_pricing,
        "terms": content["terms"],
        "terms_html": terms_html(content["terms"]),
        "full_page_image": full_page_image,
        "custom_sections": custom_sections,
        "logo_data_uri": _data_uri("logo.png"),
        "footer_data_uri": _data_uri("footer.png"),
        "cover_full_data_uri": _data_uri("cover_full.jpg"),
    }


def render_proposal_pdf(proposal, request) -> str:
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage
    from weasyprint import HTML

    from common.duplicate import slug_filename

    html = render_to_string("sales/proposal_pdf.html", build_context(proposal))
    pdf_bytes = HTML(string=html).write_pdf()

    raw_name = (proposal.title or "").strip() or f"proposal-{proposal.pk}"
    slug = slug_filename(raw_name, fallback=f"proposal-{proposal.pk}")
    key = f"proposal-exports/{proposal.pk}/{slug}.pdf"
    folder = f"proposal-exports/{proposal.pk}/"
    try:
        _dirs, files = default_storage.listdir(folder)
        for name in files:
            default_storage.delete(f"{folder}{name}")
    except Exception:
        pass
    if default_storage.exists(key):
        default_storage.delete(key)
    saved_path = default_storage.save(key, ContentFile(pdf_bytes))
    return request.build_absolute_uri(default_storage.url(saved_path))
