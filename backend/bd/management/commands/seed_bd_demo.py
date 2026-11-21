"""Create (or remove) demo Business Development leads so the screens have something to show.

    python manage.py seed_bd_demo            # add the demo leads (owner = first superadmin)
    python manage.py seed_bd_demo --clear    # remove only the demo leads
    python manage.py seed_bd_demo --inbox    # add just the unqualified "To work" leads to an existing demo

Demo leads are tagged raw_payload={"demo": true} so --clear never touches real data.
Nothing here wins a deal, so no client or invoice is created.
"""

from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from accounts.models import User
from bd import services
from bd.models import Deal, FollowUp, Lead

S = Lead.Source
D = Deal.Stage

# company, contact, role, phone, email, website, source, services, value, currency, city
LEADS = [
    ("Al Noor Dental Clinic", "Fatima Al Noor", "Owner", "+971 50 555 0101", "fatima@alnoor-dental.example", "alnoor-dental.example", S.WEBSITE, ["web_design"], 18000, "AED", "Dubai"),
    ("Desert Rose Interiors", "Omar Haddad", "Marketing Manager", "+971 55 555 0102", "omar@desertrose.example", "desertrose.example", S.META_ADS, ["digital_marketing"], 6500, "AED", "Abu Dhabi"),
    ("Bluewave Logistics", "Priya Nair", "Operations Head", "+971 52 555 0103", "priya@bluewave.example", "bluewave.example", S.REFERRAL, ["web_design", "digital_marketing"], 32000, "AED", "Sharjah"),
    ("Cafe Mirage", "Khalid Rahman", "Founder", "+971 50 555 0104", "khalid@cafemirage.example", "cafemirage.example", S.COLD_OUTREACH, ["digital_marketing", "branding"], 4200, "AED", "Dubai"),
    ("Summit Real Estate", "Sara Whitfield", "Sales Director", "+971 56 555 0105", "sara@summitre.example", "summitre.example", S.EVENT, ["web_design", "ads_leads"], 45000, "AED", "Dubai"),
    ("GreenLeaf Organics", "Yusuf Ali", "Director", "+971 54 555 0106", "yusuf@greenleaf.example", "greenleaf.example", S.WEBSITE, ["web_design"], 12000, "USD", "Ajman"),
    ("Falcon Auto Garage", "Ahmed Saleem", "Manager", "+971 50 555 0107", "", "", S.WHATSAPP, ["digital_marketing"], 3000, "AED", "Dubai"),
    ("Pearl Kids Academy", "Mona Verma", "Principal", "+971 58 555 0108", "mona@pearlkids.example", "pearlkids.example", S.REFERRAL, ["web_design"], 15000, "AED", "Dubai"),
    ("Nova Fitness Studio", "Daniel Cruz", "Owner", "+971 55 555 0109", "daniel@novafit.example", "novafit.example", S.META_ADS, ["digital_marketing", "ads_leads"], 8000, "AED", "Dubai"),
    ("Oasis Legal Consultants", "Reem Karim", "Partner", "+971 52 555 0110", "reem@oasislegal.example", "oasislegal.example", S.COLD_OUTREACH, ["web_design"], 22000, "AED", "Abu Dhabi"),
    ("Spice Route Restaurant", "Imran Sheikh", "Owner", "+971 50 555 0111", "imran@spiceroute.example", "spiceroute.example", S.WEBSITE, ["branding"], 5000, "AED", "Dubai"),
    ("Skyline Travel", "Lena Petrova", "GM", "+971 56 555 0112", "lena@skylinetravel.example", "skylinetravel.example", S.EVENT, ["web_design"], 9500, "AED", "Dubai"),
]


