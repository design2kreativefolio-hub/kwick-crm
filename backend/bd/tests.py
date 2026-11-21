"""Acceptance tests for the Business Development module (spec §10)."""
import io
from datetime import datetime, timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import ModuleAccess, Role, User, UserStatus
from bd import services
from bd.models import Activity, Deal, FollowUp, Lead
from sales.models import Client, Estimate, Invoice, Proposal


def make_user(email, *, role=Role.EMPLOYEE, grants=()):
    user = User.objects.create_user(email, "pw-12345678", full_name=email.split("@")[0].title())
    user.role = role
    user.status = UserStatus.ACTIVE
    user.save()
    for module in grants:
        ModuleAccess.objects.create(user=user, module=module)
    return user


def api_for(user):
    client = APIClient()
    client.force_authenticate(user)
    return client


class BDTestBase(TestCase):
    def setUp(self):
        self.admin = make_user("admin@kf.test", role=Role.SUPERADMIN)
        self.a = make_user("a@kf.test", grants=["bd", "sales_proposals"])
        self.b = make_user("b@kf.test", grants=["bd", "sales_proposals"])
        self.ca, self.cb, self.cadmin = api_for(self.a), api_for(self.b), api_for(self.admin)

    def lead(self, owner, **kw):
        kw.setdefault("company", "Acme")
        return Lead.objects.create(owner=owner, **kw)


class IsolationTests(BDTestBase):
    """BDE A gets 404 on BDE B's records; BDEs never reach invoices."""

    def test_404_on_other_bdes_records(self):
        lead = self.lead(self.b, phone="0501110000")
        deal = services.qualify_lead(lead, self.b)
        activity = services.log_activity(lead=lead, user=self.b, kind="note", body="hi")
        fu = services.create_follow_up(lead=lead, owner=self.b, due_at=timezone.now())
        proposal = Proposal.objects.create(owner=self.b, title="B proposal")
        estimate = Estimate.objects.create(owner=self.b, title="B estimate")

        for url in (
            f"/api/bd/leads/{lead.pk}",
            f"/api/bd/deals/{deal.pk}",
            f"/api/bd/activities/{activity.pk}",
            f"/api/bd/follow-ups/{fu.pk}",
            f"/api/sales/proposals/{proposal.pk}",
            f"/api/sales/estimates/{estimate.pk}",
        ):
            self.assertEqual(self.ca.get(url).status_code, 404, url)
            self.assertEqual(self.cb.get(url).status_code, 200, url)
            self.assertEqual(self.cadmin.get(url).status_code, 200, url)

    def test_other_bde_cannot_write_to_lead(self):
        lead = self.lead(self.b)
        r = self.ca.post("/api/bd/activities", {"lead": lead.pk, "kind": "note", "body": "x"}, format="json")
        self.assertEqual(r.status_code, 404)
        r = self.ca.post(f"/api/bd/leads/{lead.pk}/qualify", {}, format="json")
        self.assertEqual(r.status_code, 404)

    def test_lists_only_show_own(self):
        self.lead(self.a, company="Mine")
        self.lead(self.b, company="Theirs")
        names = [x["company"] for x in self.ca.get("/api/bd/leads").json()["results"]]
        self.assertEqual(names, ["Mine"])
        self.assertEqual(len(self.cadmin.get("/api/bd/leads").json()["results"]), 2)

    def test_proposals_scoped_only_for_bdes(self):
        legacy = Proposal.objects.create(title="Legacy (no owner)")
        mine = Proposal.objects.create(owner=self.a, title="Mine")
        ids_a = {p["id"] for p in self.ca.get("/api/sales/proposals").json()["results"]}
        self.assertEqual(ids_a, {mine.pk})
        # A plain Sales employee (not a BDE) keeps the old company-wide view.
        sales_only = make_user("s@kf.test", grants=["sales_proposals"])
        ids_s = {p["id"] for p in api_for(sales_only).get("/api/sales/proposals").json()["results"]}
        self.assertEqual(ids_s, {legacy.pk, mine.pk})

    def test_new_proposal_records_owner(self):
        r = self.ca.post("/api/sales/proposals", {"content": {}}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(Proposal.objects.get(pk=r.json()["id"]).owner, self.a)

    def test_bde_has_no_invoice_access(self):
        inv = Invoice.objects.create(invoice_number="INV-1")
        self.assertEqual(self.ca.get("/api/sales/invoices").status_code, 403)
        self.assertEqual(self.ca.get(f"/api/sales/invoices/{inv.pk}").status_code, 403)
        self.assertEqual(self.ca.post("/api/sales/invoices", {}, format="json").status_code, 403)

    def test_no_bd_grant_means_no_access(self):
        nobody = make_user("n@kf.test", grants=["sales_proposals"])
        self.assertEqual(api_for(nobody).get("/api/bd/leads").status_code, 403)
        self.assertEqual(api_for(nobody).get("/api/bd/my-day").status_code, 403)

    def test_bde_cannot_attach_someone_elses_proposal(self):
        lead = self.lead(self.a)
        deal = services.qualify_lead(lead, self.a)
        theirs = Proposal.objects.create(owner=self.b)
        mine = Proposal.objects.create(owner=self.a)
        self.assertEqual(
            self.ca.patch(f"/api/bd/deals/{deal.pk}", {"proposal": theirs.pk}, format="json").status_code, 400
        )
        self.assertEqual(
            self.ca.patch(f"/api/bd/deals/{deal.pk}", {"proposal": mine.pk}, format="json").status_code, 200
        )

    def test_reassign_is_superadmin_only_and_moves_everything(self):
        lead = self.lead(self.a)
        deal = services.qualify_lead(lead, self.a)
        proposal = Proposal.objects.create(owner=self.a)
        deal.proposal = proposal
        deal.save()
        fu = services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now())
        body = {"lead_ids": [lead.pk], "owner": self.b.pk}
        self.assertEqual(self.ca.post("/api/bd/leads/reassign", body, format="json").status_code, 403)
        self.assertEqual(self.cadmin.post("/api/bd/leads/reassign", body, format="json").status_code, 200)
        lead.refresh_from_db()
        deal.refresh_from_db()
        fu.refresh_from_db()
        proposal.refresh_from_db()
        self.assertEqual((lead.owner, deal.owner, fu.owner, proposal.owner), (self.b,) * 4)
        self.assertEqual(self.ca.get(f"/api/bd/leads/{lead.pk}").status_code, 404)

    def test_leads_can_be_deleted_by_their_owner_or_the_admin_only(self):
        lead = self.lead(self.a)
        self.assertEqual(self.cb.delete(f"/api/bd/leads/{lead.pk}").status_code, 404)  # another BDE can't even see it
        self.assertEqual(self.ca.delete(f"/api/bd/leads/{lead.pk}").status_code, 204)
        other = self.lead(self.a)
        self.assertEqual(self.cadmin.delete(f"/api/bd/leads/{other.pk}").status_code, 204)


