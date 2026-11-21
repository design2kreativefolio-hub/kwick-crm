"""Spreadsheet import: picks the real lead sheet, keeps links, ignores filler."""
import io

from django.utils import timezone

from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook

from bd import importer, services
from bd.models import Lead
from bd.tests import BDTestBase

HEAD = ["#", "Company Name", "Emirate", "Area", "Phone", "WhatsApp", "Website", "Lead Priority", "Notes"]


def workbook(rows, *, summary_first=True):
    wb = Workbook()
    ws = wb.active
    if summary_first:
        ws.title = "Summary"
        ws.append(["Manufacturing leads"])
        ws.append(["Total leads", "2"])
        ws.append(["Dubai", "1"])
        data = wb.create_sheet("Leads")
    else:
        ws.title = "Leads"
        data = ws
    data.append(HEAD)
    for r in rows:
        data.append(r)
    return wb


def upload(wb, name="leads.xlsx"):
    buf = io.BytesIO()
    wb.save(buf)
    return SimpleUploadedFile(name, buf.getvalue())


ROWS = [
    [1, "Golden Valley", "Dubai", "Al Ras", "+971 52 150 1292", "Chat", "None", "Hot", None],
    [2, "Armoplast", "Sharjah", "Ind. 3", "+971 6 542 0134", None, "None", "Hot", None],
    [3, "Third Co", "Dubai", "Deira", "+971 4 111 2222", None, "N/A", "Warm", "call after 5"],
]


class ImportSheetTests(BDTestBase):
    def _wb(self):
        wb = workbook(ROWS)
        cell = wb["Leads"]["F2"]  # WhatsApp "Chat" label carrying a wa.me link
        cell.hyperlink = "https://wa.me/971521501292"
        return wb

    def test_reads_the_leads_sheet_not_the_summary(self):
        headers, rows, info = importer.read_table_info(upload(self._wb()))
        self.assertEqual(info["sheet"], "Leads")
        self.assertEqual(info["sheets"], ["Summary", "Leads"])
        self.assertEqual(headers[1], "Company Name")
        self.assertEqual(len(rows), 3)

    def test_single_sheet_and_csv_still_work(self):
        _, rows, info = importer.read_table_info(upload(workbook(ROWS, summary_first=False)))
        self.assertEqual((info["sheet"], len(rows)), ("Leads", 3))
        csv_file = SimpleUploadedFile("a.csv", b"Company,Phone\nAcme,+971 50 111 2222\n")
        headers, rows, info = importer.read_table_info(csv_file)
        self.assertEqual((headers, len(rows)), (["Company", "Phone"], 1))

    def test_a_sheet_can_be_chosen(self):
        headers, rows, info = importer.read_table_info(upload(self._wb()), sheet="Summary")
        self.assertEqual(info["sheet"], "Summary")

    def test_link_label_becomes_whatsapp_number(self):
        headers, rows, _ = importer.read_table_info(upload(self._wb()))
        m = importer.guess_mapping(headers)
        data, _ = importer.row_to_lead_data(rows[0], headers, m, default_source="cold_outreach")
        self.assertEqual(data["whatsapp"], "+971521501292")
        self.assertEqual(data["city"], "Dubai")
        data2, _ = importer.row_to_lead_data(rows[1], headers, m, default_source="other")
        self.assertEqual(data2["whatsapp"], "")  # no link, no number

    def test_filler_values_are_blank_and_do_not_collide(self):
        headers, rows, _ = importer.read_table_info(upload(self._wb()))
        m = importer.guess_mapping(headers)
        self.assertEqual(rows[0][headers.index("Website")], "")
        results = importer.analyse(self.a, headers, rows, m, default_source="other")
        self.assertEqual([r["status"] for r in results], ["ok", "ok", "ok"])

    def test_unmapped_columns_are_kept_in_the_note(self):
        headers, rows, _ = importer.read_table_info(upload(self._wb()))
        m = importer.guess_mapping(headers)
        _, note = importer.row_to_lead_data(rows[2], headers, m, default_source="other")
        self.assertIn("Area: Deira", note)
        self.assertIn("Lead Priority: Warm", note)
        self.assertIn("call after 5", note)
        self.assertNotIn("#:", note)

    def test_endpoint_commit_creates_real_leads_only(self):
        r = self.ca.post(
            "/api/bd/leads/import",
            {"file": upload(self._wb()), "commit": "1", "default_source": "cold_outreach"},
            format="multipart",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["summary"]["created"], 3)
        names = sorted(Lead.objects.filter(owner=self.a).values_list("company", flat=True))
        self.assertEqual(names, ["Armoplast", "Golden Valley", "Third Co"])
        lead = Lead.objects.get(company="Golden Valley")
        self.assertEqual(lead.whatsapp, "+971521501292")
        self.assertTrue(lead.activities.filter(body__contains="Lead Priority: Hot").exists())

    def test_preview_reports_the_sheet(self):
        r = self.ca.post("/api/bd/leads/import", {"file": upload(self._wb())}, format="multipart")
        self.assertEqual(r.json()["sheet"], "Leads")


