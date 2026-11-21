# Kwick — Business Development (Sales Pipeline) Module Spec

> **Purpose:** build spec for the new pre-sale pipeline used by Kreativefolio's Business Development Executives (BDEs). It sits *in front of* the existing `sales` app (Clients / Proposals / Estimates / Invoices) and hands won deals over to it.
> **Scope:** Kreativefolio only. Max 2 BDEs. Superadmin (Rajathi) sees everything; there is no separate sales head.
> **Constraint:** zero new monthly cost. No new containers, no paid APIs. Runs inside the existing Django + Celery + Postgres + Redis stack on the OVH VPS-1 (4 GB).
> Companion to `Kwick_Module_Specifications_v3.md` — same conventions (§0) apply.

---

## 1. Decisions captured

| Topic | Decision |
|---|---|
| Users | 1 BDE today (max 2 later) + superadmin |
| Visibility | A BDE sees **only their own** leads, deals, activities, proposals and estimates. Superadmin sees all. |
| Lead sources | Website forms, Meta Lead Ads, WhatsApp, referrals, events, cold outreach (+ Excel import of the current sheet) |
| Stages | New → Contacted → Qualified → Meeting → Proposal Sent → Negotiation → Won / Lost |
| Proposals/estimates | BDEs build them with the existing builders (scoped to their own) |
| Invoices | BDEs have **no** access — superadmin only |
| Brands | Kreativefolio only (no multi-brand pipeline) |
| Email | Shared `sales@kreativefolio.com` mailbox on Outlook / Microsoft 365 (current shared address until then) |
| Targets / commission | Not needed |
| Currency | AED and USD per deal; reports total in AED using the fixed peg 1 USD = 3.6725 AED |
| Device | Must be fully usable on a phone (BDEs in the field) |

---

## 2. Where it lives

- New Django app **`bd`** (keeps `sales` focused on documents). Routes under `/api/bd/`.
- New frontend section **Business → Business Development**: `My Day`, `Leads`, `Pipeline`, `Reports` (superadmin).
- New grantable module key **`bd`** in `accounts.models.Module`. Do **not** reuse the `sales` parent key — `sales` implies Invoices.
- A typical BDE grant set: `bd` + `sales_proposals`.

---

## 3. Data model (`bd` app)

All models extend `TimeStampedModel`. Money: `DecimalField(12,2)`.

### Lead
| Field | Notes |
|---|---|
| owner | FK User (BDE). Required. |
| company, contact_name, designation | |
| phone, whatsapp, email, website | phone/whatsapp stored E.164-normalised for dedupe |
| country, city | default UAE |
| source | `website` / `meta_ads` / `whatsapp` / `referral` / `event` / `cold_outreach` / `other` |
| source_detail | e.g. form name, campaign name, referrer, event name |
| services | JSON list — reuse `sales.Client.Service` choices |
| est_value, currency | currency `AED` / `USD` |
| status | `new` / `contacted` / `qualified` / `disqualified` / `converted` |
| disqualify_reason | required when disqualified |
| next_follow_up_at | denormalised from the next open FollowUp (for list sorting) |
| first_contacted_at | set on first logged outbound activity — drives the response-time alert |
| raw_payload | JSON — original webhook/import row, for audit |

### Deal
| Field | Notes |
|---|---|
| lead | OneToOne Lead (a qualified lead becomes one deal) |
| owner | FK User |
| title | e.g. "Social + Ads retainer 12m" |
| stage | `qualified` / `meeting` / `proposal_sent` / `negotiation` / `won` / `lost` |
| value, currency | |
| expected_close_date, probability | probability defaults per stage (20/40/60/80/100/0), editable |
| lost_reason | `price` / `timing` / `competitor` / `no_response` / `not_a_fit` / `other` + note — required on lost |
| proposal, estimate | nullable FKs to `sales.Proposal` / `sales.Estimate` |
| client | nullable FK `sales.Client`, set on Won conversion |
| stage_changed_at | drives stale-deal alerts and time-in-stage reports |
| won_at, lost_at | |

### Activity (timeline)
`lead` FK, `deal` FK nullable, `user`, `kind` (`call` / `whatsapp` / `email` / `meeting` / `note` / `stage_change` / `system`), `direction` (`out`/`in`), `outcome` (`connected` / `no_answer` / `busy` / `interested` / `not_interested` / `callback`), `body`, `occurred_at`, `meeting_url`.
System entries (stage changes, proposal viewed, email sent) are written automatically.

### FollowUp
`lead` FK, `deal` FK nullable, `owner`, `due_at`, `note`, `done_at`, `notified_at`. Logging an activity offers "set next follow-up" in the same form.

### LeadCaptureSource
`name`, `kind` (`website` / `meta`), `token` (secrets.token_urlsafe, like `ClientCalendarShare`), `default_owner` nullable, `active`, `last_received_at`.

