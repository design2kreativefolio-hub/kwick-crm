# Business Development module (Phases 1-2)

Spec: [`Kwick_BD_Sales_Module_Spec.md`](../Kwick_BD_Sales_Module_Spec.md). Backend app: `backend/bd/`. Frontend: `frontend/src/app/(app)/bd/` + `frontend/src/components/bd/`.

Everything is **additive**: new tables, a new nullable `owner` column on proposals/estimates, and two new choices (`bd` module, `bd` notification source). No existing rows are modified.

## Deploying Phase 1

On the VPS after `git pull` (see [`DEPLOYMENT.md`](./DEPLOYMENT.md)):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build backend celery-worker celery-beat frontend
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backend python manage.py migrate
```

- `openpyxl` was added to `requirements.txt` (Excel import) → the **backend image must be rebuilt**, and the **celery worker + beat** must be restarted so the new `bd.tasks.*` jobs register.
- No new containers, no new environment variables, no paid services.

## Giving someone access

Roles page → pick the employee → turn on **Business Development** *and* **Proposals**. That makes them a BDE:

- they see only their own leads, deals, activities, follow-ups, proposals and estimates (another BDE's id returns 404);
- they have no access to Invoices or Clients;
- the first BDE gets every lead; a second BDE switches on round-robin automatically.

The superadmin sees everything, can filter by BDE, and can reassign leads (single or bulk — deals, open follow-ups and linked documents move with them).

## What runs automatically (Celery beat, all times UTC)

| Job | When | Does |
|---|---|---|
| `bd.tasks.follow_up_alerts` | every 5 min | push when a follow-up falls due (once) |
| `bd.tasks.my_day_digest` | 05:00 Mon–Sat (09:00 Dubai) | daily summary push per BDE |
| `bd.tasks.response_time_alerts` | every 15 min | new lead uncontacted after 2 working hours → BDE; 4 → superadmin (Mon–Sat 09:00–18:00 Dubai) |
| `bd.tasks.stale_deal_alerts` | 04:30 daily | open deal with no activity for 5 days → owner (cleared when anything is logged) |

Lost deals schedule a "check back in" follow-up 90 days out. Winning a deal is deliberately light: it marks the deal Won (lead -> converted), accepts the proposal/estimate, closes the open follow-ups and notifies the superadmin. **It does not create a client, invoice, project or renewal.** The superadmin adds the client by hand in Sales -> Clients, then on the won lead uses **Link client** (which also attaches the proposal/estimate to them) and **Create draft invoice** (drafted from the estimate, or one line for the deal value; never sent; once per deal). A won deal can be moved back to any open stage (**Move back...**): its follow-ups return, and any client/invoice already created is left alone.

## Phase 2 - capture, email, tracked proposals, reports

Everything below is **off until configured** - nothing runs, nothing is sent, and no existing behaviour changes. No new containers or paid services. Deploy the same way as Phase 1 (rebuild backend + celery worker/beat + frontend, then `migrate`; migration `bd/0002` only adds tables and one column).

### Website form capture (A10)
Superadmin -> **Business Development -> Lead capture -> Add website form** gives a private link. Point the WordPress form's webhook (CF7 "to Webhook", Elementor Webhook action, WPForms webhook) at it. Field names are matched loosely (`your-name`, `your-email`, `tel`, `company`, `your-message`, ...). A hidden empty `_gotcha` field is a spam trap. Repeat enquiries (same phone/email) are added to the existing lead's timeline instead of duplicating it; the owner gets a push either way. Throttled to 20 requests/min per IP; "New link" invalidates the old URL at once.

### Meta Lead Ads (A11)
Set `META_PAGE_ID` and `META_PAGE_ACCESS_TOKEN` (a long-lived page token with `leads_retrieval`). A Celery job every 15 min pulls new submissions (each Meta lead id is imported once) and stores the campaign/ad name in the lead's source detail. Without the token the job does nothing.

### Send email from Kwick (A13) and reply logging (A14)
- **Sending** uses the app's existing `EMAIL_*` SMTP settings, or its own: `BD_MAIL_FROM` (e.g. `Kreativefolio <sales@kreativefolio.com>`), `BD_SMTP_HOST/PORT/USER/PASSWORD/USE_SSL/USE_TLS`. Once the server can send, the Email button opens an in-app composer with templates (intro, follow-up, meeting, proposal, nudge) and every email is logged on the timeline. Until then Email opens the phone's mail app as before. One-to-one only - not a bulk sender.
- **Reply logging** needs `BD_IMAP_HOST/PORT/USER/PASSWORD` (+ optional `BD_IMAP_FOLDER`, `BD_IMAP_USE_SSL`). Every 10 min the inbox is read **without changing it**; a reply from a known lead's email address is logged as an inbound email and the owner is notified. Automatic/bulk mail and our own address are ignored.
- **Microsoft 365 caveat:** Microsoft 365 disables basic-auth SMTP/IMAP. If `sales@` is on M365, sending/reading needs either an app password / SMTP AUTH enabled for that mailbox or a Microsoft Graph client (not built yet - say if you want it). Replies can also be logged by hand meanwhile.

### Tracked proposal link (A12)
Lead -> **Documents** -> *Create tracked link* (needs a linked proposal). The link (`/p/<token>`, no login) shows the proposal, counts views (one timeline entry per sitting, at most one push per 6 hours) and has an **Accept** button: the client types their name, the proposal is marked accepted, the deal is moved to **Won** (no client or invoice is created automatically) and the owner + superadmin are notified. If moving it to Won fails, the acceptance is still recorded and the timeline says to finish it by hand. Links last 60 days. *Preview* (adds `?p=1`) does not count as a view. Anyone holding the link can view and accept, so share it only with the client.

### Reports and weekly email
Superadmin -> **Pipeline reports**: funnel, win rate, won value, average days to close, performance by source, lost reasons and per-BDE activity for 7 / 30 / 90 / 365 days (filter by BDE). The funnel shows how far leads that arrived in the period have got *today*. A Monday 08:00 (Dubai) email with last week's numbers goes to every active superadmin (needs sending to be configured).

| Job | When (UTC) | Does |
|---|---|---|
| `bd.tasks.pull_meta_leads` | every 15 min | import new Meta leads |
| `bd.tasks.poll_sales_inbox` | every 10 min | log replies from known leads |
| `bd.tasks.weekly_pipeline_email` | Mon 04:00 | weekly summary email |

After deploying, check `docker stats` for memory headroom (the jobs are short and idle when unconfigured).

## Phase 3: lead score, EDITH helpers, business card scan

**Lead score (no AI, always on).** Every lead has a 0-100 score from plain rules, shown as Hot (70+), Warm (40-69) or Cold. Points come from where it came from (referral 25 ... cold outreach 6), what they want, estimated value, whether we can reach them, and the conversation (they replied, showed interest, had a meeting; minus points for "not interested", repeated no-answers, or weeks of silence), plus the deal stage. Closed leads score 0, won leads 100. Click the badge on a lead to see every reason in plain words. The Leads page has a Score column, **Sort: Best score** and a Hot/Warm/Cold filter; My Day lists new leads best-first. The score updates whenever the lead, its deal or its timeline changes, and a nightly job (`bd.tasks.rescore_leads`, 03:30 UTC) ages it. After deploying, run once: `docker compose exec backend python manage.py rescore_bd_leads`.

**EDITH helpers (needs AI).** On a lead, the **EDITH** button can summarise the timeline, draft a WhatsApp or email follow-up (editable; *Open in WhatsApp*, *Use in email* or *Copy*), suggest the next step, and explain a score in a sentence. **Scan a business card** in *Add lead*: take or choose a photo, EDITH reads it and fills the form (nothing is saved until you press Add lead; duplicates are checked). EDITH only writes text for a person to read; it never sends or saves anything itself.

- It uses the same settings as the rest of EDITH: `AI_ENABLED`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` (the Gemini free tier by default; see `.env.example`). With no key the EDITH buttons and the scan button are simply hidden; the score still works. On Gemini these helpers try the lighter `gemini-flash-lite-latest` first (fast, rarely overloaded) and fall back to `AI_MODEL`; set `AI_BD_MODEL` to choose a different first model. A busy model (503/429) is retried once before moving on, and each request is cut off after 20 seconds.
- Privacy: the lead's own details and recent timeline are sent to the AI provider when a helper is used. Lead text is passed as data and the model is told to ignore instructions inside it. Photos are shrunk in the browser and are not stored.
- Limited to 60 AI requests per user per hour (`bd_ai` throttle).