class LeadFilterTests(BDTestBase):
    def setUp(self):
        super().setUp()
        self.fresh = self.lead(self.a, company="Fresh Co")
        self.valued = self.lead(self.a, company="Valued Co", est_value=5000)
        self.meet = self.lead(self.a, company="Meet Co")
        from bd import services

        deal = services.qualify_lead(self.meet, self.a)
        services.move_deal(deal, "meeting", self.a)

    def names(self, qs):
        r = self.ca.get(f"/api/bd/leads?{qs}")
        self.assertEqual(r.status_code, 200)
        return sorted(x["company"] for x in r.json()["results"])

    def test_stage_filter(self):
        self.assertEqual(self.names("stage=meeting"), ["Meet Co"])
        self.assertEqual(self.names("stage=new"), ["Fresh Co", "Valued Co"])

    def test_value_filter(self):
        self.assertEqual(self.names("has_value=yes"), ["Valued Co"])
        self.assertEqual(self.names("has_value=no"), ["Fresh Co", "Meet Co"])

    def test_added_filter(self):
        from django.utils import timezone
        from datetime import timedelta
        from bd.models import Lead

        Lead.objects.filter(pk=self.fresh.pk).update(created_at=timezone.now() - timedelta(days=45))
        self.assertEqual(self.names("added=30"), ["Meet Co", "Valued Co"])
        self.assertEqual(self.names("added=90"), ["Fresh Co", "Meet Co", "Valued Co"])

    def test_sort_by_value(self):
        r = self.ca.get("/api/bd/leads?ordering=-est_value").json()["results"]
        self.assertEqual(r[0]["company"], "Valued Co")

    def test_filters_stay_inside_the_bdes_own_leads(self):
        self.lead(self.b, company="Other Co", est_value=9000)
        self.assertEqual(self.names("has_value=yes"), ["Valued Co"])


class BulkQualifyTests(BDTestBase):
    def setUp(self):
        super().setUp()
        self.l1 = self.lead(self.a, company="One")
        self.l2 = self.lead(self.a, company="Two")
        self.theirs = self.lead(self.b, company="Theirs")

    def test_work_view_hides_qualified_and_closed(self):
        from bd import services

        services.qualify_lead(self.l1, self.a)
        r = self.ca.get("/api/bd/leads?view=work").json()["results"]
        self.assertEqual([x["company"] for x in r], ["Two"])

    def test_bulk_qualify_skips_others_and_already_qualified(self):
        from bd import services
        from bd.models import Deal

        services.qualify_lead(self.l1, self.a)
        r = self.ca.post("/api/bd/leads/bulk-qualify", {"lead_ids": [self.l1.pk, self.l2.pk, self.theirs.pk]}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), {"qualified": 1, "skipped": 1})  # theirs is not even visible
        self.assertTrue(Deal.objects.filter(lead=self.l2).exists())
        self.assertFalse(Deal.objects.filter(lead=self.theirs).exists())

    def test_bulk_disqualify_needs_a_reason(self):
        self.assertEqual(self.ca.post("/api/bd/leads/bulk-disqualify", {"lead_ids": [self.l1.pk]}, format="json").status_code, 400)
        r = self.ca.post("/api/bd/leads/bulk-disqualify", {"lead_ids": [self.l1.pk, self.l2.pk, self.theirs.pk], "reason": "Wrong number"}, format="json")
        self.assertEqual(r.json(), {"disqualified": 2, "skipped": 0})
        self.l1.refresh_from_db()
        self.theirs.refresh_from_db()
        self.assertEqual(self.l1.status, "disqualified")
        self.assertEqual(self.theirs.status, "new")

    def test_nothing_selected_is_400(self):
        self.assertEqual(self.ca.post("/api/bd/leads/bulk-qualify", {"lead_ids": []}, format="json").status_code, 400)