# Unqualified leads for the Leads page "To work" view (a mix of hot, cold and junk).
# company, contact, phone, email, source, source_detail, value, city, tries (calls logged), hours_ago
INBOX = [
    ("Marina Bay Dental", "Dr. Hala Mansour", "+971 50 555 0201", "hala@marinabay.example", S.META_ADS, "Ramadan Offer - Web Design", 12000, "Dubai", 0, 1),
    ("Elite Movers LLC", "Rashid Al Ketbi", "+971 55 555 0202", "rashid@elitemovers.example", S.META_ADS, "Ramadan Offer - Web Design", 6000, "Sharjah", 0, 2),
    ("Glow Beauty Lounge", "Nadia Farouk", "+971 56 555 0203", "", S.META_ADS, "Ramadan Offer - Web Design", 4500, "Dubai", 1, 5),
    ("Prime Auto Spares", "Vikram Singh", "+971 52 555 0204", "vikram@primeauto.example", S.WEBSITE, "Contact page", 8000, "Ajman", 0, 8),
    ("Harbour Cafe", "Joana Reyes", "+971 54 555 0205", "joana@harbourcafe.example", S.WEBSITE, "Contact page", 3500, "Dubai", 2, 30),
    ("Al Huriya Flour Mill", "", "+971 50 889 3473", "", S.COLD_OUTREACH, "Manufacturing sheet", 0, "Sharjah", 0, 48),
    ("Armoplast", "", "+971 6 542 0134", "", S.COLD_OUTREACH, "Manufacturing sheet", 0, "Sharjah", 0, 48),
    ("Khair Biladi Cheese Products", "", "+971 4 554 9099", "", S.COLD_OUTREACH, "Manufacturing sheet", 0, "Dubai", 1, 47),
    ("test test", "test", "+971 50 000 0000", "test@test.example", S.WEBSITE, "Contact page", 0, "", 3, 70),
]


def add_inbox(owner, now):
    """Create the unqualified demo leads. Returns how many were made."""
    made = 0
    for company, contact, phone, email, source, detail, value, city, tries, hours in INBOX:
        lead = Lead.objects.create(
            owner=owner, company=company, contact_name=contact, phone=phone, whatsapp=phone,
            email=email, city=city, country="UAE", source=source, source_detail=detail,
            est_value=value, currency="AED", owner_alerted_at=now, admin_alerted_at=now,
            raw_payload={"demo": True},
        )
        for i in range(tries):
            services.log_activity(
                lead=lead, user=owner, kind="call", body="No answer.", outcome="no_answer",
                occurred_at=now - timedelta(hours=max(1, hours - 1 - i)),
            )
        Lead.objects.filter(pk=lead.pk).update(created_at=now - timedelta(hours=hours))
        made += 1
    return made


