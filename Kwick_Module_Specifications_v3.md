# Kwick Internal Platform — Module Specifications (v3)

> **Purpose of this file:** hand this directly to Claude Code (or any coding agent) as the functional build spec. Architecture: **Next.js (frontend) + Django/DRF/Channels (backend, ASGI) + PostgreSQL + Redis + Celery**, deployed via Docker Compose on a single **OVH Cloud VPS-1** (Ubuntu 22.04, 2 vCores / 4 GB RAM / 40 GB NVMe SSD, daily snapshot backup). Two roles: `manager` (full access, sole company owner) and `employee` (restricted subset). Every access rule below must be enforced **server-side**, not just hidden in the frontend nav.
>
> This version supersedes `Kwick_Module_Specifications_v2.md` — it adds the full Dashboard specification (widgets, graphs, monthly-reset logic) and the Theme & Branding spec (colors, dark mode, logo).

---

## 0. Global Conventions

- Roles: `manager`, `employee` — checked via DRF permission classes and Channels consumer auth.
- All list endpoints paginated, default page size 25.
- Timestamps: UTC, ISO-8601. Every model gets `created_at` / `updated_at`.
- Money fields: `DecimalField(max_digits=12, decimal_places=2)`.
- Repo layout (monorepo): `backend/` (Django apps: accounts, hr, sales, projects, tasks, daily_tracker, calendar_app, kanban, messaging, notifications, renewals, dashboard, reports), `frontend/` (Next.js App Router), `docker-compose.yml`, `nginx/`.

---

## 1. Infrastructure Target

**OVH Cloud VPS-1, Ubuntu 22.04, 2 vCores / 4 GB RAM / 40 GB NVMe SSD, 500 Mbps, daily 24h snapshot.**

| Setting | Value |
|---|---|
| Postgres `shared_buffers` | ~256 MB, `max_connections` ~50 |
| Redis `maxmemory` | 256 MB, `allkeys-lru` (Channels layer + Celery broker only) |
| ASGI server workers | 2 (matches 2 vCores) |
| Celery worker concurrency | 2 |
| Next.js | `output: 'standalone'`, run via `node server.js` |
| Swap | add 2 GB on first provisioning |
| File storage | generated PDFs / artwork files go to OVH Object Storage (S3-compatible), never local disk |
| Backups | nightly `pg_dump` to Object Storage, in addition to the OVH VM snapshot |

---

## 2. Design Reference

The dashboard UI (layout, navigation, widgets, tables, charts) should follow the structure of this reference admin template — **for layout/component patterns only, not colors or branding**:

`https://niceadmin-angular-main.netlify.app/dashboards/dashboard3`

> **Instruction to the coding agent:** before implementing any dashboard screen, use your browser tool to open the URL above and inspect the live rendered layout yourself — do not rely solely on this written description.

Carry over: sidebar navigation grouping, top bar layout, card-based summary widgets, chart placement, and table styling patterns. Apply the branding defined in Section 3 on top — do **not** carry over NiceAdmin's own color palette.

---

## 3. Theme & Branding

| Token | Light mode | Dark mode |
|---|---|---|
| Background (primary surface) | White `#FFFFFF` | Navy `#1C1E54` |
| Primary brand / text-on-background | Navy `#1C1E54` | White `#FFFFFF` |
| Accent (icons, badges, active states, small highlights only — never large surfaces) | Gold `#CC9B6F` | Gold `#CC9B6F` (unchanged) |

**Rules**