class SeedDemoTests(BDTestBase):
    def test_demo_has_a_work_inbox_and_a_pipeline(self):
        from django.core.management import call_command
        from bd.models import Deal, Lead

        call_command("seed_bd_demo", stdout=io.StringIO())
        work = Lead.objects.filter(raw_payload__demo=True, status__in=["new", "contacted"], deal__isnull=True).count()
        self.assertGreaterEqual(work, 10)
        self.assertGreaterEqual(Deal.objects.filter(lead__raw_payload__demo=True).exclude(stage="lost").count(), 5)
        call_command("seed_bd_demo", "--clear", stdout=io.StringIO())
        self.assertFalse(Lead.objects.filter(raw_payload__demo=True).exists())


class BulkDeleteTests(BDTestBase):
    def setUp(self):
        super().setUp()
        self.l1 = self.lead(self.a, company="One")
        self.l2 = self.lead(self.a, company="Two")
        self.theirs = self.lead(self.b, company="Theirs")

    def test_a_bde_deletes_their_own_leads_but_never_someone_elses(self):
        from bd.models import Lead

        r = self.ca.post("/api/bd/leads/bulk-delete", {"lead_ids": [self.l1.pk, self.theirs.pk]}, format="json")
        self.assertEqual(r.json(), {"deleted": 1, "skipped": 0})
        self.assertFalse(Lead.objects.filter(pk=self.l1.pk).exists())
        self.assertTrue(Lead.objects.filter(pk=self.theirs.pk).exists())
        self.assertEqual(self.ca.delete(f"/api/bd/leads/{self.theirs.pk}").status_code, 404)

    def test_single_delete_works_for_the_owner(self):
        from bd.models import Lead

        self.assertEqual(self.ca.delete(f"/api/bd/leads/{self.l2.pk}").status_code, 204)
        self.assertFalse(Lead.objects.filter(pk=self.l2.pk).exists())

    def test_the_admin_can_delete_anyones(self):
        from bd.models import Lead

        r = self.cadmin.post("/api/bd/leads/bulk-delete", {"lead_ids": [self.l1.pk, self.theirs.pk]}, format="json")
        self.assertEqual(r.json()["deleted"], 2)
        self.assertFalse(Lead.objects.filter(pk__in=[self.l1.pk, self.theirs.pk]).exists())

    def test_won_and_closed_leads_can_be_deleted_too(self):
        from bd.models import Lead

        won = self.lead(self.a, company="Won Co")
        deal = services.qualify_lead(won, self.a)
        services.win_deal(deal, self.a)
        closed = self.lead(self.a, company="Closed Co")
        services.disqualify_lead(closed, self.a, "Spam")
        r = self.ca.post("/api/bd/leads/bulk-delete", {"lead_ids": [won.pk, closed.pk]}, format="json")
        self.assertEqual(r.json()["deleted"], 2)
        self.assertFalse(Lead.objects.filter(pk__in=[won.pk, closed.pk]).exists())

    def test_everything_on_the_lead_goes_with_it(self):
        from bd.models import Activity, Deal, FollowUp, ProposalLink
        from notifications.models import NotificationEvent
        from sales.models import Client, Proposal

        lead = self.lead(self.a, company="Full Co", email="x@full.test")
        services.log_activity(lead=lead, user=self.a, kind="note", body="a note")
        services.log_activity(lead=lead, user=self.a, kind="call", outcome="connected", body="spoke")
        proposal = Proposal.objects.create(owner=self.a, content={"home": {}})
        deal = services.qualify_lead(lead, self.a)
        Deal.objects.filter(pk=deal.pk).update(proposal=proposal)
        link = ProposalLink.objects.create(deal=deal, proposal=proposal)
        fu = services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now(), note="x")
        refs = [f"bd-followup:{fu.pk}", f"bd-lead-new:{lead.pk}", f"bd-prop-accept:{link.pk}", f"bd-stale:{deal.pk}"]
        for ref in refs:
            NotificationEvent.objects.create(user=self.a, source="bd", title="t", body="b", object_ref=ref)
        keep = NotificationEvent.objects.create(user=self.a, source="bd", title="t", body="b", object_ref="bd-followup:999999")
        client = Client.objects.create(client_id="KF7777ZZ", name="Kept Client")

        self.assertEqual(self.ca.delete(f"/api/bd/leads/{lead.pk}").status_code, 204)

        self.assertFalse(Activity.objects.filter(lead_id=lead.pk).exists())
        self.assertFalse(FollowUp.objects.filter(lead_id=lead.pk).exists())
        self.assertFalse(Deal.objects.filter(lead_id=lead.pk).exists())
        self.assertFalse(ProposalLink.objects.filter(pk=link.pk).exists())
        self.assertFalse(NotificationEvent.objects.filter(object_ref__in=refs).exists())
        self.assertTrue(NotificationEvent.objects.filter(pk=keep.pk).exists())  # other alerts untouched
        self.assertTrue(Client.objects.filter(pk=client.pk).exists())  # Sales records are not ours to delete

    def test_empty_selection_is_400(self):
        self.assertEqual(self.ca.post("/api/bd/leads/bulk-delete", {"lead_ids": []}, format="json").status_code, 400)

    def test_the_deleted_lead_can_be_imported_again(self):
        from bd import importer

        lead = self.lead(self.a, company="Again Co", phone="0501119999")
        services.disqualify_lead(lead, self.a, "Not interested")
        rows = [["Again Co", "0501119999"]]
        hdr = ["Company", "Phone"]
        res = importer.analyse(self.a, hdr, rows, importer.guess_mapping(hdr))
        self.assertEqual(res[0]["status"], "duplicate")  # a closed lead still blocks it...
        self.ca.delete(f"/api/bd/leads/{lead.pk}")
        res = importer.analyse(self.a, hdr, rows, importer.guess_mapping(hdr))
        self.assertEqual(res[0]["status"], "ok")  # ...until it is deleted


