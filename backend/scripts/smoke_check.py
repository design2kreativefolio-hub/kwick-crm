"""Smoke checks via real HTTP + JWT (avoids APIClient testserver host issues)."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import timedelta

from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.models import User
from ai.edith_prompt import SYSTEM_PROMPT
from config.celery import app
from dashboard.card_feed import build_dashboard_card_items
from notifications.tasks import send_open_item_nudges  # noqa: F401
from sales.models import Client
from sales.serializers import ClientSerializer
from todos.models import TodoItem

BASE = "http://127.0.0.1:8000"
user = User.objects.filter(email="admin@kreativefolio.com").first()
assert user, "admin missing"
token = str(RefreshToken.for_user(user).access_token)
results: list[tuple[bool, object, str, str]] = []


def req(method: str, path: str, data=None, expect=(200, 201, 204)):
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request(
        BASE + path,
        data=body,
        method=method.upper(),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Host": "localhost",
        },
    )
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            raw = resp.read().decode()
            code = resp.status
            parsed = json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raw = e.read().decode(errors="replace")
        code = e.code
        try:
            parsed = json.loads(raw) if raw else None
        except Exception:
            parsed = raw[:180]
    ok = code in expect
    results.append((ok, code, f"{method.upper()} {path}", "" if ok else str(parsed)[:180]))
    return code, parsed


for path in [
    "/api/auth/me",
    "/api/auth/employees",
    "/api/dashboard/summary",
    "/api/dashboard/reminders",
    "/api/dashboard/performance?granularity=daily&scope=company",
    "/api/dashboard/today-tasks",
    "/api/dashboard/projects-trend",
    "/api/dashboard/logs",
    "/api/dashboard/search?q=a",
    "/api/tasks",
    "/api/todos",
    "/api/calendar/agenda",
    "/api/calendar/reminders",
    "/api/projects/",
    "/api/projects/clients/",
    "/api/projects/artworks/",
    "/api/messages/conversations/",
    "/api/notifications/",
    "/api/renewals/",
    "/api/sales/clients/",
    "/api/sales/proposals/",
    "/api/sales/estimates/",
    "/api/sales/invoices/",
    "/api/hr/staff/",
    "/api/hr/leaves/",
    "/api/hr/tickets/",
    "/api/hr/letters/",
    "/api/hr/documents/",
    "/api/ai/status",
    "/api/ai/conversations/",
]:
    req("GET", path)

code, _ = req("GET", "/api/kanban/board", expect=(200, 404))

fields = set(ClientSerializer.Meta.fields)
results.append(
    (
        "start_date" in fields and "services" in fields,
        200,
        "ClientSerializer start_date+services",
        str(sorted(fields & {"start_date", "services"})),
    )
)
blank = Client.objects.filter(client_id="").count()
results.append((True, 200, f"blank client_id={blank}", "WARN" if blank else "ok"))
beat = "open-item-nudge-morning" in (app.conf.beat_schedule or {})
results.append((True, 200, "edith/celery", f"prompt={len(SYSTEM_PROMPT)} beat={beat}"))
results.append((isinstance(build_dashboard_card_items(user), list), 200, "card feed", f"n={len(build_dashboard_card_items(user))}"))

code, data = req(
    "POST",
    "/api/sales/clients/",
    {
        "name": "Smoke Test Client XYZ",
        "company": "Smoke Test Client XYZ",
        "contact_email": "smoke@example.com",
        "contact_phone": "+971500000000",
        "notes": "smoke",
        "website": "www.example.com",
        "address": "Dubai",
        "trade_license_url": "",
        "vat_registration_url": "",
        "executives": [],
        "additional_fields": [],
        "accent_color": "#3673FC",
        "start_date": "2026-01-15",
        "services": ["branding", "web_design"],
    },
)
if code in (200, 201) and isinstance(data, dict):
    cid = data["id"]
    dbc = Client.objects.get(pk=cid)
    ok = (
        dbc.start_date.isoformat() == "2026-01-15"
        and set(dbc.services) == {"branding", "web_design"}
        and bool(dbc.client_id)
    )
    results.append((ok, code, "client create fields+id", f"client_id={dbc.client_id}"))
    req("PATCH", f"/api/sales/clients/{cid}/", {"start_date": "2026-02-01", "services": ["podcast"]})
    dbc.refresh_from_db()
    results.append(
        (
            dbc.start_date.isoformat() == "2026-02-01" and dbc.services == ["podcast"],
            200,
            "client patch fields",
            "",
        )
    )
    req("DELETE", f"/api/sales/clients/{cid}/")

when = (timezone.now() + timedelta(days=2)).isoformat()
code, data = req(
    "POST",
    "/api/calendar/reminders/",
    {"title": "Smoke Rem Only", "remind_at": when, "description": ""},
)
if code in (200, 201) and isinstance(data, dict):
    rid = data["id"]
    dup = TodoItem.objects.filter(text="Smoke Rem Only", owner=user).count()
    results.append((dup == 0, 200, "reminder no todo mirror", f"todos={dup}"))
    req("DELETE", f"/api/calendar/reminders/{rid}/")

# frontend pages
for p in [
    "/login",
    "/register",
    "/dashboard",
    "/tasks",
    "/todo",
    "/calendar",
    "/sales/clients",
    "/sales/clients/new",
    "/projects/clients",
    "/ai",
    "/profile",
    "/reminders",
    "/chat",
    "/hr/staff",
    "/renewals",
    "/reports",
    "/support",
    "/logs",
]:
    try:
        with urllib.request.urlopen(f"http://frontend:3000{p}", timeout=12) as resp:
            results.append((resp.status == 200, resp.status, f"PAGE {p}", ""))
    except Exception as e:
        results.append((False, "ERR", f"PAGE {p}", str(e)[:120]))

# restore endpoint
req("POST", "/api/dashboard/reminders/restore", {})

ok = [r for r in results if r[0]]
fail = [r for r in results if not r[0]]
print(f"PASS {len(ok)}  FAIL {len(fail)}  TOTAL {len(results)}")
for o, code, label, body in results:
    mark = "OK " if o else "FAIL"
    extra = f" :: {body}" if body else ""
    print(f"{mark} [{code}] {label}{extra}")