### ProposalLink (Phase 2)
`proposal` FK, `token`, `views` count, `first_viewed_at`, `last_viewed_at`, `accepted_at`, `accepted_name`, `expires_at`.

### Changes to existing models
- `sales.Proposal` and `sales.Estimate`: add `owner` FK User (nullable; backfill existing rows to the superadmin). Querysets scoped: superadmin sees all, others see `owner=request.user`.
- `notifications.NotificationEvent.source`: add `bd`.
- `calendar_app` agenda: add source `bd` (follow-ups + meetings) so they appear on the existing Calendar.

---

## 4. Permissions (server-side)

- `HasModuleAccess` with `required_module = Module.BD` on every `bd` viewset.
- `get_queryset()` filters `owner=request.user` unless superadmin → another BDE's record returns **404** (not 403, so IDs aren't confirmable).
- Owner cannot be changed by a BDE; superadmin can reassign (single + bulk, e.g. when a BDE leaves).
- Duplicate check across BDEs returns only "exists — owned by another BDE / already a client", never the other record's details.
- Public endpoints (lead capture, proposal link) are token-based, throttled (`common.throttles`), honeypot-protected, and never return stored data beyond what that token owns.

---

## 5. Screens (mobile-first)

| Screen | Desktop | Phone |
|---|---|---|
| **My Day** (BDE landing page) | Overdue + today's follow-ups, new uncontacted leads, stale deals, this week's meetings | Same as stacked cards; each card has Call / WhatsApp / Log buttons |
| **Leads** | Table with filters (status, source, service, follow-up due), search, CSV/XLSX import, export | Card list, sticky search, filter sheet |
| **Lead / Deal detail** | Header (contact, value, stage), timeline, follow-ups, linked proposal/estimate | Header with tap-to-call (`tel:`), WhatsApp (`wa.me` + template), email; timeline below; floating "+ Log" button |
| **Pipeline** | Kanban board, drag between stages, column totals (AED) | Stage tabs with a list per stage + "Move to…" action (no drag on phones) |
| **Quick add lead** | Modal | Short form: name, company, phone, source, service, note (+ "scan business card" in Phase 3) |
| **Reports** (superadmin) | Funnel, win rate, source performance, avg days to close, lost reasons, per-BDE activity | Simplified cards |

- Mobile tab bar: for users with `bd` access, show **My Day** in place of Tasks.
- Quick-log activity as a bottom sheet: kind → outcome → note → next follow-up, in ≤ 4 taps.
- PWA push notifications already exist — reuse.
- Must meet existing theme tokens + dark mode (v3 §3).

---

## 6. Automations (all free)

| # | Automation | How | Phase |
|---|---|---|---|
| A1 | **Excel import** of the current tracking sheet | CSV/XLSX upload with column mapping + preview + dedupe (adds `openpyxl`) | 1 |
| A2 | **Duplicate detection** | on create/import: normalised phone, email, website domain vs Leads + `sales.Client` | 1 |
| A3 | **Auto-assignment** | round-robin between active BDEs, unless the capture source has a default owner | 1 |
| A4 | **Follow-up reminders** | Celery beat every 5 min → `notify_user` (push + in-app) at due time; overdue re-nudge daily | 1 |
| A5 | **My Day digest** | 09:00 Asia/Dubai Mon–Sat push: "3 follow-ups, 1 overdue, 2 new leads" | 1 |
| A6 | **New-lead response alert** | not contacted within 2 working hours → push owner; 4 hours → push superadmin | 1 |
| A7 | **Stale deal alert** | no activity for 5 days in an open stage → push owner (daily, reset-to-unread pattern) | 1 |
| A8 | **Won → handover** | create `sales.Client` (KF id), link proposal/estimate, draft invoice from estimate (superadmin-only), optional mini-project, contract renewal in Renewals, notify superadmin | 1 |
| A9 | **Lost → recontact** | auto follow-up 90 days later ("check back") | 1 |
| A10 | **Website form capture** | `POST /api/public/bd/capture/<token>` from WordPress (CF7 / Elementor / WPForms webhook) | 2 |
| A11 | **Meta Lead Ads import** | Celery beat every 15 min pulls new leads via Graph API with a page access token (free); stores ad/campaign name in `source_detail` | 2 |
| A12 | **Trackable proposal link** | public `/p/<token>` page renders the proposal, logs views, "Accept" button → deal → Won + push owner | 2 |
| A13 | **Send email from Kwick** | via `sales@` SMTP with templates (intro, follow-up, proposal); logged on timeline. One-to-one only — not for bulk | 2 |
| A14 | **Reply logging** | Celery beat every 10 min reads `sales@` over IMAP, matches sender to a lead, logs inbound email activity | 2 |
| A15 | **WhatsApp templates** | `wa.me` click-to-chat with prefilled templates; tap auto-logs an activity (no paid WhatsApp API) | 1 |
| A16 | **Weekly pipeline email** | Monday 08:00 to superadmin: new leads, moved deals, won/lost, pipeline value | 2 |
| A17 | **EDITH helpers** | summarise lead timeline, draft follow-up message, suggest next step (Gemini free tier, behind `AI_ENABLED`) | 3 |
| A18 | **Business card scan** | photo → Gemini vision → prefilled lead form (events/networking) | 3 |
| A19 | **Lead score** | rules first (source, service, value, engagement); optional EDITH explanation | 3 |

