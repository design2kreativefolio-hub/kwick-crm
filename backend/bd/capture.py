"""Lead capture (A10 website forms, A11 Meta Lead Ads).

Both channels end in `ingest_lead`: it normalises whatever field names the form
plugin / Meta sent, de-duplicates against existing leads, assigns an owner and
writes the timeline + a push to the owner. No paid service is involved — the
website plugin POSTs to us, and Meta is polled through the free Graph API.
"""
from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from . import services
from .models import Activity, Lead, LeadCaptureSource

logger = logging.getLogger(__name__)

# Form plugins (CF7, Elementor, WPForms, Meta) all name things differently.
ALIASES = {
    "name": ("name", "yourname", "fullname", "contactname", "contact", "customername"),
    "first": ("firstname", "fname"),
    "last": ("lastname", "lname", "surname"),
    "company": ("company", "companyname", "organisation", "organization", "business", "businessname", "brand"),
    "phone": ("phone", "phonenumber", "tel", "telephone", "mobile", "mobilenumber", "yourphone", "contactnumber"),
    "whatsapp": ("whatsapp", "whatsappnumber"),
    "email": ("email", "youremail", "emailaddress", "workemail", "mail"),
    "website": ("website", "websiteurl", "url", "site", "companywebsite"),
    "message": ("message", "yourmessage", "comments", "comment", "enquiry", "inquiry", "details", "notes", "note", "description", "projectdetails", "howcanwehelp"),
    "service": ("service", "services", "interestedin", "serviceneeded", "subject", "requirement"),
    "city": ("city", "location"),
    "country": ("country",),
}

# Free-text service answers → our service codes.
SERVICE_KEYWORDS = {
    "branding": ("brand", "logo", "identity"),
    "graphic_design": ("graphic", "print", "packaging", "brochure"),
    "web_design": ("web", "website", "site", "ecommerce", "e-commerce", "shopify", "wordpress"),
    "ads_leads": ("ads", "advertis", "ppc", "lead gen", "leads", "meta ads", "google ads"),
    "photo_video": ("photo", "video", "shoot", "reel", "film"),
    "digital_marketing": ("marketing", "social", "seo", "instagram", "content", "digital"),
    "podcast": ("podcast",),
}

# Fields we store directly on Lead — clip to the column sizes.
_LIMITS = {"company": 200, "contact_name": 150, "phone": 40, "email": 254, "website": 300, "city": 80, "country": 80}


def _key(k) -> str:
    return re.sub(r"[^a-z0-9]", "", str(k).lower())


def flatten(data) -> dict:
    """Accept a dict (JSON / form), a QueryDict, or Meta's [{name, values}] list."""
    out: dict = {}
    if isinstance(data, list):
        for item in data:
            if isinstance(item, dict) and "name" in item:
                vals = item.get("values")
                out[_key(item["name"])] = (vals[0] if isinstance(vals, list) and vals else item.get("value", "")) or ""
        return out
    if hasattr(data, "lists"):  # QueryDict
        for k, v in data.lists():
            out[_key(k)] = v[-1] if v else ""
        return out
    if isinstance(data, dict):
        for k, v in data.items():
            if isinstance(v, (str, int, float)):
                out[_key(k)] = str(v)
            elif isinstance(v, list) and v and isinstance(v[0], (str, int, float)):
                out[_key(k)] = ", ".join(str(x) for x in v)
    return out


def _pick(flat: dict, field: str) -> str:
    for alias in ALIASES[field]:
        v = flat.get(alias)
        if v and str(v).strip():
            return str(v).strip()
    return ""


def map_fields(data) -> dict:
    flat = flatten(data)
    name = _pick(flat, "name") or " ".join(x for x in (_pick(flat, "first"), _pick(flat, "last")) if x)
    mapped = {
        "contact_name": name,
        "company": _pick(flat, "company"),
        "phone": _pick(flat, "phone"),
        "whatsapp": _pick(flat, "whatsapp"),
        "email": _pick(flat, "email"),
        "website": _pick(flat, "website"),
        "city": _pick(flat, "city"),
        "country": _pick(flat, "country"),
    }
    mapped = {k: v[: _LIMITS.get(k, 200)] for k, v in mapped.items()}
    mapped["message"] = _pick(flat, "message")[:3000]
    svc_text = _pick(flat, "service").lower()
    mapped["services"] = [code for code, words in SERVICE_KEYWORDS.items() if any(w in svc_text for w in words)]
    mapped["service_text"] = svc_text[:200]
    if "@" not in mapped["email"]:
        mapped["email"] = ""
    return mapped


def _find_existing(m: dict) -> Lead | None:
    q = Q()
    phones = {k for k in (services.normalise_phone(m["phone"]), services.normalise_phone(m["whatsapp"])) if k}
    if phones:
        q |= Q(phone_key__in=phones) | Q(whatsapp_key__in=phones)
    email_key = services.normalise_email(m["email"])
    if email_key:
        q |= Q(email_key=email_key)
    if not q:
        return None
    return Lead.objects.filter(q).order_by("-last_activity_at").first()


def _notify(owner, *, ref, title, body):
    from notifications.services import notify_user

    try:
        notify_user(user=owner, source="bd", title=title, body=body, object_ref=ref)
    except Exception:  # a failed push must never lose the lead
        logger.exception("BD capture: notification failed")


def _owner_for(source: LeadCaptureSource):
    from accounts.models import Role, User, UserStatus

    owner = source.default_owner
    if owner and owner.status == UserStatus.ACTIVE and owner.is_active:
        return owner
    return services.pick_owner() or User.objects.filter(role=Role.SUPERADMIN, is_active=True).order_by("id").first()