class DisqualifyClearsFollowUpsTests(BDTestBase):
    def test_open_follow_ups_are_closed_and_vanish_from_my_day(self):
        from datetime import timedelta

        from django.utils import timezone

        from bd import services
        from bd.models import FollowUp

        lead = self.lead(self.a, company="Closing Co")
        keep = self.lead(self.a, company="Keep Co")
        past = timezone.now() - timedelta(days=1)
        services.create_follow_up(lead=lead, owner=self.a, due_at=past, note="call")
        services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now() + timedelta(hours=2), note="again")
        services.create_follow_up(lead=keep, owner=self.a, due_at=past, note="other lead")

        r = self.ca.post(f"/api/bd/leads/{lead.pk}/disqualify", {"reason": "Wrong number"}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(FollowUp.objects.filter(lead=lead, done_at__isnull=True).exists())
        lead.refresh_from_db()
        self.assertIsNone(lead.next_follow_up_at)

        day = self.ca.get("/api/bd/my-day").json()
        names = [f["lead_name"] for f in day["overdue"] + day["today"]]
        self.assertNotIn("Closing Co", names)
        self.assertIn("Keep Co", names)  # other leads are untouched

    def test_bulk_disqualify_does_the_same(self):
        from datetime import timedelta

        from django.utils import timezone

        from bd import services
        from bd.models import FollowUp

        l1 = self.lead(self.a, company="One")
        l2 = self.lead(self.a, company="Two")
        for lead in (l1, l2):
            services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now() - timedelta(hours=3), note="x")
        r = self.ca.post("/api/bd/leads/bulk-disqualify", {"lead_ids": [l1.pk, l2.pk], "reason": "Spam"}, format="json")
        self.assertEqual(r.json()["disqualified"], 2)
        self.assertFalse(FollowUp.objects.filter(lead__in=[l1, l2], done_at__isnull=True).exists())


