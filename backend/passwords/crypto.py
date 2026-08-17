"""Fernet encryption for stored vault secrets."""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


def _fernet() -> Fernet:
    raw = getattr(settings, "PASSWORD_VAULT_KEY", None) or ""
    if not raw and getattr(settings, "DEBUG", False):
        import base64
        import hashlib

        digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
        raw = base64.urlsafe_b64encode(digest)
    if not raw:
        raise ImproperlyConfigured(
            "PASSWORD_VAULT_KEY is not set. Generate one with: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    try:
        return Fernet(raw.encode() if isinstance(raw, str) else raw)
    except Exception as exc:
        raise ImproperlyConfigured("PASSWORD_VAULT_KEY is not a valid Fernet key.") from exc


def encrypt_secret(value: str) -> str:
    if not value:
        return ""
    return _fernet().encrypt(value.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    if not token:
        return ""
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise ValueError("Could not decrypt stored password.") from exc
