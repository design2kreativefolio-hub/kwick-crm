"""Proposal builder -> branded DOCX (python-docx), matching PROPOSAL
INSTRUCTIONS - KWICK.docx. Mirrors proposal_pdf.py section-for-section.

Every run this module creates is explicitly stamped with BASE_FONT — Word's
built-in styles (Heading 3, List Bullet, ...) pull whatever font/color the
current theme defines, which reliably produced a document where headings
and body text looked like two different fonts. Manual, explicit formatting
sidesteps that entirely.
"""

import io
import urllib.request
from html.parser import HTMLParser

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Mm, Pt, RGBColor

from .proposal_content import merged_content, terms_html
from .proposal_pdf import ASSETS_DIR, SOCIAL_PLATFORM_LABELS, _format_date

NAVY = RGBColor(0x1B, 0x25, 0x59)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
BASE_FONT = "Calibri"
PAGE_W_MM, PAGE_H_MM = 210, 297
CONTENT_W_MM = PAGE_W_MM - 2 * 25  # default ~1in margins each side


def _asset_path(name: str) -> str:
    return str(ASSETS_DIR / name)


def _fetch_image(url: str):
    if not url:
        return None
    try:
        with urllib.request.urlopen(url, timeout=12) as resp:
            return io.BytesIO(resp.read())
    except Exception:
        return None


def _shade(el, hex_color: str):
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), hex_color)
    el.append(shd)


def _style_run(run, size=None, bold=None, color=None, name=BASE_FONT):
    run.font.name = name
    # Word looks up the East Asian/complex-script font slot separately from
    # the Latin one — without this, some builds fall back to Times New
    # Roman for those slots even though the Latin font is set correctly.
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn("w:rFonts"))
    if rFonts is None:
        rFonts = OxmlElement("w:rFonts")
        rPr.append(rFonts)
    rFonts.set(qn("w:eastAsia"), name)
    if size is not None:
        run.font.size = Pt(size)
    if bold is not None:
        run.bold = bold
    if color is not None:
        run.font.color.rgb = color


# ---------------------------------------------------------------------------
# Minimal HTML -> docx converter for the rich-text (Tiptap StarterKit) fields.
# ---------------------------------------------------------------------------

class _HtmlToDocx(HTMLParser):
    def __init__(self, container):
        super().__init__()
        self.container = container
        self.bold = self.italic = self.underline = False
        self.heading = False
        self.list_type = None
        self.paragraph = None

    def _p(self, style=None):
        self.paragraph = self.container.add_paragraph(style=style)
        return self.paragraph

    def handle_starttag(self, tag, attrs):
        if tag == "p":
            self._p()
        elif tag in ("strong", "b"):
            self.bold = True
        elif tag in ("em", "i"):
            self.italic = True
        elif tag == "u":
            self.underline = True
        elif tag == "br" and self.paragraph is not None:
            self.paragraph.add_run().add_break(WD_BREAK.LINE)
        elif tag in ("ul", "ol"):
            self.list_type = tag
        elif tag == "li":
            self._p(style="List Bullet" if self.list_type == "ul" else "List Number")
        elif tag in ("h1", "h2", "h3"):
            self._p()
            self.heading = True

    def handle_endtag(self, tag):
        if tag in ("strong", "b"):
            self.bold = False
        elif tag in ("em", "i"):
            self.italic = False
        elif tag == "u":
            self.underline = False
        elif tag in ("ul", "ol"):
            self.list_type = None
        elif tag in ("h1", "h2", "h3"):
            self.heading = False

    def handle_data(self, data):
        # Only skip runs that are PURELY whitespace between tags (Tiptap
        # output has these between block elements) — but keep the text
        # exactly as authored otherwise. Previously this called .strip() on
        # the text that actually got written into the run, which silently
        # ate the space between "text " and "<strong>bold</strong>" style
        # boundaries, running words together in the exported document.
        if not data.strip():
            return
        if self.paragraph is None:
            self._p()
        run = self.paragraph.add_run(data)
        _style_run(
            run,
            size=13 if self.heading else None,
            bold=self.bold or self.heading,
            color=NAVY if self.heading else None,
        )
        run.italic = self.italic
        run.underline = self.underline


def _add_html(container, html_string: str):
    if not html_string or not html_string.strip():
        return
    _HtmlToDocx(container).feed(html_string)


# ---------------------------------------------------------------------------
# Layout helpers
# ---------------------------------------------------------------------------

def _heading(doc, text: str, page_break: bool = False):
    p = doc.add_paragraph()
    if page_break:
        p.paragraph_format.page_break_before = True
    p.paragraph_format.space_before = Pt(16)
    p.paragraph_format.space_after = Pt(10)
    _style_run(p.add_run(text), size=19, bold=True, color=NAVY)
    return p


def _subheading(doc, text: str, page_break: bool = False):
    p = doc.add_paragraph()
    if page_break:
        p.paragraph_format.page_break_before = True
    p.paragraph_format.space_before = Pt(10)
    _style_run(p.add_run(text), size=13, bold=True, color=NAVY)
    return p