class DuplicateTests(BDTestBase):
    def test_phone_formats_collapse(self):
        keys = {services.normalise_phone(p) for p in ("050 123 4567", "+971501234567", "00971501234567", "501234567")}
        self.assertEqual(keys, {"971501234567"})

    def test_website_domain(self):
        self.assertEqual(services.website_domain("https://www.Acme.com/about?x=1"), "acme.com")
        self.assertEqual(services.website_domain("instagram.com/acme"), "")

    def test_create_blocks_phone_duplicate_without_leaking_details(self):
        self.lead(self.b, company="Secret Co", phone="+971501234567")
        r = self.ca.post("/api/bd/leads", {"company": "New", "phone": "050 123 4567"}, format="json")
        self.assertEqual(r.status_code, 409)
        body = r.json()
        self.assertFalse(body["can_override"])
        match = body["duplicates"][0]
        self.assertEqual(match["scope"], "other_bde")
        self.assertNotIn("name", match)
        self.assertNotIn("lead_id", match)
        self.assertNotIn("Secret", r.content.decode())

    def test_own_duplicate_gives_link(self):
        mine = self.lead(self.a, email="x@acme.com")
        r = self.ca.post("/api/bd/leads", {"company": "Again", "email": "X@Acme.com"}, format="json")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["duplicates"][0]["lead_id"], mine.pk)

    def test_existing_client_is_a_duplicate(self):
        Client.objects.create(client_id="KF0001AA", name="Old Client", contact_email="hi@old.com")
        r = self.ca.post("/api/bd/leads", {"company": "Old", "email": "hi@old.com"}, format="json")
        self.assertEqual(r.status_code, 409)
        self.assertEqual(r.json()["duplicates"][0]["scope"], "client")
        self.assertNotIn("Old Client", r.content.decode())

    def test_website_match_is_overridable(self):
        self.lead(self.a, website="acme.com")
        payload = {"company": "Acme UK", "website": "https://acme.com"}
        r = self.ca.post("/api/bd/leads", payload, format="json")
        self.assertEqual(r.status_code, 409)
        self.assertTrue(r.json()["can_override"])
        r = self.ca.post("/api/bd/leads", {**payload, "confirm_duplicate": True}, format="json")
        self.assertEqual(r.status_code, 201)

    def test_check_duplicate_endpoint(self):
        self.lead(self.b, phone="0509998888")
        r = self.ca.post("/api/bd/leads/check-duplicate", {"phone": "+971509998888"}, format="json")
        self.assertEqual(len(r.json()["duplicates"]), 1)


