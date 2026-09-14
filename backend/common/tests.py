from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase

from common.media_urls import (
    attach_download_name,
    content_disposition_header,
    download_name_for_key,
    filename_from_storage_key,
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


class DownloadNameTests(SimpleTestCase):
    def test_strips_hex_prefix(self):
        self.assertEqual(
            filename_from_storage_key("client-files/1/99f936e0_60DAY_DAILY_TRACKER.pdf"),
            "60DAY_DAILY_TRACKER.pdf",
        )

    def test_content_disposition_has_rfc5987_name(self):
        header = content_disposition_header("inline", "VAT Certificate.pdf")
        self.assertIn('filename="VAT Certificate.pdf"', header)
        self.assertIn("filename*=UTF-8''VAT%20Certificate.pdf", header)

    def test_requested_name_keeps_stored_extension(self):
        self.assertEqual(
            download_name_for_key("client-files/1/ab12cd34_license.pdf", "trade license.exe"),
            "trade license.pdf",
        )

    def test_sign_preserves_download_name(self):
        url = attach_download_name(
            "https://api.example/media/client-files/1/ab12cd34_license.pdf",
            "Trade License.pdf",
        )
        signed = sign_media_url(url)
        from urllib.parse import parse_qs, urlparse

        qs = parse_qs(urlparse(signed).query)
        self.assertEqual(qs["name"][0], "Trade License.pdf")
        cleaned = scrub_media_url(signed)
        self.assertNotIn("sig=", cleaned)
        self.assertIn("name=Trade", cleaned)


class MediaAclTests(SimpleTestCase):
    def test_anonymous_denied(self):
        from common.media_acl import user_can_read_media

        self.assertFalse(user_can_read_media(None, "avatars/1.jpg"))
        self.assertFalse(user_can_read_media(None, "client-files/1/a.pdf"))

    def test_inactive_user_denied(self):
        from types import SimpleNamespace

        from common.media_acl import user_can_read_media

        user = SimpleNamespace(can_login=False, pk=2, role="employee")
        self.assertFalse(user_can_read_media(user, "avatars/1.jpg"))

    def test_avatar_ok_for_active_staff(self):
        from types import SimpleNamespace
        from unittest.mock import patch

        from common.media_acl import user_can_read_media

        user = SimpleNamespace(can_login=True, pk=2, role="employee")
        with patch("common.media_acl.is_superadmin", return_value=False):
            self.assertTrue(user_can_read_media(user, "avatars/2.jpg"))

    def test_client_files_need_sales(self):
        from types import SimpleNamespace
        from unittest.mock import patch

        from common.media_acl import user_can_read_media

        user = SimpleNamespace(can_login=True, pk=2, role="employee")
        with patch("common.media_acl.is_superadmin", return_value=False):
            with patch("common.media_acl.has_module_access", return_value=False):
                self.assertFalse(user_can_read_media(user, "client-files/1/license.pdf"))
            with patch("common.media_acl.has_module_access", return_value=True):
                self.assertTrue(user_can_read_media(user, "client-files/1/license.pdf"))


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
