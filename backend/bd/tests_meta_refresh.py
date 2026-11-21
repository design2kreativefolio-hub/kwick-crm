"""Manual "Refresh now" for Meta Lead Ads. The Meta API is always mocked."""
import io
import json
import urllib.error
from unittest import mock

from django.core.cache import cache
from django.test import override_settings

from bd.tests import BDTestBase

ON = dict(META_PAGE_ID="123", META_PAGE_ACCESS_TOKEN="tok")
URL = "/api/bd/meta/refresh"


class MetaRefreshTests(BDTestBase):
    def setUp(self):
        super().setUp()
        cache.delete("bd:meta-refresh")

    @override_settings(**ON)
    def test_admin_refresh_reports_how_many_were_imported(self):
        with mock.patch("bd.capture.pull_meta_leads", return_value=3) as pull:
            r = self.cadmin.post(URL)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["imported"], 3)
        pull.assert_called_once_with(raise_errors=True)

    @override_settings(**ON)
    def test_a_bde_cannot_refresh(self):
        with mock.patch("bd.capture.pull_meta_leads") as pull:
            self.assertEqual(self.ca.post(URL).status_code, 403)
        pull.assert_not_called()

    @override_settings(META_PAGE_ID="", META_PAGE_ACCESS_TOKEN="")
    def test_not_configured_says_so(self):
        r = self.cadmin.post(URL)
        self.assertEqual(r.status_code, 400)
        self.assertIn("isn't set up", r.json()["detail"])

    @override_settings(**ON)
    def test_meta_error_message_is_passed_on(self):
        err = urllib.error.HTTPError(
            "https://graph.facebook.com", 400, "Bad", {}, io.BytesIO(json.dumps({"error": {"message": "Token expired"}}).encode())
        )
        with mock.patch("bd.capture.pull_meta_leads", side_effect=err):
            r = self.cadmin.post(URL)
        self.assertEqual(r.status_code, 502)
        self.assertIn("Token expired", r.json()["detail"])

    @override_settings(**ON)
    def test_a_second_click_straight_after_is_held_back(self):
        with mock.patch("bd.capture.pull_meta_leads", return_value=0):
            self.assertEqual(self.cadmin.post(URL).status_code, 200)
            self.assertEqual(self.cadmin.post(URL).status_code, 429)