- Primary palette is white + navy blue (`#1C1E54`). Gold (`#CC9B6F`) is an accent only — icons, small highlights, active-state indicators — never a dominant fill.
- Dark mode is **not** a generic black theme: it inverts white surfaces to the navy (`#1C1E54`), and inverts navy text/elements to white. Gold stays constant in both modes.
- Implement as CSS custom properties toggled via a `data-theme="dark"` attribute on the root element (e.g. `<html data-theme="dark">`), not hardcoded colors in components. A visible switch (sun/moon icon, following the NiceAdmin reference's placement pattern) toggles it; persist the choice in `localStorage`.
- Logo: Kreativefolio will drop a logo file directly into the `Kwick CRM Revamp` project folder — the coding agent should look for it there (e.g. `logo.svg` / `logo.png`) and wire it into the sidebar/top bar and the favicon. If not yet present when scaffolding begins, leave a clearly-labeled placeholder component (`<Logo />`) so it drops in without further changes.
- Provide both a light and dark logo variant if the source logo isn't colorway-agnostic (e.g. a navy wordmark won't read on a navy dark-mode background) — flag this back if only one version is supplied.

---

## 4. Module: Accounts & Auth

**Purpose:** registration, invite-code verification, manager approval, login, role-based routing.

**Data model**

| Model | Field | Notes |
|---|---|---|
| User | email, password, role, status | role: `manager`/`employee`; status: `pending`/`awaiting_approval`/`active`/`disabled` |
| StaffProfile (1:1 User) | job_title, department, date_joined, phone, avatar_url | extended in Section 5 |
| InviteCode | code_hash, issued_by, role_for, expires_at, used_by, used_at | single-use, hashed |

**API**

| Method & Path | Roles | Notes |
|---|---|---|
| `POST /api/auth/register` | Public | email, password, full_name, role, invite_code |
| `POST /api/auth/verify-invite` | Public | validates a code pre-submit |
| `POST /api/auth/login` | Public | JWT access/refresh + role/status |
| `GET /api/auth/me` | Authenticated | current user, role, status |
| `POST /api/auth/invite-codes` | Manager | issues employee invite codes |
| `POST /api/auth/approve/{user_id}` | Manager | status → active, Celery email (email only, no push) |

**Acceptance criteria**

- [ ] Employee cannot log in until `status=active`.
- [ ] Manager self-registering with a valid code skips approval entirely.
- [ ] Every module below has a test asserting `employee` gets 403 on manager-only endpoints.

---

## 5. Module: HR Management

**Purpose:** staff directory with a **per-staff detail page**, plus company-wide renewal reminders. **Manager only.**

### 5.1 Page structure

- **All Staffs** — list/search of every staff member.
- **Add Staffs** — create a new staff record (name, email, job title, department, date joined).
- **Individual Staff Detail page** — tabs: Overview, Offer/Experience/Relieving Letters + Salary Certificates (Employee Collaterals), Monthly Leaves (balance + history + pending requests), Tickets Raised.
- **Renewals Reminders** — top-level view filtered from the shared Renewals module (Section 15) where `subject_type=staff`.

### 5.2 Data model

| Model | Field | Notes |
|---|---|---|
| EmployeeCollateral | staff, category ("Employee Collaterals"), doc_type, file_url, generated_at, generated_by | doc_type: `offer_letter`/`experience_letter`/`relieving_letter`/`salary_certificate` |
| Leave | staff, leave_type, start_date, end_date, status, reason | leave_type: `annual`/`sick`/`unpaid`/`other`; status: `pending`/`approved`/`rejected` |
| LeaveBalance | staff, year, annual_allowance (default 30), used, pending | UAE default: 30 paid days/year |
| Ticket | raised_by, date, description, urgency, status | urgency: `low`/`medium`/`high`; status: `open`/`resolved` |

### 5.3 API

| Method & Path | Roles | Notes |
|---|---|---|
| `GET/POST /api/hr/staff` | Manager | list / add staff |
| `GET /api/hr/staff/{id}` | Manager | full staff detail |
| `POST /api/hr/employee-collaterals/{doc_type}` | Manager | generate PDF → Object Storage |
| `GET /api/hr/employee-collaterals/mine` | Employee | own issued letters (Edit Profile page) |
| `GET/POST /api/hr/leaves` | Manager | all leave requests |
| `GET /api/hr/leaves/balance` | Employee | own balance for current year |
| `POST /api/hr/leaves` | Employee | submit a leave request |
| `PATCH /api/hr/leaves/{id}` | Manager | approve / reject |
| `GET/POST /api/hr/tickets` | Manager, Employee | manager: all (per staff); employee: own only |
| `PATCH /api/hr/tickets/{id}` | Manager | mark resolved |

