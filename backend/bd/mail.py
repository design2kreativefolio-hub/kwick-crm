"""One-to-one email from Kwick (A13) and reply logging (A14).

Uses the shared sales mailbox over plain SMTP / IMAP — no paid service. Every
setting falls back to the app's existing EMAIL_* values, so if the app can
already send mail, Business Development can too. Nothing here is a bulk sender.

NOTE: Microsoft 365 has basic-auth SMTP/IMAP switched off. Until the mailbox is
reachable that way (or a Graph client is added), leave BD_IMAP_* unset and
reply logging simply stays off; sending still works with any SMTP account.
"""
from __future__ import annotations

import email
import imaplib
import logging
import re
from datetime import timedelta
from email.header import decode_header, make_header
from email.utils import make_msgid, parseaddr, parsedate_to_datetime

from django.conf import settings
from django.core.mail import EmailMessage, get_connection
from django.utils import timezone

from . import services
from .models import Activity, Lead, MailCursor
from .services import BDError

logger = logging.getLogger(__name__)

MAX_BODY = 5000


def _cfg(name: str, fallback_name: str = "", default=""):
    v = getattr(settings, name, "")
    if v not in ("", None):
        return v
    return getattr(settings, fallback_name, default) if fallback_name else default


def from_address() -> str:
    return _cfg("BD_MAIL_FROM", "DEFAULT_FROM_EMAIL")


def can_send() -> bool:
    return bool(_cfg("BD_SMTP_HOST", "EMAIL_HOST") and from_address())


def can_read() -> bool:
    return bool(settings.BD_IMAP_HOST and settings.BD_IMAP_USER and settings.BD_IMAP_PASSWORD)


def _connection():
    if getattr(settings, "BD_SMTP_HOST", ""):
        return get_connection(
            backend="django.core.mail.backends.smtp.EmailBackend",
            host=settings.BD_SMTP_HOST,
            port=int(settings.BD_SMTP_PORT),
            username=settings.BD_SMTP_USER,
            password=settings.BD_SMTP_PASSWORD,
            use_ssl=settings.BD_SMTP_USE_SSL,
            use_tls=settings.BD_SMTP_USE_TLS,
            timeout=20,
        )
    return get_connection(timeout=20)


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------
def send_lead_email(*, lead, user, subject: str, body: str, deal=None):
    subject = (subject or "").strip()
    body = (body or "").strip()
    if not lead.email:
        raise BDError("This lead has no email address.")
    if not subject or not body:
        raise BDError("Add a subject and a message.")
    if len(subject) > 200 or len(body) > MAX_BODY:
        raise BDError("That message is too long.")
    if not can_send():
        raise BDError("Email isn't set up on the server yet. Ask your admin to configure the sales mailbox.")

    sender = from_address()
    domain = parseaddr(sender)[1].rpartition("@")[2] or "kwick.local"
    message_id = make_msgid(domain=domain)
    msg = EmailMessage(
        subject=subject,
        body=body,
        from_email=sender,
        to=[lead.email],
        reply_to=[parseaddr(sender)[1]] if parseaddr(sender)[1] else None,
        connection=_connection(),
        headers={"Message-ID": message_id},
    )
    try:
        msg.send(fail_silently=False)
    except Exception as exc:  # smtplib / socket errors — never leak details to the UI
        logger.warning("BD: sending email to lead %s failed: %s", lead.pk, exc)
        raise BDError("The email couldn't be sent. Check the mailbox settings and try again.") from exc

    return services.log_activity(
        lead=lead,
        user=user,
        kind=Activity.Kind.EMAIL,
        direction=Activity.Direction.OUT,
        body=f"{subject}\n\n{body}",
        deal=deal,
        message_id=message_id,
    )


# ---------------------------------------------------------------------------
# Reading replies
# ---------------------------------------------------------------------------
_TAGS = re.compile(r"<[^>]+>")
_QUOTE_START = re.compile(r"^(on .+wrote:|-{2,}\s*original message|from:\s.+|>+)", re.I)


def _decode(value) -> str:
    try:
        return str(make_header(decode_header(value or "")))
    except Exception:
        return value or ""