def _labelled_box(doc, label: str, text: str):
    if not text:
        return
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(8)
    _shade(p._p.get_or_add_pPr(), "FAF8F4")
    _style_run(p.add_run(f"{label.upper()}\n"), size=9, bold=True, color=NAVY)
    _style_run(p.add_run(text), size=11)


def _picture(doc, url: str, width_mm=None):
    stream = _fetch_image(url)
    if not stream:
        return
    doc.add_picture(stream, width=Mm(width_mm or CONTENT_W_MM))


def _table(doc, headers, rows, keys):
    if not rows:
        return
    table = doc.add_table(rows=1, cols=len(headers))
    table.style = "Table Grid"
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = ""
        _style_run(cell.paragraphs[0].add_run(h), bold=True, color=WHITE)
        _shade(cell._tc.get_or_add_tcPr(), "1B2559")
    for row in rows:
        cells = table.add_row().cells
        for i, key in enumerate(keys):
            cell = cells[i]
            cell.text = ""
            text = str(row.get(key, "") or "")
            lines = text.splitlines() or [""]
            p = cell.paragraphs[0]
            for li, line in enumerate(lines):
                if li > 0:
                    p.add_run().add_break(WD_BREAK.LINE)
                _style_run(p.add_run(line))
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    return table


def _set_header_footer(section):
    section.header.is_linked_to_previous = False
    section.footer.is_linked_to_previous = False

    hp = section.header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    hp.add_run().add_picture(_asset_path("logo.png"), height=Mm(12))

    fp = section.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    fp.paragraph_format.space_before = Pt(0)
    fp.add_run().add_picture(_asset_path("footer.png"), width=Mm(PAGE_W_MM - 20))


def _clear_header_footer(section):
    section.header.is_linked_to_previous = False
    section.footer.is_linked_to_previous = False
    for p in list(section.header.paragraphs):
        p.text = ""
    for p in list(section.footer.paragraphs):
        p.text = ""


# ---------------------------------------------------------------------------
# Main render
# ---------------------------------------------------------------------------