### 5.4 Business rules

- Leave balance defaults to 30 paid days/year (UAE standard); sick leave tracked as a separate `leave_type`.
- Submitting a leave request or a ticket creates a recurring reminder to the manager that re-fires daily while pending, and stops once actioned.
- One shared HTML template base powers all four Employee Collateral types.

### 5.5 Acceptance criteria

- [ ] `GET /api/hr/leaves/balance` correctly nets out approved + pending leave against the 30-day allowance.
- [ ] A manager stops receiving the recurring reminder the instant they action a leave/ticket.
- [ ] An employee only ever sees their own tickets/leaves; a manager sees everyone's, organized per staff member.

---

## 6. Module: Sales (CRM core)

**Purpose:** proposals, invoices, clients. **Manager only.**

| Model | Field | Notes |
|---|---|---|
| Client | name, contact_email, contact_phone, company, notes | renewal dates live in Renewals (Section 15) |
| Proposal | client, title, status, amount, valid_until | |
| Invoice | client, proposal, invoice_number, amount, status, due_date | status: `draft`/`sent`/`paid`/`overdue` — drives the Dashboard invoice widgets (Section 16) |
| InvoiceLineItem | invoice, description, quantity, unit_price | |

**API:** `GET/POST /api/sales/clients`, `/api/sales/proposals`, `/api/sales/invoices`, `POST /api/sales/invoices/{id}/pdf`.

---

## 7. Module: Projects & Artwork ID Generator

**Purpose:** project tracking plus the structured artwork reference-number generator. **Manager + Employee.**

**Artwork ID format:** `{Company}_{Client}_{Brand}_{ArtworkType}__{YYMMDD}_{Initials}_{CategoryCode}-{YYYY}{Seq:04d}` — e.g. `KF_Nevo_Food_U_Cacao_Packaging_Design__240726_RH_K-20244002`.

**Data model:** Project(name, client, **status**: `ongoing`/`completed`/`on_hold`, start_date, end_date — status drives the Dashboard "ongoing projects" widgets, Section 16), ProjectClient, CategoryCode, ArtworkType, ArtworkSequence(year, category_code, last_number), Artwork(project, client, brand, artwork_type, category_code, designer, artwork_id).

**Sequence rule (default):** resets to 1 each calendar year, scoped per category_code, generated atomically with `select_for_update()`.

**API:** `GET/POST /api/projects`, `POST /api/projects/artworks`, `GET /api/projects/artworks`, `/api/projects/category-codes`, `/api/projects/artwork-types`.

---

## 8. Module: Tasks

**Purpose:** project-linked task tracking. **Manager + Employee** (employee sees only their own by default).