class FollowUpLifecycleTests(BDTestBase):
    def _fu(self, lead, hours, note="x"):
        from datetime import timedelta

        from django.utils import timezone

        from bd import services

        return services.create_follow_up(lead=lead, owner=self.a, due_at=timezone.now() + timedelta(hours=hours), note=note)

    def test_losing_a_deal_closes_other_follow_ups_but_keeps_the_check_back(self):
        from bd import services
        from bd.models import FollowUp

        lead = self.lead(self.a, company="Lose Co")
        deal = services.qualify_lead(lead, self.a)
        self._fu(lead, -5)
        self._fu(lead, 3)
        services.move_deal(deal, "lost", self.a, lost_reason="competitor")
        open_ = FollowUp.objects.filter(lead=lead, done_at__isnull=True)
        self.assertEqual([f.kind for f in open_], ["recontact"])
        day = self.ca.get("/api/bd/my-day").json()
        self.assertEqual([f for f in day["overdue"] + day["today"] if f["lead_name"] == "Lose Co"], [])

    def test_reopening_a_disqualified_lead_restores_only_the_auto_closed_ones(self):
        from bd import services
        from bd.models import FollowUp

        lead = self.lead(self.a, company="Back Co")
        mine = self._fu(lead, 4, "done by me")
        services.complete_follow_up(mine)  # the person finished this one themselves
        auto = self._fu(lead, 6, "still open")
        self.ca.post(f"/api/bd/leads/{lead.pk}/disqualify", {"reason": "No answer"}, format="json")
        auto.refresh_from_db()
        self.assertIsNotNone(auto.done_at)
        self.assertEqual(self.ca.post(f"/api/bd/leads/{lead.pk}/reopen", {}, format="json").status_code, 200)
        auto.refresh_from_db()
        mine.refresh_from_db()
        self.assertIsNone(auto.done_at)
        self.assertIsNone(auto.auto_closed_at)
        self.assertIsNotNone(mine.done_at)  # not resurrected
        lead.refresh_from_db()
        self.assertEqual(lead.next_follow_up_at, auto.due_at)

    def test_reopening_a_lost_deal_restores_follow_ups_and_drops_the_check_back(self):
        from bd import services
        from bd.models import FollowUp

        lead = self.lead(self.a, company="Won Back")
        deal = services.qualify_lead(lead, self.a)
        fu = self._fu(lead, 8)
        services.move_deal(deal, "lost", self.a, lost_reason="price")
        services.reopen_deal(deal, self.a)
        fu.refresh_from_db()
        self.assertIsNone(fu.done_at)
        self.assertFalse(FollowUp.objects.filter(lead=lead, kind="recontact").exists())


class PipelineServerFilterTests(BDTestBase):
    def setUp(self):
        super().setUp()
        from bd import services

        self.lost = []
        for i in range(12):
            lead = self.lead(self.a, company=f"Lost Co {i:02d}", est_value=100 + i)
            deal = services.qualify_lead(lead, self.a)
            services.move_deal(deal, "lost", self.a, lost_reason="price")
            self.lost.append(lead)
        self.open_lead = self.lead(self.a, company="Open Co", est_value=900, source="website")
        services.qualify_lead(self.open_lead, self.a)

    def cols(self, qs=""):
        r = self.ca.get(f"/api/bd/pipeline?{qs}")
        self.assertEqual(r.status_code, 200)
        return {c["key"]: c for c in r.json()["columns"]}

    def test_closed_columns_show_a_page_and_grow(self):
        c = self.cols("closed_limit=10")["lost"]
        self.assertEqual((c["count"], len(c["cards"])), (12, 10))
        c = self.cols("closed_limit=50")["lost"]
        self.assertEqual(len(c["cards"]), 12)

    def test_search_reaches_deals_that_are_not_on_screen(self):
        # the 12th lost deal is beyond the first 10 cards, but search still finds it
        oldest = self.lost[0].company
        c = self.cols(f"closed_limit=10&search={oldest}")["lost"]
        self.assertEqual((c["count"], [x["company"] for x in c["cards"]]), (1, [oldest]))
        # and counts / totals follow the filter
        self.assertEqual(self.cols("search=Open")["qualified"]["count"], 1)
        self.assertEqual(self.cols("search=Open")["lost"]["count"], 0)

    def test_source_value_and_sort_filters(self):
        self.assertEqual(self.cols("source=website")["qualified"]["count"], 1)
        self.assertEqual(self.cols("source=meta_ads")["qualified"]["count"], 0)
        self.assertEqual(self.cols("has_value=no")["qualified"]["count"], 0)
        top = self.cols("sort=value&closed_limit=10")["lost"]["cards"][0]["company"]
        self.assertEqual(top, "Lost Co 11")  # highest value first

    def test_search_stays_inside_the_bdes_own_deals(self):
        from bd import services

        other = self.lead(self.b, company="Zebra Secret")
        services.qualify_lead(other, self.b)
        self.assertEqual(self.cols("search=Zebra")["qualified"]["count"], 0)
