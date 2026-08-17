# Kwick — Internal Platform (Kreativefolio)

A role-based internal CRM/operations platform: **Next.js** frontend + **Django/DRF/Channels** backend (ASGI) + **PostgreSQL** + **Redis** + **Celery**, deployed via Docker Compose on a single **OVH Cloud VPS-1** (Ubuntu 22.04, 2 vCores / 4 GB RAM / 40 GB NVMe SSD).

Two roles: `manager` (full access, company owner) and `employee` (restricted subset). **All access rules are enforced server-side** via DRF permission classes and Channels consumer auth — not just hidden in the frontend nav.

> Build spec: [`Kwick_Module_Specifications_v3.md`](./Kwick_Module_Specifications_v3.md)

---

## Repo layout

```
.
├── backend/            # Django project (ASGI) + apps
│   ├── config/         # settings, urls, asgi/wsgi, celery, channels routing
│   ├── common/         # shared base model, permissions, pagination
│   ├── accounts/       # auth, invite codes, approval, roles
│   ├── hr/             # staff, collaterals, leaves, tickets
│   ├── sales/          # clients, proposals, invoices
│   ├── projects/       # projects + artwork ID generator
│   ├── tasks/          # project-linked tasks (+ kanban board fields)
│   ├── daily_tracker/  # lightweight personal task log
│   ├── calendar_app/   # merged agenda + manual reminders
│   ├── kanban/         # board view over tasks
│   ├── messaging/      # real-time chat (Channels/WebSockets)
│   ├── notifications/  # web-push + in-app events
│   ├── renewals/       # client/staff renewals feed
│   ├── dashboard/      # aggregation + charts (no new models)
│   └── reports/        # cross-module manager summary
├── frontend/           # Next.js App Router (output: standalone)
├── nginx/              # reverse proxy (HTTP + WebSocket upgrade)
├── docker-compose.yml  # tuned for VPS-1
└── .env.example
```

## Status of this scaffold (first pass)

| Area | State |
|---|---|
| Repo structure, Docker Compose, Nginx | ✅ tuned for VPS-1 |
| All models + migrations across 13 apps | ✅ per spec |
| DRF CRUD viewsets + role-based permissions | ✅ |
| Accounts & Auth (JWT, invite codes, manager approval) | ✅ working |
| Frontend theme tokens / dark mode / logo / auth / dashboard shell | ✅ |
| Channels messaging consumer | ⏳ working skeleton (see `messaging/consumers.py` TODOs) |
| Celery beat (renewal windows, recurring reminders) | ⏳ tasks wired, tune schedules |
| Web push (pywebpush + VAPID) | ⏳ endpoints wired, generate VAPID keys |
| PDF generation (Employee Collaterals / invoices) | ⏳ stubbed with TODOs |
| Dashboard charts live data | ✅ endpoints; frontend charts wired to sample→live |

`⏳` = wired with a working skeleton + clear `TODO` markers for the next iteration.

---

## Local development (Docker)

```bash
cp .env.example .env          # then edit values
docker compose up --build
```

Services:
- Frontend → http://localhost:3000
- API → http://localhost:8000
- Postgres → localhost:5432, Redis → localhost:6379

The backend container runs migrations on startup (see `backend/entrypoint.sh`). Create the first manager:

```bash
docker compose exec backend python manage.py createsuperuser
# or bootstrap a manager + first invite code:
docker compose exec backend python manage.py bootstrap_manager
```

## Local development (without Docker)

Backend:
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver            # dev only; production uses Daphne/Uvicorn ASGI
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

---

## Deployment (OVH VPS-1)

**Full workflow (Git push → VPS pull, paths, SSH key, data safety):** [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md)

Production live path: **`/opt/kwick`**. After `git pull`, run `bash scripts/deploy-vps.sh` on the VPS.

1. Provision Ubuntu 22.04, add **2 GB swap**, install Docker + Docker Compose plugin.
2. Point DNS: `yourdomain.com` → frontend, `api.yourdomain.com` → backend (or IP-only for testing).
3. `cp .env.example .env`, fill in secrets, domains, S3, SMTP, VAPID keys.
4. `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build`.
5. TLS: Let's Encrypt via `docker-compose.prod.yml` (see [`nginx/README.md`](./nginx/README.md)).
6. Backups: nightly `pg_dump` → OVH Object Storage, in addition to the daily VM snapshot.

### Resource tuning baked in
- Postgres: `shared_buffers=256MB`, `max_connections=50`
- Redis: `maxmemory 256mb`, `allkeys-lru`
- ASGI workers: 2 · Celery concurrency: 2
- Next.js `output: 'standalone'`

---

## Open decisions (from spec §19)

Defaults applied in this scaffold — confirm/override later:
- Leave allowance: **30 paid days/year** (UAE).
- Renewal lead windows: **30 / 14 / 7 / 1 days**.
- Artwork sequence: **resets yearly, per `category_code`**.
- Ticket urgency: **low / medium / high**.
- Logos: `KF BLUE.png` → light mode, `KF WHITE.png` → dark mode, `icon only logo.png` → favicon/collapsed sidebar (copied into `frontend/public/`).
- Employee "ongoing projects" = **projects assigned to self**; manager = **company-wide**.

Still needs your input: exact Collateral letter copy, full CategoryCode list, OVH bucket/region.