**Data model:** Task(title, description, project FK nullable, assignee FK User, status, priority, due_date, **completed_at** (nullable, set when status → completed — drives the Dashboard's monthly-reset completed count, Section 16), board_status, board_order).

**API:** `GET/POST /api/tasks`, `GET /api/tasks/my`.

**Acceptance criteria:** `GET /api/tasks/{id}` never leaks another employee's task to a non-manager.

---

## 9. Module: Daily Tracker

**Purpose:** a lightweight, ad-hoc task log — separate from project Tasks. For quick items like "call a client" or "email the client." **Manager + Employee**, each managing their own entries.

**Data model:** DailyTrackerEntry(user, task_name, description, date) — intentionally minimal, no project link, no status field.

**API:** `GET/POST /api/daily-tracker` — own entries only; manager can filter `?user=`.

---

## 10. Module: Calendar

**Purpose:** a merged, read-aggregated calendar view. **Manager + Employee.**

| Source | Employee view | Manager view |
|---|---|---|
| Tasks | own tasks with a due_date | all employees' tasks |
| Daily Tracker | own entries | all employees' entries (optional toggle) |
| Manual reminders | own | own + company-wide |
| Renewals | — | client + staff renewals |

**Data model:** ManualReminder(owner, title, remind_at, visibility).

**API:** `GET /api/calendar/agenda?from=&to=&scope=` (scope=all is manager-only; items tagged `source`: task/daily_tracker/renewal/manual), `GET/POST /api/calendar/reminders`.

---

## 11. Module: Kanban

**Purpose:** visual board over existing Tasks. **Manager only.** Reuses `tasks.Task` (`board_status`, `board_order`).

**API:** `GET /api/kanban/board`, `PATCH /api/kanban/tasks/{id}/move`.

---

## 12. Module: Messaging (instant, real-time)

**Purpose:** internal chat over WebSockets (Django Channels), not polling. **Manager + Employee.**

**Data model:** Conversation (participants M2M), Message (conversation, sender, body, read_by M2M).

**API:** `GET/POST /api/messages/conversations`, `GET /api/messages/conversations/{id}/messages`, `WS /ws/messages/`.

---

## 13. Module: Notifications (push + in-app)

**Purpose:** desktop push delivery for time-based/status-based reminders, separate from the email-only Accounts approval flow and the Messaging WebSocket channel.

**Data model:** PushSubscription(user, endpoint, keys), NotificationEvent(user, source, title, body, sent_at, read_at, recurring, last_sent_at — source: `renewal`/`calendar`/`task`/`leave_request`/`ticket`).

**API:** `POST /api/notifications/push-subscribe`, `DELETE /api/notifications/push-subscribe`, `GET /api/notifications`.

**Business rules:** delivery via `pywebpush` + VAPID; every push mirrors as a WebSocket event for an instant in-app toast; recurring-until-actioned for leave requests/tickets; approval/account emails never go through this module.

---

## 14. Module: Renewals

**Purpose:** track renewal dates for clients and staff in one shared system, feeding Calendar, Notifications, and the Dashboard reminders feed. **Manager only** to manage.

**Data model:** Renewal(subject_type: `client`/`staff`, client FK nullable, staff FK nullable, renewal_type: `hosting`/`domain`/`contract`/`visa`/`other`, due_date, notes, status: `upcoming`/`renewed`/`overdue`).

**API:** `GET/POST /api/renewals` (filterable by `subject_type`, `client_id`, `staff_id`).

**Business rule:** Celery Beat flags renewals within lead windows (default 30/14/7/1 days) and dispatches push notifications; status auto-flips to `overdue` past `due_date`.

---

## 15. Module: Dashboard

**Purpose:** the landing view for both roles. Employee sees their own workload; Manager sees a fuller, company-wide view. **No new core business models** — this is a read/aggregation + charting layer over Tasks, Projects, Sales, Calendar, and Renewals.

### 15.1 Employee Dashboard

| Widget | Source | Notes |
|---|---|---|
| Pending Tasks | Tasks | count/list where `status != completed`, assignee = self |
| Completed Tasks (this month) | Tasks | count where `status = completed` and `completed_at` falls in the current calendar month — **resets naturally each month** since it's a live filter, not a stored counter |
| Ongoing Projects | Projects | projects the employee is assigned to with `status = ongoing` |
| Reminders | Calendar (Section 10) + Renewals (Section 14) + Notifications (Section 13) | merged feed: daily reminders, task due dates, renewals — same priority ordering as the reminders feed already defined |
| Performance graph | Tasks | tasks completed by self, plotted over a selectable range: **daily / weekly / monthly** (user-switchable toggle on the widget) |

### 15.2 Manager Dashboard

Everything above, company-wide, plus:

| Widget | Source | Notes |
|---|---|---|
| Total Tasks (company) | Tasks | all employees, not just self |
| Completed Tasks (company, this month) | Tasks | same monthly-reset logic as employee view, company-wide |
| Total Invoices | Sales | count of all invoices |
| Pending Invoices | Sales | count where `status` in `sent`/`overdue` |
| Ongoing Projects (company) | Projects | count where `status = ongoing` |
| Projects-per-month graph | Projects | trend chart: number of projects started per month, last 12 months |
| Performance graph (company) | Tasks | same daily/weekly/monthly toggle, aggregated across all employees |

### 15.3 API

| Method & Path | Roles | Notes |
|---|---|---|
| `GET /api/dashboard/summary` | Manager, Employee | scoped counts: pending tasks, completed-this-month, ongoing projects (+ invoices/company totals for manager) |
| `GET /api/dashboard/reminders` | Manager, Employee | merged, priority-ordered reminders feed (as defined earlier) |
| `GET /api/dashboard/performance?granularity=daily\|weekly\|monthly&scope=self\|company` | Manager, Employee | `scope=company` is manager-only; time-series of completed task counts |
| `GET /api/dashboard/projects-trend?months=12` | Manager | projects-started-per-month series |

### 15.4 Acceptance criteria

- [ ] "Completed this month" always reflects only the current calendar month — verify it drops last month's count automatically on the 1st without any scheduled reset job.
- [ ] Employee-scoped dashboard endpoints never return another employee's data; manager-scoped ones aggregate correctly across all employees.
- [ ] The performance graph's granularity toggle re-queries rather than just re-labeling the same fixed dataset.

---

## 16. Module: Reports

**Purpose:** cross-module summary for managers. **Manager only, no new models.**

**API:** `GET /api/reports/summary` — open proposals, overdue invoices, active projects, open tasks, upcoming renewals, pending approvals.

---

## 17. Module: Profile

### 17.1 Employee Profile

- **Leave Request:** remaining balance vs. 30-day/year allowance; leave type incl. sick leave; date-range picker; submit. Triggers the recurring manager reminder until actioned.
- **Raise a Ticket:** minimal form — date, description, urgency; submit.
- **Edit Profile:** editable — profile picture, username, password, email, phone number. Role is locked. Shows issued Employee Collateral letters as downloadable files.

### 17.2 Manager Profile

- **Edit Profile only** — same fields, role locked. No Leave Request or Raise a Ticket.

---

## 18. Build Order (Reference)

1. Accounts & Auth + base Docker Compose/Nginx skeleton on the VPS + theme tokens/dark-mode scaffolding.
2. Sales + HR staff basics (staff detail page, Employee Collaterals skeleton).
3. Projects (incl. Artwork ID generator) + Tasks + Daily Tracker + Kanban.
4. Messaging (WebSocket) + Notifications (push, incl. recurring-until-actioned) + Accounts email.
5. Calendar aggregation + Renewals + Dashboard (summary, reminders, performance graph, projects trend) + Reports.
6. Hardening: permission audit, concurrency test on the artwork sequence, backups, deploy polish.

---

## 19. Still Needs a Decision Before Build

- [ ] Final copy/formatting for each Employee Collateral letter.
- [ ] Confirm artwork sequence resets yearly per category.
- [ ] Full CategoryCode list beyond the example `K`.
- [ ] OVH Object Storage bucket/region details.
- [ ] Renewal lead-time windows (30/14/7/1 days is a default assumption).
- [ ] Exact ticket urgency levels/labels beyond low/medium/high.
- [ ] Logo file(s) — light/dark variants — to be added to the `Kwick CRM Revamp` folder.
- [ ] Daily Tracker — confirm no completion/status field is needed.
- [ ] Whether "ongoing projects" on the employee dashboard means projects they're assigned to, or all company projects (currently spec'd as assigned-to-self for employee, company-wide for manager).