class LeadFlowTests(BDTestBase):
    def test_create_assigns_to_bde_and_logs_note(self):
        r = self.ca.post(
            "/api/bd/leads",
            {"company": "Acme", "phone": "0501112222", "source": "meta_ads", "note": "Asked for a quote", "services": ["branding", "bogus"]},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        lead = Lead.objects.get(pk=r.json()["id"])
        self.assertEqual(lead.owner, self.a)
        self.assertEqual(lead.services, ["branding"])
        self.assertEqual(lead.activities.count(), 1)
        self.assertEqual(lead.status, Lead.Status.NEW)
        self.assertIsNone(r.json()["deal"])

    def test_needs_a_name(self):
        r = self.ca.post("/api/bd/leads", {"phone": "0501112222"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_bde_cannot_change_owner_or_status_by_patch(self):
        lead = self.lead(self.a)
        self.ca.patch(f"/api/bd/leads/{lead.pk}", {"owner": self.b.pk, "status": "converted"}, format="json")
        lead.refresh_from_db()
        self.assertEqual((lead.owner, lead.status), (self.a, Lead.Status.NEW))

    def test_round_robin_alternates_between_bdes(self):
        first = services.pick_owner()
        Lead.objects.create(owner=first, company="x")
        second = services.pick_owner()
        self.assertNotEqual(first, second)
        Lead.objects.create(owner=second, company="y")
        self.assertEqual(services.pick_owner(), first)

    def test_single_bde_gets_everything_and_admin_is_fallback(self):
        ModuleAccess.objects.filter(user=self.b).delete()
        self.assertEqual(services.pick_owner(), self.a)
        ModuleAccess.objects.filter(user=self.a).delete()
        self.assertEqual(services.pick_owner(), self.admin)

    def test_first_outreach_marks_contacted_once(self):
        lead = self.lead(self.a)
        services.log_activity(lead=lead, user=self.a, kind="note", body="thinking")
        lead.refresh_from_db()
        self.assertIsNone(lead.first_contacted_at)
        self.assertEqual(lead.status, Lead.Status.NEW)
        services.log_activity(lead=lead, user=self.a, kind="call", outcome="connected")
        lead.refresh_from_db()
        self.assertIsNotNone(lead.first_contacted_at)
        self.assertEqual(lead.status, Lead.Status.CONTACTED)

    def test_log_activity_with_next_follow_up(self):
        lead = self.lead(self.a)
        due = (timezone.now() + timedelta(days=2)).isoformat()
        r = self.ca.post(
            "/api/bd/activities",
            {"lead": lead.pk, "kind": "call", "outcome": "callback", "body": "call back Thu",
             "next_follow_up": {"due_at": due, "note": "Call back"}},
            format="json",
        )
        self.assertEqual(r.status_code, 201, r.content)
        lead.refresh_from_db()
        self.assertEqual(lead.next_follow_up_at.isoformat()[:16], due[:16].replace("T", "T"))
        self.assertEqual(lead.status, Lead.Status.CONTACTED)

    def test_system_kinds_cannot_be_logged_by_hand(self):
        lead = self.lead(self.a)
        r = self.ca.post("/api/bd/activities", {"lead": lead.pk, "kind": "stage_change", "body": "x"}, format="json")
        self.assertEqual(r.status_code, 400)

    def test_disqualify_needs_reason(self):
        lead = self.lead(self.a)
        self.assertEqual(self.ca.post(f"/api/bd/leads/{lead.pk}/disqualify", {}, format="json").status_code, 400)
        r = self.ca.post(f"/api/bd/leads/{lead.pk}/disqualify", {"reason": "Student project"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["status"], "disqualified")
        r = self.ca.post(f"/api/bd/leads/{lead.pk}/reopen", {}, format="json")
        self.assertEqual(r.json()["status"], "new")


class PipelineTests(BDTestBase):
    def test_board_moves_lead_through_every_stage(self):
        lead = self.lead(self.a, est_value="1000", currency="USD")
        move = lambda stage, **kw: self.ca.post(f"/api/bd/leads/{lead.pk}/move", {"stage": stage, **kw}, format="json")
        self.assertEqual(move("contacted").json()["status"], "contacted")
        r = move("meeting")
        self.assertEqual(r.status_code, 200, r.content)
        deal = Deal.objects.get(lead=lead)
        self.assertEqual((deal.stage, deal.probability), ("meeting", 40))
        self.assertEqual(move("negotiation").status_code, 200)
        deal.refresh_from_db()
        self.assertEqual(deal.probability, 80)
        # a deal can't go back to being a lead
        self.assertEqual(move("new").status_code, 400)

    def test_lost_requires_reason_and_schedules_recontact(self):
        lead = self.lead(self.a)
        deal = services.qualify_lead(lead, self.a)
        url = f"/api/bd/deals/{deal.pk}/move"
        self.assertEqual(self.ca.post(url, {"stage": "lost"}, format="json").status_code, 400)
        self.assertEqual(
            self.ca.post(url, {"stage": "lost", "lost_reason": "other"}, format="json").status_code, 400
        )
        r = self.ca.post(url, {"stage": "lost", "lost_reason": "price"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        deal.refresh_from_db()
        self.assertEqual((deal.stage, deal.probability), ("lost", 0))
        fu = FollowUp.objects.get(lead=lead, kind="recontact")
        days = (fu.due_at - timezone.now()).days
        self.assertIn(days, (89, 90))
        # re-opening removes the pending recontact reminder
        self.assertEqual(self.ca.post(f"/api/bd/leads/{lead.pk}/reopen", {}, format="json").status_code, 200)
        self.assertFalse(FollowUp.objects.filter(lead=lead, kind="recontact").exists())
        deal.refresh_from_db()
        self.assertEqual(deal.stage, "qualified")

    def test_pipeline_totals_are_in_aed(self):
        l1 = self.lead(self.a, est_value="1000", currency="USD", company="One")
        l2 = self.lead(self.a, est_value="500", currency="AED", company="Two")
        services.qualify_lead(l1, self.a)  # 1000 USD -> 3672.50 AED
        r = self.ca.get("/api/bd/pipeline").json()
        cols = {c["key"]: c for c in r["columns"]}
        # the board starts at Qualified; unqualified leads stay on the Leads page
        self.assertEqual([c["key"] for c in r["columns"]][0], "qualified")
        self.assertNotIn("new", cols)
        self.assertNotIn("contacted", cols)
        self.assertEqual(cols["qualified"]["total_aed"], "3672.50")
        self.assertEqual(cols["qualified"]["cards"][0]["kind"], "deal")
        self.assertEqual(r["open_total_aed"], "3672.50")

    def test_pipeline_is_scoped(self):
        self.lead(self.b, company="Theirs")
        r = self.ca.get("/api/bd/pipeline").json()
        self.assertEqual(sum(c["count"] for c in r["columns"]), 0)


class WinHandoverTests(BDTestBase):
    """Winning is light: it creates no client, invoice, project or renewal by itself.
    The admin adds the client by hand and drafts the invoice from the deal on request."""

    def _deal(self, **lead_kw):
        lead = self.lead(self.a, contact_name="Sara", phone="0501234567", email="sara@acme.com",
                         services=["branding"], est_value="5000", **lead_kw)
        deal = services.qualify_lead(lead, self.a)
        return lead, deal

    def test_win_creates_nothing_automatically(self):
        from projects.models import Project
        from renewals.models import Renewal

        lead, deal = self._deal()
        proposal = Proposal.objects.create(owner=self.a, status="sent", content={"home": {}})
        deal.proposal = proposal
        deal.save()
        url = f"/api/bd/deals/{deal.pk}/win"
        self.assertEqual(self.ca.post(url, {}, format="json").status_code, 200)
        self.assertEqual(self.ca.post(url, {}, format="json").status_code, 200)  # double click is harmless

        self.assertEqual((Client.objects.count(), Invoice.objects.count(), Project.objects.count(), Renewal.objects.count()), (0, 0, 0, 0))
        deal.refresh_from_db(), lead.refresh_from_db(), proposal.refresh_from_db()
        self.assertEqual((deal.stage, deal.client, lead.status), ("won", None, "converted"))
        self.assertEqual(proposal.status, "accepted")

    def test_win_notifies_admin(self):
        from notifications.models import NotificationEvent

        _, deal = self._deal()
        self.assertEqual(self.ca.post(f"/api/bd/deals/{deal.pk}/win", {}, format="json").status_code, 200)
        self.assertTrue(NotificationEvent.objects.filter(user=self.admin, source="bd").exists())

    def test_win_can_link_an_existing_client(self):
        existing = Client.objects.create(client_id="KF9999ZZ", name="Existing")
        _, deal = self._deal()
        r = self.ca.post(f"/api/bd/deals/{deal.pk}/win", {"client_id": existing.pk}, format="json")
        self.assertEqual(r.status_code, 200)
        deal.refresh_from_db()
        self.assertEqual(deal.client, existing)
        self.assertEqual((Client.objects.count(), Invoice.objects.count()), (1, 0))

    def test_invoice_is_only_drafted_on_request_after_the_client_is_linked(self):
        estimate = Estimate.objects.create(
            owner=self.a, status="sent",
            content={"currency": "AED", "bill_to": "", "items": [{"description": "Logo", "qty": 2, "rate": 1500}], "vat_enabled": True, "vat_percent": 5},
        )
        _, deal = self._deal()
        deal.estimate = estimate
        deal.save()
        services.win_deal(deal, self.a)
        url = f"/api/bd/deals/{deal.pk}/create-invoice"
        # a BDE can't (invoices are Sales / admin only)
        self.assertEqual(self.ca.post(url).status_code, 403)
        # no client yet
        r = self.cadmin.post(url)
        self.assertEqual(r.status_code, 400)
        self.assertIn("client", r.json()["detail"].lower())
        # link the client, then draft
        client = Client.objects.create(client_id="KF0001AA", name="Acme")
        link = self.cadmin.post(f"/api/bd/deals/{deal.pk}/link-client", {"client_id": client.pk}, format="json")
        self.assertEqual((link.status_code, link.json()["client_code"]), (200, "KF0001AA"))
        self.assertEqual(self.cadmin.post(url).status_code, 200)
        invoice = Invoice.objects.get()
        self.assertEqual((invoice.client, invoice.status), (client, "draft"))
        self.assertEqual(str(invoice.amount), "3150.00")  # 2 x 1500 + 5% VAT
        estimate.refresh_from_db()
        self.assertEqual(estimate.client, client)
        # only once
        self.assertEqual(self.cadmin.post(url).status_code, 400)
        self.assertEqual(Invoice.objects.count(), 1)

    def test_link_client_needs_a_won_deal_and_the_admin(self):
        client = Client.objects.create(client_id="KF0002BB", name="Beta")
        _, deal = self._deal()
        url = f"/api/bd/deals/{deal.pk}/link-client"
        self.assertEqual(self.ca.post(url, {"client_id": client.pk}, format="json").status_code, 403)
        self.assertEqual(self.cadmin.post(url, {"client_id": client.pk}, format="json").status_code, 400)  # not won yet

    def test_win_through_board_move_and_back_again(self):
        lead, deal = self._deal()
        fu = services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now() + timedelta(days=1))
        r = self.ca.post(f"/api/bd/leads/{lead.pk}/move", {"stage": "won"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(Client.objects.count(), 0)
        fu.refresh_from_db()
        self.assertIsNotNone(fu.done_at)

        # a won deal can be moved back to an open stage
        r = self.ca.post(f"/api/bd/deals/{deal.pk}/move", {"stage": "negotiation"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        deal.refresh_from_db(), lead.refresh_from_db(), fu.refresh_from_db()
        self.assertEqual((deal.stage, deal.probability, lead.status), ("negotiation", 80, "qualified"))
        self.assertIsNone(deal.won_at)
        self.assertIsNone(fu.done_at)  # its reminder is back
        # ...but not straight to Lost
        services.win_deal(deal, self.a)
        self.assertEqual(self.ca.post(f"/api/bd/deals/{deal.pk}/move", {"stage": "lost", "lost_reason": "price"}, format="json").status_code, 400)

    def test_moving_back_keeps_an_existing_client_and_invoice(self):
        client = Client.objects.create(client_id="KF0003CC", name="Gamma")
        _, deal = self._deal()
        services.win_deal(deal, self.a)
        services.link_client(deal, client)
        services.create_deal_invoice(deal, self.admin)
        deal.refresh_from_db()
        services.move_deal(deal, "meeting", self.a)
        deal.refresh_from_db()
        self.assertEqual((deal.stage, deal.client, Invoice.objects.count()), ("meeting", client, 1))

    def test_win_closes_open_follow_ups(self):
        lead, deal = self._deal()
        fu = services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now() + timedelta(days=1))
        services.win_deal(deal, self.a)
        fu.refresh_from_db()
        lead.refresh_from_db()
        self.assertIsNotNone(fu.done_at)
        self.assertIsNone(lead.next_follow_up_at)


class FollowUpAndAlertTests(BDTestBase):
    def test_follow_up_push_fires_once_when_due_and_stops_when_done(self):
        from bd import tasks
        from notifications.models import NotificationEvent

        lead = self.lead(self.a)
        due = services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now() - timedelta(minutes=1), note="Ring")
        later = services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now() + timedelta(hours=3))
        with mock.patch("notifications.tasks.deliver_notification.delay"):
            self.assertEqual(tasks.follow_up_alerts()["sent"], 1)
            self.assertEqual(tasks.follow_up_alerts()["sent"], 0)  # not re-sent
        due.refresh_from_db(), later.refresh_from_db()
        self.assertIsNotNone(due.notified_at)
        self.assertIsNone(later.notified_at)
        self.assertEqual(NotificationEvent.objects.filter(user=self.a, source="bd").count(), 1)

    def test_done_follow_up_never_fires(self):
        from bd import tasks

        lead = self.lead(self.a)
        fu = services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now() - timedelta(minutes=1))
        services.complete_follow_up(fu)
        with mock.patch("notifications.tasks.deliver_notification.delay"):
            self.assertEqual(tasks.follow_up_alerts()["sent"], 0)

    def test_complete_endpoint_updates_next_follow_up(self):
        lead = self.lead(self.a)
        first = services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now() + timedelta(days=1))
        second = services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now() + timedelta(days=3))
        lead.refresh_from_db()
        self.assertEqual(lead.next_follow_up_at, first.due_at)
        self.assertEqual(self.ca.post(f"/api/bd/follow-ups/{first.pk}/complete").status_code, 200)
        lead.refresh_from_db()
        self.assertEqual(lead.next_follow_up_at, second.due_at)

    def test_working_minutes_skips_nights_and_sundays(self):
        tz = services.DUBAI
        # Sat 17:00 -> Mon 10:00 Dubai = 1h Saturday + 1h Monday (Sunday off, nights off)
        sat = datetime(2026, 11, 14, 17, 0, tzinfo=tz)
        mon = datetime(2026, 11, 16, 10, 0, tzinfo=tz)
        self.assertEqual(services.working_minutes(sat, mon), 120)
        self.assertEqual(services.working_minutes(mon, sat), 0)

    def test_response_alerts_owner_at_2h_then_admin_at_4h(self):
        from bd import tasks
        from notifications.models import NotificationEvent

        lead = self.lead(self.a, company="Hot lead")
        with mock.patch("notifications.tasks.deliver_notification.delay"), mock.patch.object(
            services, "working_minutes"
        ) as wm:
            wm.return_value = 60
            tasks.response_time_alerts()
            self.assertEqual(NotificationEvent.objects.count(), 0)
            wm.return_value = 130
            tasks.response_time_alerts()
            tasks.response_time_alerts()
            self.assertEqual(NotificationEvent.objects.filter(user=self.a).count(), 1)
            self.assertEqual(NotificationEvent.objects.filter(user=self.admin).count(), 0)
            wm.return_value = 250
            tasks.response_time_alerts()
            self.assertEqual(NotificationEvent.objects.filter(user=self.admin).count(), 1)
            tasks.response_time_alerts()
            self.assertEqual(NotificationEvent.objects.filter(user=self.admin).count(), 1)
        lead.refresh_from_db()
        self.assertIsNotNone(lead.admin_alerted_at)

    def test_contacted_lead_gets_no_response_alert(self):
        from bd import tasks
        from notifications.models import NotificationEvent

        lead = self.lead(self.a)
        services.log_activity(lead=lead, user=self.a, kind="call")
        with mock.patch.object(services, "working_minutes", return_value=500):
            tasks.response_time_alerts()
        self.assertEqual(NotificationEvent.objects.count(), 0)

    def test_stale_deal_nudge_and_cleared_by_activity(self):
        from bd import tasks
        from notifications.models import NotificationEvent

        lead = self.lead(self.a)
        deal = services.qualify_lead(lead, self.a)
        old = timezone.now() - timedelta(days=6)
        Lead.objects.filter(pk=lead.pk).update(last_activity_at=old)
        Deal.objects.filter(pk=deal.pk).update(stage_changed_at=old)
        with mock.patch("notifications.tasks.deliver_notification.delay"):
            self.assertEqual(tasks.stale_deal_alerts()["nudged"], 1)
            tasks.stale_deal_alerts()  # next day: same row, not a pile-up
        self.assertEqual(NotificationEvent.objects.filter(object_ref=f"bd-stale:{deal.pk}").count(), 1)
        lead.refresh_from_db()
        services.log_activity(lead=lead, user=self.a, kind="call", outcome="connected")
        self.assertFalse(NotificationEvent.objects.get(object_ref=f"bd-stale:{deal.pk}").active)
        with mock.patch("notifications.tasks.deliver_notification.delay"):
            self.assertEqual(tasks.stale_deal_alerts()["nudged"], 0)

    def test_my_day_buckets(self):
        lead = self.lead(self.a, company="Overdue Co")
        services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now() - timedelta(days=2), note="old")
        lead2 = self.lead(self.a, company="Today Co")
        today_noon = timezone.localtime().replace(hour=23, minute=0)
        services.create_follow_up(lead=lead2, owner=self.a, due_at=today_noon, kind="meeting")
        self.lead(self.b, company="Not mine")
        r = self.ca.get("/api/bd/my-day").json()
        self.assertEqual(r["counts"]["overdue"], 1)
        self.assertEqual(r["overdue"][0]["lead_name"], "Overdue Co")
        self.assertGreaterEqual(r["counts"]["new_leads"], 2)
        self.assertNotIn("Not mine", str(r))

    def test_digest_only_for_bdes_with_something_to_do(self):
        from bd import tasks
        from notifications.models import NotificationEvent

        self.lead(self.a)
        with mock.patch("notifications.tasks.deliver_notification.delay"), mock.patch.object(
            tasks.timezone, "localtime", return_value=datetime(2026, 11, 17, 9, 0, tzinfo=services.DUBAI)
        ):
            tasks.my_day_digest()
            tasks.my_day_digest()
        events = NotificationEvent.objects.filter(source="bd")
        self.assertEqual(events.count(), 1)
        self.assertEqual(events[0].user, self.a)


class CalendarTests(BDTestBase):
    def test_follow_ups_and_meetings_show_on_calendar(self):
        lead = self.lead(self.a, company="Cal Co")
        services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now(), kind="meeting", meeting_url="https://meet.google.com/abc")
        services.create_follow_up(lead=self.lead(self.b), owner=self.b, due_at=timezone.now())
        today = timezone.localdate().isoformat()
        mine = [i for i in self.ca.get(f"/api/calendar/agenda?from={today}&to={today}").json()["items"] if i["source"] == "bd"]
        self.assertEqual(len(mine), 1)
        self.assertEqual(mine[0]["meta"]["lead"], lead.pk)
        self.assertEqual(mine[0]["meta"]["meeting_url"], "https://meet.google.com/abc")
        admin = [i for i in self.cadmin.get(f"/api/calendar/agenda?from={today}&to={today}").json()["items"] if i["source"] == "bd"]
        self.assertEqual(len(admin), 2)

    def test_non_bd_user_sees_no_bd_items(self):
        other = make_user("o@kf.test")
        lead = self.lead(self.a)
        services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now())
        today = timezone.localdate().isoformat()
        items = api_for(other).get(f"/api/calendar/agenda?from={today}&to={today}").json()["items"]
        self.assertFalse([i for i in items if i["source"] == "bd"])