Not included because they cost money: WhatsApp Business Cloud API, Apollo/ZoomInfo enrichment, call-recording/telephony.

---

## 7. API

| Method & Path | Roles | Notes |
|---|---|---|
| `GET/POST /api/bd/leads` | bd | own only (superadmin: all, `?owner=`) |
| `GET/PATCH/DELETE /api/bd/leads/{id}` | bd | delete superadmin-only |
| `POST /api/bd/leads/{id}/qualify` | bd | creates the Deal |
| `POST /api/bd/leads/{id}/disqualify` | bd | reason required |
| `POST /api/bd/leads/check-duplicate` | bd | returns match type only |
| `POST /api/bd/leads/import` | bd | preview → commit |
| `POST /api/bd/leads/reassign` | superadmin | bulk |
| `GET/PATCH /api/bd/deals`, `/{id}` | bd | |
| `POST /api/bd/deals/{id}/move` | bd | stage change; logs activity; Won/Lost validation |
| `POST /api/bd/deals/{id}/win` | bd | runs A8 |
| `GET /api/bd/pipeline` | bd | grouped by stage + AED totals |
| `GET/POST /api/bd/activities` | bd | `?lead=` |
| `GET/POST/PATCH /api/bd/follow-ups` | bd | |
| `GET /api/bd/my-day` | bd | |
| `GET /api/bd/reports/*` | superadmin | funnel, sources, lost-reasons, velocity, per-BDE |
| `GET/POST /api/bd/capture-sources` | superadmin | issue/revoke tokens |
| `POST /api/public/bd/capture/{token}` | public | throttled, honeypot |
| `GET /api/public/proposals/{token}`, `POST .../accept` | public | Phase 2 |

---

## 8. Celery beat additions

| Task | Schedule (UTC) |
|---|---|
| `bd.tasks.follow_up_alerts` | every 5 min |
| `bd.tasks.my_day_digest` | 05:00 Mon–Sat (09:00 Dubai) |
| `bd.tasks.response_time_alerts` | every 15 min, working hours |
| `bd.tasks.stale_deal_alerts` | 04:30 daily |
| `bd.tasks.pull_meta_leads` | every 15 min (Phase 2) |
| `bd.tasks.poll_sales_inbox` | every 10 min (Phase 2) |
| `bd.tasks.weekly_pipeline_email` | Mon 04:00 (Phase 2) |

All tasks are short queries on the existing worker (concurrency 2) — no new container. Check `docker stats` after Phase 2 to confirm memory headroom.

---

## 9. Phases

1. **Core** — `bd` app + models + migrations, `owner` on Proposal/Estimate with scoping, permissions, Leads / Lead detail / Pipeline / My Day (mobile-first), activities, follow-ups, Excel import, dedupe, round-robin, A4–A9, A15, calendar integration.
2. **Capture & comms** — website + Meta capture, proposal tracking link, send email from Kwick, IMAP reply logging, reports, weekly email.
3. **AI** — EDITH helpers, business card scan, lead score.

---

## 10. Acceptance criteria

- [ ] BDE A gets 404 on BDE B's lead, deal, activity, follow-up, proposal and estimate (API tests for each).
- [ ] A BDE with `bd` + `sales_proposals` gets 403 on every `/api/sales/invoices` endpoint.
- [ ] Superadmin sees all records and can reassign them.
- [ ] Importing the same sheet twice creates no duplicates.
- [ ] Moving a deal to Lost without a reason is rejected; Won creates exactly one `sales.Client`.
- [ ] Follow-up push fires within 5 minutes of `due_at` and stops once marked done.
- [ ] Public capture endpoint rejects bad tokens, throttles bursts, and ignores honeypot-filled submissions.
- [ ] Every BD screen is usable at 375 px width in light and dark mode.

---

## 11. Still open

- [x] `sales@` is on Outlook (Microsoft 365) — send/read via Microsoft Graph API (free, app registration) or M365 SMTP/IMAP with OAuth; basic-auth SMTP/IMAP is disabled on M365.
- [x] Assignment: only 1 BDE today → all leads go to them; round-robin switches on automatically when a 2nd BDE is granted `bd`.
- [x] Working hours: Mon–Sat 09:00–18:00 Dubai (confirmed).
- [ ] Website form plugin on kreativefolio.com (CF7 / Elementor / WPForms).
- [ ] Meta: a page access token for Kreativefolio's own page/ad account (Phase 2).
- [ ] Column layout of the current Excel sheet — to be shared later.
- [ ] **Status:** proposal stage — awaiting approval before any build.
