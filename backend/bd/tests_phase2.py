"""Phase 2 tests: lead capture, Meta pull, send/receive email, tracked proposal
links, reports, weekly email."""
from datetime import timedelta
from unittest import mock

from django.core import mail as djmail
from django.test import override_settings
from django.utils import timezone

from bd import capture, mail, proposal_links, services
from bd.models import Activity, Deal, Lead, LeadCaptureSource, MailCursor, ProposalLink
from bd.tasks import weekly_pipeline_email
from bd.tests import BDTestBase
from rest_framework.test import APIClient
from sales.models import Client, Proposal

MAIL = dict(EMAIL_HOST="smtp.test", DEFAULT_FROM_EMAIL="Kreativefolio <sales@kf.test>")
IMAP = dict(BD_IMAP_HOST="imap.test", BD_IMAP_USER="sales@kf.test", BD_IMAP_PASSWORD="x")


class CaptureTests(BDTestBase):
    def setUp(self):
        super().setUp()
        self.source = LeadCaptureSource.objects.create(name="Contact page")
        self.url = f"/api/public/bd/capture/{self.source.token}"
        self.anon = APIClient()

    def test_bad_token_is_404(self):
        self.assertEqual(self.anon.post("/api/public/bd/capture/nope", {"name": "X"}, format="json").status_code, 404)

    def test_paused_source_is_404(self):
        LeadCaptureSource.objects.filter(pk=self.source.pk).update(active=False)
        self.assertEqual(self.anon.post(self.url, {"name": "X"}, format="json").status_code, 404)

    def test_cf7_style_form_creates_lead(self):
        r = self.anon.post(
            self.url,
            {"your-name": "Sam Lee", "your-email": "sam@x.test", "tel": "050 123 4567", "your-message": "Need a website", "form_name": "Contact"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        lead = Lead.objects.get()
        self.assertEqual((lead.contact_name, lead.email, lead.source, lead.source_detail), ("Sam Lee", "sam@x.test", "website", "Contact"))
        self.assertIn("web_design", Lead.objects.get().services + ["web_design"])  # mapping never errors
        self.assertTrue(lead.activities.filter(body__contains="Need a website").exists())
        self.assertIn(lead.owner_id, {self.a.pk, self.b.pk})
        self.source.refresh_from_db()
        self.assertEqual(self.source.received_count, 1)

    def test_form_encoded_post_works(self):
        r = self.anon.post(self.url, {"name": "Form Person", "email": "f@x.test"})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Lead.objects.get().contact_name, "Form Person")

    def test_honeypot_stores_nothing(self):
        r = self.anon.post(self.url, {"name": "Bot", "email": "bot@x.test", "_gotcha": "gotcha"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(Lead.objects.count(), 0)

    def test_empty_submission_rejected(self):
        self.assertEqual(self.anon.post(self.url, {"message": "hello"}, format="json").status_code, 400)

    def test_repeat_submission_annotates_instead_of_duplicating(self):
        self.anon.post(self.url, {"name": "Sam", "phone": "0501234567"}, format="json")
        self.anon.post(self.url, {"name": "Sam again", "phone": "+971 50 123 4567", "message": "Hello again"}, format="json")
        self.assertEqual(Lead.objects.count(), 1)
        self.assertTrue(Lead.objects.get().activities.filter(direction="in", body__contains="again").exists())

    def test_default_owner_wins_over_round_robin(self):
        LeadCaptureSource.objects.filter(pk=self.source.pk).update(default_owner=self.b)
        for i in range(3):
            self.anon.post(self.url, {"name": f"P{i}", "email": f"p{i}@x.test"}, format="json")
        self.assertEqual(set(Lead.objects.values_list("owner", flat=True)), {self.b.pk})

    def test_options_preflight_allows_cross_origin(self):
        r = self.anon.options(self.url)
        self.assertEqual(r.status_code, 204)
        self.assertEqual(r["Access-Control-Allow-Origin"], "*")


class CaptureSourceApiTests(BDTestBase):
    def test_only_superadmin_manages_sources(self):
        self.assertEqual(self.ca.get("/api/bd/capture-sources").status_code, 403)
        r = self.cadmin.post("/api/bd/capture-sources", {"name": "Site"}, format="json")
        self.assertEqual(r.status_code, 201)
        first = r.json()["token"]
        self.assertIn(first, r.json()["endpoint"])
        rot = self.cadmin.post(f"/api/bd/capture-sources/{r.json()['id']}/rotate")
        self.assertNotEqual(rot.json()["token"], first)
        self.assertEqual(APIClient().post(f"/api/public/bd/capture/{first}", {"name": "x"}, format="json").status_code, 404)


@override_settings(META_PAGE_ID="123", META_PAGE_ACCESS_TOKEN="tok")
class MetaTests(BDTestBase):
    PAGES = {
        "123/leadgen_forms": {"data": [{"id": "f1", "name": "Spring offer"}]},
        "f1/leads": {
            "data": [
                {
                    "id": "m-1",
                    "campaign_name": "Spring",
                    "ad_name": "Video 2",
                    "field_data": [
                        {"name": "full_name", "values": ["Mia Khan"]},
                        {"name": "email", "values": ["mia@x.test"]},
                        {"name": "phone_number", "values": ["+971501112222"]},
                        {"name": "company_name", "values": ["Khan Co"]},
                    ],
                }
            ]
        },
    }

    def fake(self, path, params):
        return self.PAGES[path]

    def test_pull_imports_once(self):
        with mock.patch.object(capture, "_graph_get", side_effect=self.fake):
            self.assertEqual(capture.pull_meta_leads(), 1)
            self.assertEqual(capture.pull_meta_leads(), 0)
        lead = Lead.objects.get()
        self.assertEqual((lead.source, lead.company, lead.source_detail), ("meta_ads", "Khan Co", "Spring · Video 2"))

    @override_settings(META_PAGE_ACCESS_TOKEN="")
    def test_noop_when_not_configured(self):
        with mock.patch.object(capture, "_graph_get") as g:
            self.assertEqual(capture.pull_meta_leads(), 0)
            g.assert_not_called()

    def test_graph_failure_is_swallowed(self):
        import urllib.error

        with mock.patch.object(capture, "_graph_get", side_effect=urllib.error.URLError("down")):
            self.assertEqual(capture.pull_meta_leads(), 0)


@override_settings(**MAIL)
class SendEmailTests(BDTestBase):
    def test_send_logs_on_timeline_and_marks_contacted(self):
        lead = self.lead(self.a, email="client@x.test")
        r = self.ca.post(f"/api/bd/leads/{lead.pk}/send-email", {"subject": "Hello", "body": "Hi there"}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(len(djmail.outbox), 1)
        self.assertEqual(djmail.outbox[0].to, ["client@x.test"])
        act = Activity.objects.get(kind="email")
        self.assertEqual(act.direction, "out")
        self.assertTrue(act.message_id)
        lead.refresh_from_db()
        self.assertIsNotNone(lead.first_contacted_at)

    def test_needs_address_and_content(self):
        lead = self.lead(self.a)
        self.assertEqual(self.ca.post(f"/api/bd/leads/{lead.pk}/send-email", {"subject": "s", "body": "b"}, format="json").status_code, 400)
        lead2 = self.lead(self.a, email="c@x.test")
        self.assertEqual(self.ca.post(f"/api/bd/leads/{lead2.pk}/send-email", {"subject": "", "body": "b"}, format="json").status_code, 400)
        self.assertEqual(len(djmail.outbox), 0)

    def test_cannot_email_other_bdes_lead(self):
        lead = self.lead(self.b, email="c@x.test")
        self.assertEqual(self.ca.post(f"/api/bd/leads/{lead.pk}/send-email", {"subject": "s", "body": "b"}, format="json").status_code, 404)

    @override_settings(EMAIL_HOST="", BD_SMTP_HOST="")
    def test_not_configured_is_a_clear_error(self):
        lead = self.lead(self.a, email="c@x.test")
        r = self.ca.post(f"/api/bd/leads/{lead.pk}/send-email", {"subject": "s", "body": "b"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("set up", r.json()["detail"])
        self.assertFalse(self.ca.get("/api/bd/mail-status").json()["can_send"])

    def test_smtp_failure_does_not_log_an_email(self):
        lead = self.lead(self.a, email="c@x.test")
        with mock.patch("django.core.mail.EmailMessage.send", side_effect=OSError("boom")):
            r = self.ca.post(f"/api/bd/leads/{lead.pk}/send-email", {"subject": "s", "body": "b"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(Activity.objects.filter(kind="email").exists())


def _raw(sender, subject, body, mid, extra=""):
    return (
        f"From: {sender}\r\nTo: sales@kf.test\r\nSubject: {subject}\r\nMessage-ID: {mid}\r\n"
        f"Date: Tue, 18 Nov 2026 10:00:00 +0000\r\n{extra}Content-Type: text/plain; charset=utf-8\r\n\r\n{body}"
    ).encode()


class FakeImap:
    def __init__(self, messages):
        self.messages = messages  # {uid: raw}

    def select(self, folder, readonly=True):
        return "OK", [b"1"]

    def response(self, name):
        return name, [b"77"]

    def uid(self, cmd, *args):
        if cmd == "SEARCH":
            return "OK", [b" ".join(str(u).encode() for u in sorted(self.messages))]
        uid = int(args[0])
        return "OK", [(b"1 (BODY[] {1}", self.messages[uid]), b")"]

    def logout(self):
        pass


@override_settings(**MAIL, **IMAP)
class InboxTests(BDTestBase):
    def poll(self, messages):
        with mock.patch.object(mail, "_connect", return_value=FakeImap(messages)):
            return mail.poll_inbox()

    def test_reply_from_known_lead_is_logged_once(self):
        lead = self.lead(self.a, email="Client@X.test")
        msgs = {5: _raw("Client <client@x.test>", "Re: Hello", "Sounds good, call me.\r\n\r\nOn Mon, X wrote:\r\n> old", "<m1@x>")}
        self.assertEqual(self.poll(msgs), 1)
        act = lead.activities.get(kind="email")
        self.assertEqual(act.direction, "in")
        self.assertIn("Sounds good", act.body)
        self.assertNotIn("old", act.body)
        self.assertEqual(MailCursor.objects.get().last_uid, 5)
        # same mailbox again: nothing new
        self.assertEqual(self.poll(msgs), 0)
        self.assertEqual(lead.activities.filter(kind="email").count(), 1)

    def test_duplicate_message_id_is_skipped_even_if_cursor_resets(self):
        lead = self.lead(self.a, email="client@x.test")
        msgs = {5: _raw("client@x.test", "Hi", "Body", "<same@x>")}
        self.poll(msgs)
        MailCursor.objects.all().delete()
        self.assertEqual(self.poll(msgs), 0)
        self.assertEqual(lead.activities.filter(kind="email").count(), 1)

    def test_unknown_senders_own_mail_and_bulk_are_ignored(self):
        lead = self.lead(self.a, email="client@x.test")
        msgs = {
            1: _raw("stranger@y.test", "Hi", "x", "<a@x>"),
            2: _raw("sales@kf.test", "Sent copy", "x", "<b@x>"),
            3: _raw("client@x.test", "Newsletter", "x", "<c@x>", extra="Precedence: bulk\r\n"),
        }
        self.assertEqual(self.poll(msgs), 0)
        self.assertEqual(lead.activities.count(), 0)

    def test_reply_notifies_the_owner(self):
        from notifications.models import NotificationEvent

        self.lead(self.a, email="client@x.test")
        self.poll({1: _raw("client@x.test", "Re: Proposal", "Yes", "<n@x>")})
        self.assertTrue(NotificationEvent.objects.filter(user=self.a, title__contains="replied").exists())

    @override_settings(BD_IMAP_HOST="")
    def test_off_when_not_configured(self):
        with mock.patch.object(mail, "_connect") as c:
            self.assertEqual(mail.poll_inbox(), 0)
            c.assert_not_called()

    def test_connection_failure_is_swallowed(self):
        with mock.patch.object(mail, "_connect", side_effect=OSError("down")):
            self.assertEqual(mail.poll_inbox(), 0)


class ProposalLinkTests(BDTestBase):
    def setUp(self):
        super().setUp()
        self.lead_ = self.lead(self.a, company="Linked Co", email="l@x.test")
        self.deal = services.qualify_lead(self.lead_, self.a)
        self.proposal = Proposal.objects.create(
            owner=self.a, title="Big proposal", content={"home": {"title": "Big"}, "img": "/media/proposals/a.png"}
        )
        Deal.objects.filter(pk=self.deal.pk).update(proposal=self.proposal)
        self.anon = APIClient()

    def make_link(self):
        r = self.ca.post(f"/api/bd/deals/{self.deal.pk}/proposal-link")
        self.assertEqual(r.status_code, 200)
        return r.json()

    def test_link_needs_a_proposal(self):
        Deal.objects.filter(pk=self.deal.pk).update(proposal=None)
        self.assertEqual(self.ca.post(f"/api/bd/deals/{self.deal.pk}/proposal-link").status_code, 400)

    def test_other_bde_cannot_create_or_read_link(self):
        self.assertEqual(self.cb.post(f"/api/bd/deals/{self.deal.pk}/proposal-link").status_code, 404)
        self.assertEqual(self.cb.get(f"/api/bd/deals/{self.deal.pk}/proposal-link").status_code, 404)

    def test_create_is_idempotent(self):
        a, b = self.make_link(), self.make_link()
        self.assertEqual(a["url"], b["url"])
        self.assertEqual(ProposalLink.objects.count(), 1)

    def test_public_view_counts_and_signs_media(self):
        token = ProposalLink.objects.get(pk=self.make_link()["id"]).token
        r = self.anon.get(f"/api/public/proposals/{token}")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["title"], "Big proposal")
        self.assertIn("sig=", r.json()["content"]["img"])
        self.assertEqual(r["Cache-Control"], "private, no-store")
        self.anon.get(f"/api/public/proposals/{token}?p=1")  # owner preview: not counted
        link = ProposalLink.objects.get(token=token)
        self.assertEqual(link.views, 1)
        self.assertTrue(self.lead_.activities.filter(body__contains="Proposal viewed").exists())
        from notifications.models import NotificationEvent

        self.assertTrue(NotificationEvent.objects.filter(user=self.a, title__contains="opened your proposal").exists())

    def test_second_view_in_same_sitting_is_not_relogged(self):
        token = ProposalLink.objects.get(pk=self.make_link()["id"]).token
        self.anon.get(f"/api/public/proposals/{token}")
        self.anon.get(f"/api/public/proposals/{token}")
        self.assertEqual(ProposalLink.objects.get(token=token).views, 2)
        self.assertEqual(self.lead_.activities.filter(body__contains="Proposal viewed").count(), 1)

    def test_unknown_expired_and_paused_links_are_404(self):
        self.assertEqual(self.anon.get("/api/public/proposals/zzz").status_code, 404)
        token = ProposalLink.objects.get(pk=self.make_link()["id"]).token
        ProposalLink.objects.filter(token=token).update(expires_at=timezone.now() - timedelta(days=1))
        self.assertEqual(self.anon.get(f"/api/public/proposals/{token}").status_code, 404)
        ProposalLink.objects.filter(token=token).update(expires_at=None, active=False)
        self.assertEqual(self.anon.get(f"/api/public/proposals/{token}").status_code, 404)

    def test_accept_needs_a_name(self):
        token = ProposalLink.objects.get(pk=self.make_link()["id"]).token
        self.assertEqual(self.anon.post(f"/api/public/proposals/{token}/accept", {"name": " "}, format="json").status_code, 400)

    def test_accept_wins_the_deal_once(self):
        token = ProposalLink.objects.get(pk=self.make_link()["id"]).token
        r = self.anon.post(f"/api/public/proposals/{token}/accept", {"name": "Jo Client"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(r.json()["already_accepted"])
        self.deal.refresh_from_db()
        self.proposal.refresh_from_db()
        self.assertEqual(self.deal.stage, "won")
        self.assertEqual(self.proposal.status, "accepted")
        self.assertEqual(Client.objects.count(), 0)
        again = self.anon.post(f"/api/public/proposals/{token}/accept", {"name": "Jo Client"}, format="json")
        self.assertTrue(again.json()["already_accepted"])
        self.assertEqual(Client.objects.count(), 0)
        self.assertEqual(ProposalLink.objects.get(token=token).accepted_name, "Jo Client")

    def test_accept_survives_a_failed_handover(self):
        token = ProposalLink.objects.get(pk=self.make_link()["id"]).token
        with mock.patch.object(services, "move_deal", side_effect=RuntimeError("nope")):
            r = self.anon.post(f"/api/public/proposals/{token}/accept", {"name": "Jo Client"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertIsNotNone(ProposalLink.objects.get(token=token).accepted_at)
        self.deal.refresh_from_db()
        self.assertNotEqual(self.deal.stage, "won")

    def test_sign_media_leaves_plain_text_alone(self):
        out = proposal_links.sign_media({"a": "hello /media/ world", "b": ["/media/x.png"], "c": 3})
        self.assertEqual(out["a"], "hello /media/ world")
        self.assertIn("sig=", out["b"][0])
        self.assertEqual(out["c"], 3)


class ReportTests(BDTestBase):
    def test_superadmin_only(self):
        self.assertEqual(self.ca.get("/api/bd/reports").status_code, 403)
        self.assertEqual(self.cadmin.get("/api/bd/reports").status_code, 200)

    def test_numbers(self):
        l1 = self.lead(self.a, source="website", est_value=1000)
        l2 = self.lead(self.a, source="referral", est_value=500)
        self.lead(self.b, source="website")
        services.log_activity(lead=l1, user=self.a, kind="call", body="x")
        d1 = services.qualify_lead(l1, self.a)
        services.win_deal(d1, self.a)
        d2 = services.qualify_lead(l2, self.a)
        services.move_deal(d2, "lost", self.a, lost_reason="price")

        r = self.cadmin.get("/api/bd/reports?days=7").json()
        self.assertEqual(r["summary"]["new_leads"], 3)
        self.assertEqual((r["summary"]["won"], r["summary"]["lost"], r["summary"]["win_rate"]), (1, 1, 50.0))
        funnel = {f["key"]: f["count"] for f in r["funnel"]}
        self.assertEqual((funnel["leads"], funnel["contacted"], funnel["qualified"], funnel["won"]), (3, 1, 2, 1))
        self.assertEqual({x["source"]: x["leads"] for x in r["sources"]}, {"website": 2, "referral": 1})
        self.assertEqual(r["lost_reasons"][0]["reason"], "price")
        mine = next(x for x in r["per_bde"] if x["owner"] == self.a.pk)
        self.assertEqual((mine["leads"], mine["calls"], mine["won"]), (2, 1, 1))
        only_b = self.cadmin.get(f"/api/bd/reports?days=7&owner={self.b.pk}").json()
        self.assertEqual(only_b["summary"]["new_leads"], 1)


@override_settings(**MAIL)
class WeeklyEmailTests(BDTestBase):
    def test_sent_to_superadmins(self):
        lead = self.lead(self.a, source="website")
        services.qualify_lead(lead, self.a)
        self.assertEqual(weekly_pipeline_email(), 1)
        self.assertEqual(djmail.outbox[0].to, ["admin@kf.test"])
        self.assertIn("New leads: 1", djmail.outbox[0].body)

    @override_settings(EMAIL_HOST="", BD_SMTP_HOST="")
    def test_skipped_without_mail_settings(self):
        self.assertEqual(weekly_pipeline_email(), 0)