def ingest_lead(
    source: LeadCaptureSource,
    data,
    *,
    lead_source: str,
    source_detail: str = "",
    raw: dict | None = None,
    extra_raw: dict | None = None,
):
    """Create (or, for a repeat submission, annotate) a lead.

    Returns (lead, created) or (None, False) when the submission has nothing
    to follow up (no name, phone or email)."""
    m = map_fields(data)
    if not (m["contact_name"] or m["phone"] or m["email"] or m["company"]):
        return None, False

    now = timezone.now()
    existing = _find_existing(m)
    if existing is not None:
        body = "Submitted the form again" + (f" ({source_detail})" if source_detail else "") + "."
        if m["message"]:
            body += f"\n\n{m['message']}"
        services.log_activity(
            lead=existing, user=None, kind=Activity.Kind.NOTE, direction=Activity.Direction.IN, body=body
        )
        _notify(
            existing.owner,
            ref=f"bd-lead-repeat:{existing.pk}:{int(now.timestamp())}",
            title=f"{existing.display_name} got in touch again",
            body=m["message"][:140] or "They submitted the form again.",
        )
        LeadCaptureSource.objects.filter(pk=source.pk).update(
            last_received_at=now, received_count=source.received_count + 1
        )
        return existing, False

    owner = _owner_for(source)
    if owner is None:
        return None, False
    payload = dict(raw or {})
    payload.update(extra_raw or {})
    lead = Lead.objects.create(
        owner=owner,
        company=m["company"],
        contact_name=m["contact_name"],
        phone=m["phone"],
        whatsapp=m["whatsapp"],
        email=m["email"],
        website=m["website"],
        city=m["city"],
        country=m["country"] or "UAE",
        source=lead_source,
        source_detail=(source_detail or source.name)[:200],
        services=m["services"],
        raw_payload={"capture_source": source.pk, **payload},
    )
    services.system_note(lead, f"Captured from {source.name}.", user=None)
    note = m["message"] or (f"Interested in: {m['service_text']}" if m["service_text"] else "")
    if note:
        services.log_activity(
            lead=lead, user=None, kind=Activity.Kind.NOTE, direction=Activity.Direction.IN, body=note
        )
    LeadCaptureSource.objects.filter(pk=source.pk).update(
        last_received_at=now, received_count=source.received_count + 1
    )
    _notify(
        owner,
        ref=f"bd-lead-new:{lead.pk}",
        title=f"New lead: {lead.display_name}",
        body=f"{source.name}" + (f" · {m['service_text']}" if m["service_text"] else ""),
    )
    return lead, True


# ---------------------------------------------------------------------------
# Meta Lead Ads (A11)
# ---------------------------------------------------------------------------
def meta_configured() -> bool:
    return bool(getattr(settings, "META_PAGE_ACCESS_TOKEN", "") and getattr(settings, "META_PAGE_ID", ""))


def _graph_get(path: str, params: dict) -> dict:
    version = getattr(settings, "META_GRAPH_VERSION", "v19.0")
    params = {**params, "access_token": settings.META_PAGE_ACCESS_TOKEN}
    url = f"https://graph.facebook.com/{version}/{path.lstrip('/')}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(url, timeout=15) as resp:  # noqa: S310 - fixed https host
        return json.loads(resp.read().decode("utf-8"))


def pull_meta_leads() -> int:
    """Import new Lead Ad submissions. Safe to run repeatedly: each Meta lead id
    is only ever imported once, and a failure just leaves the rest for next run."""
    if not meta_configured():
        return 0
    source, _ = LeadCaptureSource.objects.get_or_create(
        kind=LeadCaptureSource.Kind.META, defaults={"name": "Meta Lead Ads"}
    )
    if not source.active:
        return 0
    since = (source.last_received_at or timezone.now() - timedelta(days=3)) - timedelta(minutes=10)
    created = 0
    try:
        forms = _graph_get(f"{settings.META_PAGE_ID}/leadgen_forms", {"fields": "id,name", "limit": 50}).get("data", [])
        for form in forms:
            params = {
                "fields": "id,created_time,field_data,ad_name,campaign_name,adset_name",
                "limit": 100,
                "filtering": json.dumps([{"field": "time_created", "operator": "GREATER_THAN", "value": int(since.timestamp())}]),
            }
            for item in _graph_get(f"{form['id']}/leads", params).get("data", []):
                meta_id = str(item.get("id", ""))
                if not meta_id or Lead.objects.filter(raw_payload__meta_lead_id=meta_id).exists():
                    continue
                detail = " · ".join(x for x in (item.get("campaign_name"), item.get("ad_name")) if x) or form.get("name", "")
                lead, was_new = ingest_lead(
                    source,
                    item.get("field_data", []),
                    lead_source=Lead.Source.META_ADS,
                    source_detail=detail,
                    raw={"meta_lead_id": meta_id},
                )
                if lead is not None and not was_new:
                    # a repeat person: remember the Meta id so we don't re-annotate next run
                    Lead.objects.filter(pk=lead.pk).update(
                        raw_payload={**lead.raw_payload, "meta_repeat_ids": [*lead.raw_payload.get("meta_repeat_ids", []), meta_id]}
                    )
                created += int(was_new)
    except (urllib.error.URLError, TimeoutError, ValueError, KeyError):
        logger.warning("BD: Meta lead pull failed", exc_info=True)
    return created