## Not built yet

Microsoft Graph mail for reply logging on Microsoft 365 (see caveat above). A cold / nurture pool for scraped lists and a campaign label on leads.

## Local tests

`backend/bd/tests.py` and `tests_phase2.py` cover the spec's acceptance criteria (isolation between BDEs, no invoice access, dedupe, import idempotency, lost-needs-reason, no automatic client/invoice on win, invoice only on request once a client is linked, won deals can move back, alert timing, calendar). The suite needs a database; it was run against SQLite with the pinned requirements' Django line.

## Leads inbox and the Pipeline

- **Leads page = the inbox.** Every lead (form, Meta, import, manual) starts here. The default view is **To work**: leads that are not yet qualified or closed. A lead becomes Contacted on its own when a call, WhatsApp or email is logged.
- **Qualify** (button on each row, on the lead page, or in bulk) turns a lead into a deal at **Qualified**. Only then does it appear in the **Pipeline**.
- **Disqualify** (row, lead page, or bulk) closes a lead with a reason, kept on its timeline.
- **Delete** (trash icon on any row, the selection bar, or the lead page; works in To work, All, Won and Closed) permanently removes the lead and everything on it: timeline and notes, follow-ups, the deal, proposal links and their in-app alerts, after a confirmation. A BDE can delete their own leads; the admin any. Sales records already created from a won deal (client, invoice, proposal/estimate documents) are not deleted. Deleting is also how a closed lead can be imported again (a closed lead still counts as a duplicate until it is deleted or re-opened).
- **The Pipeline starts at Qualified**: Qualified, Meeting, Proposal Sent, Negotiation, Won, Lost. New and Contacted are not columns any more.
- "In pipeline", "Won", "Closed" and "All" chips on the Leads page show the rest.
- Demo data: `seed_bd_demo` now includes unqualified leads (Meta, website form, a cold sheet and a junk test lead). `seed_bd_demo --inbox` adds just those to an existing demo.
