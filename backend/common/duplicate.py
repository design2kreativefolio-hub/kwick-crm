"""Helpers for cloning documents with a `_duplicate` name suffix."""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Callable


def duplicate_label(name: str, *, exists: Callable[[str], bool] | None = None) -> str:
    """Return `name_duplicate`, or `name_duplicate_2` if that label is taken."""
    base = (name or "").strip() or "Untitled"
    candidate = f"{base}_duplicate"
    if exists is None:
        return candidate
    n = 2
    while exists(candidate):
        candidate = f"{base}_duplicate_{n}"
        n += 1
    return candidate


def deep_copy_json(value):
    return deepcopy(value or {})


def slug_filename(name: str, *, fallback: str = "document") -> str:
    """Safe PDF basename from a document title (no extension)."""
    slug = re.sub(r"[^\w\-]+", "_", (name or "").strip(), flags=re.UNICODE).strip("_")
    return (slug[:80] if slug else fallback) or fallback
