from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase

from common.media_urls import (
    media_key_from_url,
    normalize_media_key,
    scrub_media_url,
    sign_media_url,
    verify_media_signature,
)
from common.uploads import CALENDAR_FILE_EXTENSIONS, IMAGE_EXTENSIONS, UploadRejected, check_upload


class MediaKeyTests(SimpleTestCase):
    def test_strips_prefix_and_query(self):
        self.assertEqual(
            media_key_from_url("https://api.example/media/avatars/1.jpg?v=9"),
            "avatars/1.jpg",
        )

    def test_rejects_traversal(self):
        self.assertEqual(normalize_media_key("../etc/passwd"), "")
        self.assertEqual(normalize_media_key("avatars/../../secret"), "")


class MediaSignatureTests(SimpleTestCase):
    def test_round_trip(self):
        url = sign_media_url("https://api.example/media/client-files/1/a.pdf")
        self.assertIn("sig=", url)
        self.assertIn("exp=", url)
        from urllib.parse import parse_qs, urlparse

        qs = parse_qs(urlparse(url).query)
        self.assertTrue(verify_media_signature("client-files/1/a.pdf", qs["exp"][0], qs["sig"][0]))

    def test_scrub_drops_signature(self):
        signed = sign_media_url("https://api.example/media/avatars/1.jpg?v=3")
        cleaned = scrub_media_url(signed)
        self.assertNotIn("sig=", cleaned)
        self.assertIn("v=3", cleaned)


class UploadAllowlistTests(SimpleTestCase):
    def test_rejects_html(self):
        upload = SimpleUploadedFile("page.html", b"<html>hi</html>", content_type="text/html")
        with self.assertRaises(UploadRejected):
            check_upload(upload, allowed=IMAGE_EXTENSIONS, max_bytes=10000)

    def test_rejects_svg(self):
        upload = SimpleUploadedFile("icon.svg", b"<svg></svg>", content_type="image/svg+xml")
        with self.assertRaises(UploadRejected):
            check_upload(upload, allowed=IMAGE_EXTENSIONS, max_bytes=10000)

    def test_rejects_fake_pdf(self):
        upload = SimpleUploadedFile("doc.pdf", b"not-a-pdf", content_type="application/pdf")
        with self.assertRaises(UploadRejected):
            check_upload(upload, allowed=frozenset({"pdf"}), max_bytes=10000)

    def test_calendar_allows_docx(self):
        upload = SimpleUploadedFile(
            "brief.docx",
            b"PK\x03\x04fake-docx",
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        self.assertEqual(
            check_upload(upload, allowed=CALENDAR_FILE_EXTENSIONS, max_bytes=10000),
            "docx",
        )