class Command(BaseCommand):
    help = "Add (or --clear) demo Business Development leads."

    def add_arguments(self, parser):
        parser.add_argument("--clear", action="store_true", help="Remove the demo leads and exit.")
        parser.add_argument("--inbox", action="store_true", help="Only add the unqualified leads to an existing demo.")

    def handle(self, *args, **opts):
        demo = Lead.objects.filter(raw_payload__demo=True)
        if opts["clear"]:
            n = demo.count()
            demo.delete()
            self.stdout.write(self.style.SUCCESS(f"Removed {n} demo leads."))
            return
        if opts["inbox"]:
            first = demo.order_by("id").first()
            if not first:
                raise CommandError("No demo leads yet. Run seed_bd_demo first.")
            if demo.filter(source_detail="Manufacturing sheet").exists():
                raise CommandError("The unqualified demo leads are already there.")
            n = add_inbox(first.owner, timezone.now())
            self.stdout.write(self.style.SUCCESS(f"Added {n} unqualified demo leads for {first.owner.email}."))
            return
        if demo.exists():
            raise CommandError("Demo leads already exist. Run with --clear first to reset them.")
        owner = User.objects.filter(role="superadmin", is_active=True).order_by("id").first()
        if not owner:
            raise CommandError("No superadmin user found.")

        now = timezone.now()

        def ago(**kw):
            return now - timedelta(**kw)

        def ahead(**kw):
            return now + timedelta(**kw)

        made = []
        for company, contact, role, phone, email, site, source, svcs, value, cur, city in LEADS:
            made.append(
                Lead.objects.create(
                    owner=owner, company=company, contact_name=contact, designation=role,
                    phone=phone, whatsapp=phone, email=email, website=site, city=city,
                    country="UAE", source=source, services=svcs, est_value=value, currency=cur,
                    # keep the response-time alerts from pinging anyone about demo data
                    owner_alerted_at=now, admin_alerted_at=now,
                    raw_payload={"demo": True},
                )
            )
        al, desert, blue, cafe, summit, green, falcon, pearl, nova, oasis, spice, sky = made

        def log(lead, kind, body, when, outcome=""):
            services.log_activity(lead=lead, user=owner, kind=kind, body=body, outcome=outcome, occurred_at=when)

        def stage(lead, target, days_in=1):
            deal = services.qualify_lead(lead, owner)
            if target != D.QUALIFIED:
                services.move_deal(deal, target, owner)
            Deal.objects.filter(pk=deal.pk).update(stage_changed_at=ago(days=days_in))
            deal.refresh_from_db()
            return deal

        # New (never contacted) - make them look freshly added
        Lead.objects.filter(pk__in=[falcon.pk, nova.pk]).update(created_at=ago(minutes=25))
        Lead.objects.filter(pk=sky.pk).update(created_at=ago(hours=3))

        # Contacted
        log(desert, "call", "Introduced Kwick. Runs 2 showrooms, wants Instagram content.", ago(days=1, hours=2), "connected")
        log(desert, "whatsapp", "Sent intro + portfolio link.", ago(days=1, hours=1))
        log(cafe, "call", "Did not pick up.", ago(hours=5), "no_answer")
        log(spice, "email", "Intro email with branding samples.", ago(days=2))

        # Qualified .. Negotiation
        log(al, "call", "Needs a new site with online booking. Budget around 18k.", ago(days=3), "interested")
        log(al, "note", "Decision maker is Fatima herself. Wants to launch before Ramadan.", ago(days=3))
        d_al = stage(al, D.QUALIFIED, 3)

        log(blue, "call", "Referred by an existing client. Old site is slow, wants SEO too.", ago(days=6), "connected")
        log(blue, "meeting", "Discovery meeting at their Sharjah office.", ago(days=4), "interested")
        stage(blue, D.MEETING, 4)

        log(summit, "meeting", "Met at the property expo. Wants a listings site + ads.", ago(days=9), "interested")
        log(summit, "email", "Sent proposal v1.", ago(days=7))
        stage(summit, D.PROPOSAL_SENT, 7)
        # no activity for 8 days -> shows under "Gone quiet" on My Day
        Lead.objects.filter(pk=summit.pk).update(last_activity_at=ago(days=8))

        log(green, "call", "Negotiating price; asked for 10% off.", ago(days=1), "connected")
        log(green, "whatsapp", "Sent revised quote.", ago(hours=20))
        d_green = stage(green, D.NEGOTIATION, 2)

        log(oasis, "call", "Early chat, interested in a new website.", ago(days=2), "connected")
        stage(oasis, D.QUALIFIED, 2)

        # Lost (creates the 90-day check-back follow-up)
        log(pearl, "call", "Liked the proposal but went with an in-house designer.", ago(days=5), "not_interested")
        d_pearl = stage(pearl, D.QUALIFIED, 6)
        services.move_deal(d_pearl, D.LOST, owner, lost_reason="competitor")

        # Follow-ups: overdue, today, tomorrow, a meeting this week
        fu = services.create_follow_up
        fu(lead=desert, owner=owner, due_at=ago(days=1, hours=3), note="Send Instagram content plan", kind="whatsapp")
        fu(lead=cafe, owner=owner, due_at=ago(hours=2), note="Call again, try after lunch", kind="call")
        fu(lead=al, owner=owner, due_at=ahead(hours=2), note="Send website proposal", kind="email")
        fu(lead=green, owner=owner, due_at=ahead(hours=5), note="Confirm discount and close", kind="call")
        fu(lead=spice, owner=owner, due_at=ahead(days=1, hours=1), note="Follow up on branding email", kind="follow_up")
        fu(lead=blue, owner=owner, due_at=ahead(days=2), note="Proposal walkthrough", kind="meeting", meeting_url="https://meet.example.com/bluewave")
        fu(lead=summit, owner=owner, due_at=ahead(days=1), note="Nudge about the proposal", kind="whatsapp")
        # nobody gets a push for demo reminders
        FollowUp.objects.filter(lead__raw_payload__demo=True).update(notified_at=now)

        Deal.objects.filter(pk=d_al.pk).update(expected_close_date=(now + timedelta(days=20)).date())
        Deal.objects.filter(pk=d_green.pk).update(expected_close_date=(now + timedelta(days=5)).date())

        extra = add_inbox(owner, now)
        self.stdout.write(self.style.SUCCESS(f"Created {len(made) + extra} demo leads for {owner.email}."))