def render_proposal_docx(proposal, request) -> str:
    from django.core.files.base import ContentFile
    from django.core.files.storage import default_storage

    content = merged_content(proposal.content)
    doc = Document()

    normal = doc.styles["Normal"]
    normal.font.name = BASE_FONT
    normal.font.size = Pt(11)

    cover_section = doc.sections[0]
    _clear_header_footer(cover_section)

    # ---- Section 1: Home / cover. Logo/QTN/title/client info stay
    # per-proposal; the graphic beneath them (background art + tagline +
    # contact bar) is the fixed brand template image, not user-uploaded. ----
    home = content["home"]
    if home.get("enabled", True):
        logo_p = doc.add_paragraph()
        logo_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        try:
            logo_p.add_run().add_picture(_asset_path("logo.png"), height=Mm(20))
        except Exception:
            pass

        qtn_table = doc.add_table(rows=2, cols=2)
        qtn_table.style = "Table Grid"
        qtn_table.alignment = WD_TABLE_ALIGNMENT.RIGHT
        _style_run(qtn_table.rows[0].cells[0].paragraphs[0].add_run("QTN No:"), bold=True)
        _style_run(qtn_table.rows[0].cells[1].paragraphs[0].add_run(home.get("qtn_no") or ""))
        _style_run(qtn_table.rows[1].cells[0].paragraphs[0].add_run("Date:"), bold=True)
        _style_run(qtn_table.rows[1].cells[1].paragraphs[0].add_run(_format_date(home.get("date"))))

        title_p = doc.add_paragraph()
        title_p.paragraph_format.space_before = Pt(26)
        _style_run(title_p.add_run(home.get("title") or "Brand Audit"), size=30, bold=True, color=NAVY)

        to_p = doc.add_paragraph()
        _style_run(to_p.add_run(f"To: {home.get('client_name') or 'Client'}"), bold=True)
        if home.get("client_email"):
            _style_run(doc.add_paragraph().add_run(f"Email: {home['client_email']}"))
        if home.get("client_phone"):
            _style_run(doc.add_paragraph().add_run(f"Contact No: {home['client_phone']}"))

        doc.add_paragraph()
        try:
            doc.add_picture(_asset_path("cover_hero.jpg"), width=Mm(CONTENT_W_MM))
        except Exception:
            pass

    # ---- Sections 2-12: normal branded pages, flowing continuously (no
    # forced page break between them — only natural overflow pagination) ----
    body_section = doc.add_section(WD_SECTION.NEW_PAGE)
    _set_header_footer(body_section)

    client_display_name = home.get("client_name") or "Client"

    def start(title, page_break=False):
        _heading(doc, title, page_break=page_break)

    if content["about_kreativefolio"].get("enabled", True):
        start("About Kreativefolio", content["about_kreativefolio"].get("page_break_before", False))
        _add_html(doc, content["about_kreativefolio"].get("content"))

    ac = content["about_client"]
    if ac.get("enabled", True):
        start(f"About {client_display_name}", ac.get("page_break_before", False))
        _add_html(doc, ac.get("content"))
        for url in ac.get("image_urls") or []:
            _picture(doc, url)

    traffic = content["traffic"]
    if traffic.get("enabled", True):
        start("Traffic", traffic.get("page_break_before", False))
        for url in traffic.get("image_urls") or []:
            _picture(doc, url)

    tseo = content["technical_seo"]
    if tseo.get("enabled", True):
        start("Technical SEO", tseo.get("page_break_before", False))
        _add_html(doc, tseo.get("content"))

    kw = content["keyword_strategy"]
    if kw.get("enabled", True):
        start("Keyword Strategy", kw.get("page_break_before", False))
        for url in kw.get("image_urls") or []:
            _picture(doc, url)

    opseo = content["onpage_seo"]
    if opseo.get("enabled", True):
        start("Onpage SEO", opseo.get("page_break_before", False))
        _add_html(doc, opseo.get("content"))
        for url in opseo.get("image_urls") or []:
            _picture(doc, url)

    geo = content["geo"]
    if geo.get("enabled", True):
        start("GEO", geo.get("page_break_before", False))
        if geo.get("description"):
            _labelled_box(doc, "Description", geo["description"])
        _subheading(doc, "Recommendations")
        _add_html(doc, geo.get("recommendations"))
        _subheading(doc, "Our Approach")
        _add_html(doc, geo.get("approach"))

    social = content["social_medias"]
    visible_platforms = [p for p in social.get("platforms", []) if p.get("enabled", True)]
    if social.get("enabled", True) and visible_platforms:
        start("Social Medias", social.get("page_break_before", False))
        for i, p in enumerate(visible_platforms):
            if i > 0 and not p.get("page_break_before"):
                _subheading(doc, "")
            label = SOCIAL_PLATFORM_LABELS.get(p.get("platform"), (p.get("platform") or "").title())
            _subheading(doc, label, page_break=p.get("page_break_before", False))
            if p.get("description"):
                _labelled_box(doc, "Description", p["description"])
            for url in p.get("image_urls") or []:
                _picture(doc, url)
            if p.get("key_problems"):
                _subheading(doc, "Key Problems Identified")
                _add_html(doc, p["key_problems"])
            rows = p.get("strategy_rows") or []
            _table(doc, ["Category", "Details", "Goal"], rows, ["category", "details", "goal"])

    wwcd = content["what_we_can_do"]
    if wwcd.get("enabled", True) and wwcd.get("rows"):
        start("What We Can Do", wwcd.get("page_break_before", False))
        _table(doc, ["Area", "How Kreativefolio Can Help"], wwcd["rows"], ["area", "details"])

    visible_pricing = [item for item in content["pricing"] if item.get("enabled", True)]
    if visible_pricing:
        start("Pricing")
        for i, item in enumerate(visible_pricing):
            if i > 0 and not item.get("page_break_before"):
                _subheading(doc, "")
            _subheading(doc, item.get("service_name") or "Service", page_break=item.get("page_break_before", False))
            if item.get("ad_budget"):
                _labelled_box(doc, "Ad Budget", item["ad_budget"])
            if item.get("management_fee"):
                _labelled_box(doc, "Ad Management Fee", item["management_fee"])
            _table(doc, ["Category", "Details", "Frequency"], item.get("rows") or [], ["category", "details", "frequency"])

    terms = content["terms"]
    if terms.get("enabled", True):
        start("Terms", terms.get("page_break_before", False))
        _add_html(doc, terms_html(terms))

    # ---- Section 13: full-bleed image, no header/footer ----
    full_img = content["full_page_image"]
    if full_img.get("enabled", True) and full_img.get("image_url"):
        image_section = doc.add_section(WD_SECTION.NEW_PAGE)
        _clear_header_footer(image_section)
        image_section.top_margin = image_section.bottom_margin = Mm(0)
        image_section.left_margin = image_section.right_margin = Mm(0)
        stream = _fetch_image(full_img["image_url"])
        if stream:
            doc.add_picture(stream, width=Mm(PAGE_W_MM))

    for item in content.get("custom_sections") or []:
        if not item.get("enabled", True):
            continue
        title = (item.get("title") or "").strip() or "Additional section"
        body = (item.get("content") or "").strip()
        images = item.get("image_urls") or []
        if not body and not images:
            continue
        start(title, item.get("page_break_before", False))
        if body:
            _add_html(doc, body)
        for url in images:
            _picture(doc, url)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)

    key = f"proposal-exports/{proposal.pk}/proposal.docx"
    if default_storage.exists(key):
        default_storage.delete(key)
    saved_path = default_storage.save(key, ContentFile(buf.read()))
    return request.build_absolute_uri(default_storage.url(saved_path))