def _text_of(msg) -> str:
    """Plain-text body, with quoted history trimmed off."""
    text = ""
    html = ""
    parts = msg.walk() if msg.is_multipart() else [msg]
    for part in parts:
        if part.get_content_disposition() == "attachment":
            continue
        ctype = part.get_content_type()
        if ctype not in ("text/plain", "text/html"):
            continue
        try:
            payload = part.get_payload(decode=True)
            decoded = payload.decode(part.get_content_charset() or "utf-8", errors="replace") if payload else ""
        except Exception:
            continue
        if ctype == "text/plain" and not text:
            text = decoded
        elif ctype == "text/html" and not html:
            html = decoded
    if not text and html:
        text = re.sub(r"[ \t]+", " ", _TAGS.sub("\n", html))
    kept = []
    for line in text.replace("\r", "").split("\n"):
        if _QUOTE_START.match(line.strip()):
            break
        kept.append(line.rstrip())
    return re.sub(r"\n{3,}", "\n\n", "\n".join(kept)).strip()[:MAX_BODY]


def _is_automatic(msg) -> bool:
    auto = (msg.get("Auto-Submitted") or "").lower()
    prec = (msg.get("Precedence") or "").lower()
    return (auto and auto != "no") or prec in ("bulk", "junk", "list") or bool(msg.get("List-Unsubscribe"))


def _connect():
    cls = imaplib.IMAP4_SSL if settings.BD_IMAP_USE_SSL else imaplib.IMAP4
    imap = cls(settings.BD_IMAP_HOST, int(settings.BD_IMAP_PORT), timeout=20)
    imap.login(settings.BD_IMAP_USER, settings.BD_IMAP_PASSWORD)
    return imap


def poll_inbox() -> int:
    """Log replies from known leads. Reads without changing the mailbox (no
    flags set); a cursor remembers the last UID so each run only sees new mail.
    Returns how many replies were logged."""
    if not can_read():
        return 0
    cursor, _ = MailCursor.objects.get_or_create(name="sales")
    own = {parseaddr(from_address())[1].lower(), settings.BD_IMAP_USER.lower()}
    logged = 0
    try:
        imap = _connect()
    except Exception:
        logger.warning("BD: couldn't connect to the sales inbox", exc_info=True)
        return 0
    try:
        status, _ = imap.select(getattr(settings, "BD_IMAP_FOLDER", "INBOX"), readonly=True)
        if status != "OK":
            return 0
        validity = ""
        try:
            validity = (imap.response("UIDVALIDITY")[1] or [b""])[0].decode()
        except Exception:
            pass
        if validity and cursor.uid_validity and validity != cursor.uid_validity:
            cursor.last_uid = 0
        cursor.uid_validity = validity or cursor.uid_validity

        if cursor.last_uid:
            _, data = imap.uid("SEARCH", None, f"UID {cursor.last_uid + 1}:*")
        else:
            since = (timezone.now() - timedelta(days=3)).strftime("%d-%b-%Y")
            _, data = imap.uid("SEARCH", None, "SINCE", since)
        uids = sorted(int(u) for u in (data[0] or b"").split() if int(u) > cursor.last_uid)[:100]

        for uid in uids:
            cursor.last_uid = max(cursor.last_uid, uid)
            _, parts = imap.uid("FETCH", str(uid), "(BODY.PEEK[])")
            raw = next((p[1] for p in parts if isinstance(p, tuple)), None)
            if not raw:
                continue
            msg = email.message_from_bytes(raw)
            sender = parseaddr(msg.get("From", ""))[1].lower()
            if not sender or sender in own or _is_automatic(msg):
                continue
            message_id = (msg.get("Message-ID") or "").strip()[:300]
            if message_id and Activity.objects.filter(message_id=message_id).exists():
                continue
            lead = (
                Lead.objects.filter(email_key=services.normalise_email(sender)).order_by("-last_activity_at").first()
            )
            if lead is None:
                continue
            try:
                when = parsedate_to_datetime(msg.get("Date")) if msg.get("Date") else timezone.now()
                if timezone.is_naive(when):
                    when = timezone.make_aware(when)
            except Exception:
                when = timezone.now()
            subject = _decode(msg.get("Subject", "")).strip() or "(no subject)"
            activity = services.log_activity(
                lead=lead,
                user=None,
                kind=Activity.Kind.EMAIL,
                direction=Activity.Direction.IN,
                body=f"{subject}\n\n{_text_of(msg)}".strip(),
                occurred_at=min(when, timezone.now()),
                message_id=message_id,
            )
            logged += 1
            from notifications.services import notify_user

            try:
                notify_user(
                    user=lead.owner,
                    source="bd",
                    title=f"{lead.display_name} replied",
                    body=subject[:140],
                    object_ref=f"bd-reply:{activity.pk}",
                )
            except Exception:
                logger.exception("BD: reply notification failed")
        cursor.save()
    except Exception:
        logger.warning("BD: inbox poll failed", exc_info=True)
        cursor.save()
    finally:
        try:
            imap.logout()
        except Exception:
            pass
    return logged
