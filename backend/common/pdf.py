"""WeasyPrint helper: render HTML without letting the document read local files."""
from urllib.parse import urlparse

from weasyprint import HTML, default_url_fetcher

_ALLOWED_SCHEMES = {"http", "https", "data"}


def safe_url_fetcher(url, *args, **kwargs):
    # Blocks file:// (and anything else) so injected markup can't embed server files.
    if urlparse(url).scheme.lower() not in _ALLOWED_SCHEMES:
        raise ValueError(f"Blocked resource URL scheme: {url[:40]}")
    return default_url_fetcher(url, *args, **kwargs)


def render_pdf(html: str) -> bytes:
    return HTML(string=html, url_fetcher=safe_url_fetcher).write_pdf()