class ImportTests(BDTestBase):
    CSV = (
        "Company,Contact Person,Mobile,Email,Website,Lead Source,Budget,Services\n"
        "Acme Trading,Sara,050 123 4567,sara@acme.com,www.acme.com,Facebook ads,\"AED 5,000\",Branding & logo\n"
        "Beta LLC,Omar,+971 55 987 6543,,,Referral,,Website\n"
        "Gamma,,,,,,,\n"
        ",,,,,,,\n"
        "Acme Again,Sara,0501234567,,,,,\n"
    )

    def _post(self, client, commit=False, csv=None, **extra):
        f = io.BytesIO((csv or self.CSV).encode())
        f.name = "leads.csv"
        return client.post("/api/bd/leads/import", {"file": f, "commit": "1" if commit else "0", **extra}, format="multipart")

    def test_preview_guesses_mapping_and_flags_duplicates(self):
        r = self._post(self.ca)
        self.assertEqual(r.status_code, 200, r.content)
        body = r.json()
        self.assertEqual(body["mapping"]["company"], "Company")
        self.assertEqual(body["mapping"]["phone"], "Mobile")
        self.assertEqual(body["mapping"]["est_value"], "Budget")
        self.assertEqual(body["mapping"]["source"], "Lead Source")
        # 3 real rows + the repeated phone; blank row is dropped before counting
        self.assertEqual(body["summary"], {"total": 4, "ok": 3, "duplicates": 1, "skipped": 0})
        self.assertEqual(Lead.objects.count(), 0)  # preview stores nothing

    def test_commit_then_reimport_creates_nothing(self):
        r = self._post(self.ca, commit=True)
        self.assertEqual(r.json()["summary"]["created"], 3)
        self.assertEqual(Lead.objects.count(), 3)
        again = self._post(self.ca, commit=True).json()
        self.assertEqual(again["summary"]["created"], 0)
        self.assertEqual(Lead.objects.count(), 3)  # importing the same sheet twice = no duplicates

    def test_imported_values_are_parsed(self):
        self._post(self.ca, commit=True)
        acme = Lead.objects.get(company="Acme Trading")
        self.assertEqual((acme.source, str(acme.est_value), acme.currency, acme.owner), ("meta_ads", "5000.00", "AED", self.a))
        self.assertEqual(acme.services, ["branding", "graphic_design"])
        self.assertEqual(Lead.objects.get(company="Beta LLC").source, "referral")

    def test_import_skips_existing_clients_and_other_bdes_leads(self):
        Client.objects.create(client_id="KF1111AA", name="Acme Trading", contact_email="sara@acme.com")
        Lead.objects.create(owner=self.b, company="B owns", phone="+971559876543")
        body = self._post(self.ca, commit=True).json()
        self.assertEqual(body["summary"]["created"], 1)  # only Gamma is new

    def test_superadmin_import_round_robins(self):
        self._post(self.cadmin, commit=True)
        owners = set(Lead.objects.values_list("owner__email", flat=True))
        self.assertEqual(owners, {"a@kf.test", "b@kf.test"})

    def test_rejects_non_spreadsheets_and_unmappable_sheets(self):
        f = io.BytesIO(b"hello")
        f.name = "x.exe"
        self.assertEqual(self.ca.post("/api/bd/leads/import", {"file": f}, format="multipart").status_code, 400)
        r = self._post(self.ca, csv="Foo,Bar\n1,2\n")
        self.assertEqual(r.status_code, 400)

    def test_xlsx_import(self):
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(["Business Name", "Phone", "Email"])
        ws.append(["Delta Co", 971501110000, "d@delta.com"])
        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        buf.name = "leads.xlsx"
        r = self.ca.post("/api/bd/leads/import", {"file": buf, "commit": "1"}, format="multipart")
        self.assertEqual(r.json()["summary"]["created"], 1, r.content)
        self.assertEqual(Lead.objects.get().phone, "971501110000")
