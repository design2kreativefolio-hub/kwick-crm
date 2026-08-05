"""
Canonical shape of Proposal.content (the builder document) plus the fixed
section order used by both exporters (proposal_pdf.py / proposal_docx.py).

Mirrored on the frontend in frontend/src/lib/proposalContent.ts — the two
must stay in sync on section keys/shape since this is a hand-rolled schema,
not a generated one (see PROPOSAL INSTRUCTIONS - KWICK.docx for the spec).
"""

SOCIAL_PLATFORMS = ["instagram", "facebook", "linkedin", "tiktok", "youtube", "snapchat", "google_ads"]

# Order sections render in — fixed by spec, not user-reorderable. "pricing"
# is a list (repeatable section) rather than a single object; every other
# key here is a single dict.
SECTION_ORDER = [
    "home",
    "about_kreativefolio",
    "about_client",
    "traffic",
    "technical_seo",
    "keyword_strategy",
    "onpage_seo",
    "geo",
    "social_medias",
    "what_we_can_do",
    "pricing",
    "terms",
    "full_page_image",
]

DEFAULT_ABOUT_KREATIVEFOLIO = (
    "<p>Kreativefolio Marketing Management L.L.C is a full-service creative and growth "
    "partner, helping brands stand out through:</p>"
    "<ul>"
    "<li>Branding</li>"
    "<li>Graphic Design</li>"
    "<li>Web Design &amp; Development</li>"
    "<li>Ads &amp; Leads Management</li>"
    "<li>Photography &amp; Videography</li>"
    "<li>Digital Marketing</li>"
    "<li>Podcast Production</li>"
    "</ul>"
)

DEFAULT_TERMS_CONTENT = (
    "<ol>"
    "<li>Payment Terms: {payment_percent}% advance payment.</li>"
    "<li>Duration: {duration}.</li>"
    "<li>The quoted prices are based on the specified services; prices may vary if the services are changed.</li>"
    "<li>This proposal is valid for 7 days from the date of issue.</li>"
    "</ol>"
)


def default_content() -> dict:
    return {
        "home": {
            "enabled": True,
            "qtn_no": "",
            "date": None,
            "title": "Brand Audit",
            "client_id": None,
            "client_name": "",
            "client_email": "",
            "client_phone": "",
        },
        "about_kreativefolio": {"enabled": True, "content": DEFAULT_ABOUT_KREATIVEFOLIO},
        "about_client": {"enabled": True, "content": "", "image_urls": []},
        "traffic": {"enabled": True, "image_urls": []},
        "technical_seo": {"enabled": True, "content": ""},
        "keyword_strategy": {"enabled": True, "image_urls": []},
        "onpage_seo": {"enabled": True, "content": "", "image_urls": []},
        "geo": {"enabled": True, "description": "", "recommendations": "", "approach": ""},
        "social_medias": {"enabled": True, "platforms": []},
        "what_we_can_do": {"enabled": True, "rows": []},
        "pricing": [],
        "terms": {
            "enabled": True,
            "duration": "6 months",
            "payment_percent": "100",
        },
        "full_page_image": {"enabled": True, "image_url": ""},
    }


def default_pricing_item() -> dict:
    return {
        "enabled": True,
        "service_name": "Service",
        "ad_budget_label": "Ad Budget",
        "ad_budget": "",
        "management_fee_label": "Ad Management Fee",
        "management_fee": "",
        "rows": [],
    }


def default_social_platform(platform: str) -> dict:
    return {
        "platform": platform,
        "enabled": True,
        "description": "",
        "image_urls": [],
        "key_problems": "",
        "strategy_rows": [],
    }


def _migrate_legacy_images(item: dict) -> dict:
    """Early builds stored a single `image_url` string for fields that are
    now `image_urls` arrays. Backfill so proposals saved before that change
    don't silently lose their already-uploaded images — makes every read
    self-healing, and the next save persists the migrated shape for good."""
    item = dict(item)
    legacy = item.pop("image_url", None)
    if not item.get("image_urls") and legacy:
        item["image_urls"] = [legacy]
    return item


def merged_content(raw: dict) -> dict:
    """Deep-merge saved content over the defaults so a proposal saved before
    a section existed (or with a section never touched) still renders with
    every key present — exporters and templates can then use plain dict
    access instead of littering `.get(..., {})` everywhere. Also normalizes
    every item *inside* the pricing/social-platform lists over their own
    defaults, so an old item missing a field added later (e.g. a pricing
    label) comes back as that field's default instead of simply absent."""
    base = default_content()
    raw = raw or {}
    for key, default_value in base.items():
        value = raw.get(key)
        if value is None:
            continue
        if key == "pricing" and isinstance(value, list):
            base[key] = [{**default_pricing_item(), **item} for item in value]
        elif key == "social_medias" and isinstance(value, dict):
            platforms = value.get("platforms")
            merged_sm = {**default_value, **value}
            if isinstance(platforms, list):
                merged_sm["platforms"] = [
                    _migrate_legacy_images({**default_social_platform(p.get("platform", "")), **p})
                    for p in platforms
                ]
            base[key] = merged_sm
        elif key in ("about_client", "traffic", "onpage_seo") and isinstance(value, dict):
            base[key] = _migrate_legacy_images({**default_value, **value})
        elif isinstance(default_value, dict) and isinstance(value, dict):
            base[key] = {**default_value, **value}
        else:
            base[key] = value
    return base


def terms_html(terms: dict) -> str:
    return DEFAULT_TERMS_CONTENT.format(
        payment_percent=terms.get("payment_percent") or "100",
        duration=terms.get("duration") or "6 months",
    )
