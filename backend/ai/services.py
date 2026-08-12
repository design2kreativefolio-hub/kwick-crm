"""EDITH chat service — CRM-aware answers, optional LLM later."""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .context import build_crm_context, context_as_text
from .models import Conversation, Message
from .report_intent import maybe_handle_report

SYSTEM_PROMPT = """You are EDITH, the AI assistant inside Kwick CRM (Kreativefolio). You know the product, help with work, and answer general questions.

Rules:
- CRM facts (people, tasks, projects, leaves, docs, clients, proposals, estimates, invoices, renewals, reminders, tickets, content calendar): use ONLY the CRM CONTEXT below. Never invent names, amounts, invoice numbers, or records. If something is missing, say you don't have it.
- READ-ONLY for CRM: never claim you created, updated, approved, or deleted anything. Tell the user which screen to use.
- Timing: use CRM CONTEXT "Today" / "Local time" / timezone for greetings and overdue wording. Match morning/afternoon/evening to Local time.
- Images: describe and analyze helpfully; tie to Kwick work only when relevant.
- General knowledge (news, sports, writing, brainstorming): answer from your knowledge. NEVER refuse with "no internet / live feeds / real-time data". If unsure about freshness, give a useful answer and briefly note it may not be fully up to date. Do NOT pivot to CRM unless they ask about work.
- Be concise (<280 words unless they ask for more). Prefer bullet lists for briefings. Name the right path when guiding ("open Sales → Invoices").

Product map (paths):
- /dashboard — overview · /ai — EDITH (you) · /chat — team messaging (not you)
- Work: /projects · /projects/clients (+ /projects/clients/[id]/calendar content calendar) · /projects/artwork · /tasks · /todo · /calendar · /reminders
- Sales (needs sales access): /sales/clients · /sales/proposals · estimates via Proposals UI · /sales/invoices
- HR (needs hr): /hr/staff · /hr/documents · leave requests at /profile · approve leaves on staff pages
- Renewals (needs renewals): /renewals · Reports (needs reports): /reports
- Profile /profile (edit, leave requests, raise ticket) · Support /support (email design@kreativefolio.com, WhatsApp +971 50 521 1969)

Important distinctions:
- Tasks (/tasks) = shared work items with assignees. To-Do (/todo) = personal checklist.
- Sales Clients vs Projects → Clients: same client records; Sales = CRM/commercial; Projects Clients = ops + content calendar.
- Tickets = raised from Profile; Support page = external contact form (not ticket records).
- Module access is listed in CONTEXT; do not promise HR/Sales/Renewals/Reports data the user cannot see.
- Reports: users with Reports access can generate Employee activity or Client work/renewals reports (custom date range) on /reports, and download PDF. If they ask you for a report, ask for any missing pieces (employee vs client, name, date range). Do not invent report numbers — the app generates real reports separately when slots are complete.

Status vocabulary:
- Task: todo | in_progress | completed · Project: assigned | started | waiting_approval | completed
- Leave: pending | approved | rejected (types: annual, sick, unpaid, other; ~30 days/year UAE default)
- Proposal/Estimate: draft | sent | accepted | rejected · Invoice: draft | sent | paid | overdue
- Renewal: upcoming | renewed | overdue (types: hosting, domain, contract, visa, other)
- Content calendar item: planned | in_progress | done · Ticket: open | resolved (urgency low/medium/high)
- HR letter: draft | issued

How-to shortcuts:
- Request leave → Profile → Leave Requests · Approve leave → HR → Staff
- Raise ticket → Profile → Raise Ticket · Create estimate → Sales → Proposals
- Content posts → Projects → Clients → open client calendar · Artwork IDs → Projects → Artwork
"""

RETENTION_DAYS = 15


def purge_stale_for_user(user) -> None:
    """Delete this user's chats inactive for 15+ days (also run globally via Celery)."""
    cutoff = timezone.now() - timedelta(days=RETENTION_DAYS)
    Conversation.objects.filter(user=user, updated_at__lt=cutoff).delete()


def ai_status() -> dict:
    enabled = bool(getattr(settings, "AI_ENABLED", True))
    from .tts import tts_configured

    return {
        "enabled": enabled,
        "name": "EDITH",
        "voice": "elevenlabs" if tts_configured() else "browser",
    }


def chat(
    user,
    messages: list[dict],
    conversation: Conversation | None = None,
    images: list[dict] | None = None,
) -> dict:
    if not getattr(settings, "AI_ENABLED", True):
        return {"reply": "EDITH is currently unavailable.", "links": []}

    images = _normalize_images(images or [])
    cleaned = []
    for m in messages[-12:]:
        role = (m.get("role") or "").strip()
        content = (m.get("content") or "").strip()
        atts = m.get("attachments") or []
        if role in {"user", "assistant"} and (content or atts):
            cleaned.append(
                {
                    "role": role,
                    "content": content[:4000],
                    "attachments": atts if role == "user" else [],
                }
            )
    if not cleaned or cleaned[-1]["role"] != "user":
        return {"reply": "Send a message to get started.", "links": []}

    # Attach current-turn images onto the last user message for the model + storage.
    if images:
        cleaned[-1]["attachments"] = images
        if not cleaned[-1]["content"]:
            cleaned[-1]["content"] = "Please analyze the attached image(s)."

    ctx = build_crm_context(user)
    last = cleaned[-1]["content"]

    # Deterministic report flow (clarify → generate PDF) before LLM.
    report_result = maybe_handle_report(user, cleaned, last)
    if report_result is not None:
        report_result.setdefault("user_attachments", images)
        return report_result

    if getattr(settings, "AI_API_KEY", ""):
        try:
            reply = _llm_reply(ctx, cleaned)
            return {
                "reply": reply,
                "links": _suggested_links(last, ctx),
                "attachments": [],
                "user_attachments": images,
            }
        except Exception:
            local = _local_reply(last, ctx)
            if images:
                local["reply"] = (
                    "I received your image(s), but image analysis needs the AI model online. "
                    + (local.get("reply") or "")
                ).strip()
            local["links"] = _suggested_links(last, ctx)
            local["attachments"] = []
            local["user_attachments"] = images
            return local

    local = _local_reply(last, ctx)
    if images:
        local["reply"] = (
            "Image analysis requires AI to be configured (AI_API_KEY). "
            + (local.get("reply") or "")
        ).strip()
    local["links"] = _suggested_links(last, ctx)
    local["attachments"] = []
    local["user_attachments"] = images
    return local


def ensure_conversation(user, conversation_id=None) -> Conversation:
    purge_stale_for_user(user)
    if conversation_id:
        conv = Conversation.objects.filter(pk=conversation_id, user=user).first()
        if conv:
            return conv
    return Conversation.objects.create(user=user, title="New chat")


def append_exchange(conversation: Conversation, user_text: str, result: dict) -> Conversation:
    Message.objects.create(
        conversation=conversation,
        role=Message.Role.USER,
        content=user_text,
        attachments=result.get("user_attachments") or [],
    )
    Message.objects.create(
        conversation=conversation,
        role=Message.Role.ASSISTANT,
        content=result.get("reply") or "",
        links=result.get("links") or [],
        attachments=result.get("attachments") or [],
    )
    if conversation.title in {"", "New chat", "New Chat"}:
        seed = user_text.strip() or ("Image analysis" if result.get("attachments") else "New Chat")
        conversation.title = _title_case(seed[:60]) or "New Chat"
        if len(seed) > 60:
            conversation.title = conversation.title[:57].rstrip() + "…"
    conversation.save(update_fields=["title", "updated_at"])
    return conversation


def _title_case(text: str) -> str:
    words = re.findall(r"[A-Za-z0-9']+|[^\w\s]+|\s+", text.strip().lower())
    out = []
    for w in words:
        if re.fullmatch(r"[A-Za-z0-9']+", w):
            out.append(w[0].upper() + w[1:] if w else w)
        else:
            out.append(w)
    return "".join(out).strip()


def _local_reply(text: str, ctx: dict) -> dict:
    q = text.lower().strip()

    if _match(q, ["help", "what can you", "what do you", "capabilities", "how do i use"]):
        access = ctx.get("access") or {}
        mods = []
        if access.get("hr"):
            mods.append("HR (staff, leaves, documents)")
        if access.get("sales"):
            mods.append("Sales (clients, proposals, estimates, invoices)")
        if access.get("renewals"):
            mods.append("Renewals")
        if access.get("reports"):
            mods.append("Reports")
        mod_line = ", ".join(mods) if mods else "core work modules only"
        return {
            "reply": (
                f"Hi {ctx.get('user_name', 'there')} — I'm EDITH for Kwick CRM.\n\n"
                "I can look up (read-only):\n"
                "• Tasks vs personal To-Dos, projects & content calendar\n"
                "• Who is doing what, reminders, tickets\n"
                "• Leave balances & pending leave requests\n"
                f"• Your modules: {mod_line}\n\n"
                "I also help with writing, brainstorming, news, and image review.\n"
                "How-tos: request leave → Profile · raise ticket → Profile · "
                "create estimate → Sales → Proposals.\n"
                "Team chat is under Chat (not me). Support: design@kreativefolio.com "
                "or WhatsApp +971 50 521 1969.\n"
                "Try: “What needs attention?”, “Pending leaves”, “Open invoices”, or “Where do I request leave?”."
            ),
            "links": [
                {"label": "Tasks", "href": "/tasks", "icon": "bi-check-square-fill"},
                {"label": "Calendar", "href": "/calendar", "icon": "bi-calendar3-fill"},
                {"label": "Dashboard", "href": "/dashboard", "icon": "bi-grid-1x2-fill"},
            ],
        }

    if _match(q, ["employee", "employees", "staff", "team member", "who works", "my team"]):
        employees = ctx.get("employees") or []
        if "employees_count" not in ctx:
            return {
                "reply": "I don't have team data in this session. Try again in a moment.",
                "links": [],
            }
        lines = [f"Active team members in Kwick: **{ctx.get('employees_count', len(employees))}**"]
        for e in employees[:20]:
            extra = []
            if e.get("job_title"):
                extra.append(e["job_title"])
            if e.get("department"):
                extra.append(e["department"])
            if e.get("role"):
                extra.append(e["role"])
            suffix = f" — {', '.join(extra)}" if extra else ""
            lines.append(f"• {e.get('name')}{suffix}")
        if ctx.get("employees_count", 0) > len(employees):
            lines.append(f"\n(Showing first {len(employees)}; open HR for the full list.)")
        return {
            "reply": "\n".join(lines),
            "links": [{"label": "Staff", "href": "/hr/staff", "icon": "bi-people-fill"}],
        }

    if _match(q, ["client", "clients", "customer", "customers"]):
        if "clients_count" not in ctx:
            return {
                "reply": "You don't have Sales access, so I can't see the client list.",
                "links": [{"label": "Dashboard", "href": "/dashboard", "icon": "bi-grid-1x2-fill"}],
            }
        clients = ctx.get("clients") or []
        lines = [f"Clients in Kwick: **{ctx.get('clients_count', len(clients))}**"]
        for c in clients[:15]:
            label = c.get("name") or c.get("company") or "Unnamed"
            cid = f" ({c['client_id']})" if c.get("client_id") else ""
            poc = f" — POC {c['poc_name']}" if c.get("poc_name") else ""
            lines.append(f"• {label}{cid}{poc}")
        if ctx.get("clients_count", 0) > len(clients):
            lines.append(f"\n(Showing first {len(clients)}; open Clients for the full list.)")
        return {
            "reply": "\n".join(lines),
            "links": [
                {"label": "Clients", "href": "/sales/clients", "icon": "bi-building"},
            ],
        }

    if _match(q, ["hello", "hi ", "hey", "good morning", "good afternoon", "good evening"]) or q in {
        "hi",
        "hello",
        "hey",
    }:
        part = ctx.get("part_of_day") or "day"
        greet = {"morning": "Good morning", "afternoon": "Good afternoon", "evening": "Good evening"}.get(
            part, "Hello"
        )
        return {
            "reply": (
                f"{greet}, {ctx.get('user_name', 'there')}! "
                f"You have {ctx.get('open_tasks_count', 0)} open task(s) and "
                f"{ctx.get('active_projects_count', 0)} active project(s). "
                "Ask “What needs attention?” for a quick briefing."
            ),
            "links": [{"label": "Dashboard", "href": "/dashboard", "icon": "bi-grid-1x2-fill"}],
        }

    if _match(
        q,
        [
            "attention",
            "brief",
            "summary",
            "overview",
            "status",
            "priority",
            "plan my week",
            "this week",
        ],
    ):
        parts = [f"**Today's briefing for {ctx.get('user_name')}** ({ctx.get('today')})"]
        parts.append(f"• Open tasks: **{ctx.get('open_tasks_count', 0)}**")
        for t in (ctx.get("open_tasks") or [])[:5]:
            due = f", due {t['due_date']}" if t.get("due_date") else ""
            who = f", {t['assignee']}" if t.get("assignee") else ""
            parts.append(f"  – {t['title']} ({t['status']}{who}{due})")
        if ctx.get("workload"):
            parts.append("• Workload:")
            for w in ctx["workload"][:6]:
                parts.append(f"  – {w['person']}: {w['open_tasks']} open")
        if ctx.get("todos"):
            parts.append(f"• To-dos: **{len(ctx['todos'])}**")
            for t in ctx["todos"][:4]:
                parts.append(f"  – {t['title']}")
        parts.append(f"• Active projects: **{ctx.get('active_projects_count', 0)}**")
        for p in (ctx.get("active_projects") or [])[:4]:
            parts.append(f"  – {p['name']} [{p['status']}]")
        if ctx.get("upcoming_reminders"):
            parts.append(f"• Reminders (7 days): **{len(ctx['upcoming_reminders'])}**")
            for r in ctx["upcoming_reminders"][:4]:
                parts.append(f"  – {r['title']}")
        if "pending_leaves_count" in ctx and ctx.get("pending_leaves_count"):
            parts.append(f"• Pending leaves: **{ctx['pending_leaves_count']}**")
        if "open_tickets_count" in ctx and ctx.get("open_tickets_count"):
            parts.append(f"• Open tickets: **{ctx['open_tickets_count']}**")
        if "content_calendar_count" in ctx and ctx.get("content_calendar_count"):
            parts.append(f"• Content posts due (14d): **{ctx['content_calendar_count']}**")
            for item in (ctx.get("content_calendar") or [])[:3]:
                parts.append(
                    f"  – {item.get('title')} ({item.get('client') or '—'}, {item.get('scheduled_date')})"
                )
        if "overdue_invoices_count" in ctx:
            parts.append(f"• Overdue invoices: **{ctx['overdue_invoices_count']}**")
        if "open_estimates_count" in ctx and ctx.get("open_estimates_count"):
            parts.append(f"• Open estimates: **{ctx['open_estimates_count']}**")
        if "overdue_renewals_count" in ctx and ctx.get("overdue_renewals_count"):
            parts.append(f"• Overdue renewals: **{ctx['overdue_renewals_count']}**")
        if "upcoming_renewals_count" in ctx:
            parts.append(f"• Renewals due soon: **{ctx['upcoming_renewals_count']}**")
        parts.append("\nSuggested next step: clear overdue items, then schedule the rest on Calendar.")
        links = [
            {"label": "Tasks", "href": "/tasks", "icon": "bi-check-square-fill"},
            {"label": "Calendar", "href": "/calendar", "icon": "bi-calendar3-fill"},
        ]
        if "overdue_invoices_count" in ctx:
            links.append({"label": "Invoices", "href": "/sales/invoices", "icon": "bi-receipt"})
        return {"reply": "\n".join(parts), "links": links}

    if _match(q, ["who is doing", "who's doing", "workload", "who working", "assigned to"]):
        if ctx.get("workload"):
            lines = ["**Who is doing what** (open tasks):"]
            for w in ctx["workload"]:
                lines.append(f"• **{w['person']}** — {w['open_tasks']} open")
            lines.append("\nDetails:")
            for t in (ctx.get("open_tasks") or [])[:15]:
                due = f", due {t['due_date']}" if t.get("due_date") else ""
                proj = f" · {t['project']}" if t.get("project") else ""
                lines.append(f"• {t.get('assignee')}: {t['title']} [{t['status']}]{proj}{due}")
            return {
                "reply": "\n".join(lines),
                "links": [{"label": "Tasks", "href": "/tasks", "icon": "bi-check-square-fill"}],
            }
        lines = [f"Open tasks visible to you: **{ctx.get('open_tasks_count', 0)}**"]
        for t in ctx.get("open_tasks") or []:
            lines.append(f"• {t.get('assignee') or 'You'}: {t['title']} [{t['status']}]")
        return {
            "reply": "\n".join(lines),
            "links": [{"label": "Tasks", "href": "/tasks", "icon": "bi-check-square-fill"}],
        }

    if _match(q, ["task", "todo", "to-do", "to do"]):
        lines = [f"**{ctx.get('open_tasks_count', 0)}** open task(s)."]
        for t in ctx.get("open_tasks") or []:
            due = f" · due {t['due_date']}" if t.get("due_date") else ""
            who = f" · {t['assignee']}" if t.get("assignee") else ""
            lines.append(f"• {t['title']} — {t['status']}{who}{due}")
        if ctx.get("todos"):
            lines.append("\nPersonal to-dos:")
            for t in ctx["todos"]:
                due = f" (due {t['due_date']})" if t.get("due_date") else ""
                lines.append(f"• {t['title']}{due}")
        if ctx.get("open_tasks_count", 0) == 0 and not ctx.get("todos"):
            lines.append("Nothing open — nice work.")
        return {
            "reply": "\n".join(lines),
            "links": [
                {"label": "Open Tasks", "href": "/tasks", "icon": "bi-check-square-fill"},
                {"label": "To-Do", "href": "/todo", "icon": "bi-ui-checks-grid"},
            ],
        }

    if _match(q, ["project"]):
        lines = [f"Active projects: **{ctx.get('active_projects_count', 0)}**"]
        for p in ctx.get("active_projects") or []:
            members = ", ".join(p.get("members") or []) or "—"
            client = p.get("client") or "—"
            lines.append(f"• {p['name']} [{p['status']}] — client {client}; members: {members}")
        if not ctx.get("active_projects"):
            lines.append("No active projects assigned to you.")
        return {
            "reply": "\n".join(lines),
            "links": [{"label": "Projects", "href": "/projects", "icon": "bi-kanban-fill"}],
        }

    if _match(q, ["where do i", "how do i", "how to", "request leave", "raise a ticket", "raise ticket"]):
        if _match(q, ["leave", "time off", "vacation"]):
            return {
                "reply": (
                    "To **request leave**: open Profile → Leave Requests, submit type/dates.\n"
                    "HR/superadmin approve from HR → Staff.\n"
                    f"You currently have **{ctx.get('pending_leaves_count', 0)}** pending leave request(s) in view."
                ),
                "links": [
                    {"label": "Profile", "href": "/profile", "icon": "bi-person-circle"},
                    {"label": "Staff", "href": "/hr/staff", "icon": "bi-people-fill"},
                ],
            }
        if _match(q, ["ticket", "support", "help desk"]):
            return {
                "reply": (
                    "To **raise a ticket**: Profile → Raise Ticket (urgency + description).\n"
                    "For external help: Support page — design@kreativefolio.com or WhatsApp +971 50 521 1969.\n"
                    "Team messaging is under Chat (separate from EDITH)."
                ),
                "links": [
                    {"label": "Profile", "href": "/profile", "icon": "bi-person-circle"},
                    {"label": "Support", "href": "/support", "icon": "bi-headset"},
                    {"label": "Chat", "href": "/chat", "icon": "bi-chat-dots-fill"},
                ],
            }
        if _match(q, ["estimate", "quote"]):
            return {
                "reply": "Create an estimate from **Sales → Proposals** (Create Estimate). Statuses: draft, sent, accepted, rejected.",
                "links": [{"label": "Proposals", "href": "/sales/proposals", "icon": "bi-file-earmark-text"}],
            }
        if _match(q, ["invoice"]):
            return {
                "reply": "Manage invoices under **Sales → Invoices**. Statuses: draft, sent, paid, overdue.",
                "links": [{"label": "Invoices", "href": "/sales/invoices", "icon": "bi-receipt"}],
            }
        return {
            "reply": (
                "Common paths:\n"
                "• Leave → Profile · Tickets → Profile · Chat → /chat\n"
                "• Tasks → /tasks · Personal to-dos → /todo · Calendar → /calendar\n"
                "• Sales clients/proposals/invoices · HR staff/documents · Renewals\n"
                "Ask “Help” for a full capability list."
            ),
            "links": [{"label": "Dashboard", "href": "/dashboard", "icon": "bi-grid-1x2-fill"}],
        }

    if _match(q, ["leave", "leaves", "time off", "vacation", "holiday request", "balance"]):
        if "pending_leaves_count" not in ctx and "leave_balances" not in ctx:
            return {
                "reply": "I couldn't load leave data right now.",
                "links": [{"label": "HR Staff", "href": "/hr/staff", "icon": "bi-people-fill"}],
            }
        lines = []
        if "leave_balances" in ctx:
            year = ctx.get("leave_balances_year")
            lines.append(f"**Leave balances ({year}):**")
            for b in ctx.get("leave_balances") or []:
                lines.append(
                    f"• {b.get('staff')} — remaining **{b.get('remaining')}** "
                    f"(allowance {b.get('annual_allowance')}, used {b.get('used')}, "
                    f"pending {b.get('pending')})"
                )
            if not ctx.get("leave_balances"):
                lines.append("No leave balance records for this year yet.")
            lines.append("")
        n = ctx.get("pending_leaves_count", 0)
        lines.append(f"**Pending leave requests:** {n}")
        for lv in ctx.get("pending_leaves") or []:
            lines.append(
                f"• {lv.get('staff')} — {lv.get('leave_type')} "
                f"{lv.get('start_date')} → {lv.get('end_date')} ({lv.get('days')}d)"
            )
        if n == 0:
            lines.append("None pending.")
        lines.append("\nRequest leave from Profile → Leave Requests. HR approves on Staff.")
        return {
            "reply": "\n".join(lines),
            "links": [
                {"label": "Profile", "href": "/profile", "icon": "bi-person-circle"},
                {"label": "Staff", "href": "/hr/staff", "icon": "bi-people-fill"},
            ],
        }

    if _match(q, ["document", "documents", "letter", "issued doc", "hr letter"]):
        if "issued_documents_count" not in ctx:
            return {
                "reply": "I couldn't load HR documents right now.",
                "links": [{"label": "Documents", "href": "/hr/documents", "icon": "bi-folder2-open"}],
            }
        n = ctx.get("issued_documents_count", 0)
        lines = [f"Issued HR documents: **{n}**"]
        for d in ctx.get("issued_documents") or []:
            lines.append(
                f"• {d.get('title')} — {d.get('staff') or 'unassigned'} "
                f"({d.get('doc_type')}, {d.get('created_at') or '—'})"
            )
        if ctx.get("employee_records"):
            lines.append("\nEmployee record files:")
            for r in ctx["employee_records"][:8]:
                lines.append(f"• {r.get('title')} — {r.get('staff')}")
        if n == 0 and not ctx.get("employee_records"):
            lines.append("No issued documents in view.")
        return {
            "reply": "\n".join(lines),
            "links": [{"label": "Documents", "href": "/hr/documents", "icon": "bi-folder2-open"}],
        }

    if _match(q, ["ticket", "tickets"]):
        if "open_tickets_count" not in ctx:
            return {
                "reply": "I couldn't load tickets right now. Raise one from Profile → Raise Ticket.",
                "links": [{"label": "Profile", "href": "/profile", "icon": "bi-person-circle"}],
            }
        lines = [f"Open tickets: **{ctx.get('open_tickets_count', 0)}**"]
        for t in ctx.get("open_tickets") or []:
            lines.append(
                f"• #{t.get('id')} [{t.get('urgency')}] {t.get('raised_by')} — "
                f"{(t.get('description') or '')[:100]}"
            )
        if not ctx.get("open_tickets"):
            lines.append("None open.")
        return {
            "reply": "\n".join(lines),
            "links": [{"label": "Profile", "href": "/profile", "icon": "bi-person-circle"}],
        }

    if _match(q, ["content calendar", "content post", "reel", "carousel", "scheduled post"]):
        if "content_calendar_count" not in ctx:
            return {
                "reply": "No content-calendar data loaded. Open Projects → Clients → a client calendar.",
                "links": [{"label": "Clients", "href": "/projects/clients", "icon": "bi-people"}],
            }
        lines = [f"Upcoming content (14 days, not done): **{ctx.get('content_calendar_count', 0)}**"]
        for item in ctx.get("content_calendar") or []:
            who = ", ".join(item.get("assignees") or []) or "—"
            lines.append(
                f"• [{item.get('status')}] {item.get('title')} — {item.get('client') or '—'} "
                f"· {item.get('content_type')} · {item.get('scheduled_date')} · {who}"
            )
        if not ctx.get("content_calendar"):
            lines.append("Nothing scheduled in the next two weeks.")
        return {
            "reply": "\n".join(lines),
            "links": [{"label": "Project Clients", "href": "/projects/clients", "icon": "bi-people"}],
        }

    if _match(q, ["proposal", "proposals"]):
        if "open_proposals_count" not in ctx and not ctx.get("proposals"):
            return {
                "reply": "You don't have Sales access, so I can't see proposals.",
                "links": [],
            }
        lines = [f"Open proposals (draft/sent): **{ctx.get('open_proposals_count', 0)}**"]
        for p in ctx.get("proposals") or []:
            lines.append(f"• [{p['status']}] {p['title']} — {p.get('client') or 'no client'}")
        return {
            "reply": "\n".join(lines),
            "links": [{"label": "Proposals", "href": "/sales/proposals", "icon": "bi-file-earmark-text"}],
        }

    if _match(q, ["estimate", "estimates", "quote", "quotes"]):
        if "open_estimates_count" not in ctx and not ctx.get("estimates"):
            return {
                "reply": "You don't have Sales access, so I can't see estimates.",
                "links": [],
            }
        lines = [f"Open estimates (draft/sent): **{ctx.get('open_estimates_count', 0)}**"]
        for e in ctx.get("estimates") or []:
            lines.append(f"• [{e['status']}] {e['title']} — {e.get('client') or 'no client'}")
        lines.append("\nCreate/edit via Sales → Proposals.")
        return {
            "reply": "\n".join(lines),
            "links": [{"label": "Proposals", "href": "/sales/proposals", "icon": "bi-file-earmark-text"}],
        }

    if _match(q, ["invoice", "overdue", "payment"]):
        if "open_invoices_count" not in ctx and "overdue_invoices_count" not in ctx:
            return {
                "reply": "You don't have Sales access, so I can't see invoices.",
                "links": [],
            }
        lines = [
            f"Open invoices: **{ctx.get('open_invoices_count', 0)}** "
            f"(overdue **{ctx.get('overdue_invoices_count', 0)}**)"
        ]
        for inv in ctx.get("invoices") or []:
            if inv.get("status") == "paid":
                continue
            lines.append(
                f"• [{inv.get('status')}] {inv.get('invoice_number')} — "
                f"{inv.get('client') or '—'} · {inv.get('amount')} · due {inv.get('due_date') or '—'}"
            )
        if ctx.get("open_invoices_count", 0) == 0:
            lines.append("None unpaid right now.")
        return {
            "reply": "\n".join(lines),
            "links": [{"label": "Invoices", "href": "/sales/invoices", "icon": "bi-receipt"}],
        }

    if _match(q, ["renewal", "domain", "hosting", "visa"]):
        if "upcoming_renewals_count" not in ctx and "overdue_renewals_count" not in ctx:
            return {"reply": "You don't have Renewals access.", "links": []}
        lines = [
            f"Overdue renewals: **{ctx.get('overdue_renewals_count', 0)}**",
            f"Upcoming (14 days): **{ctx.get('upcoming_renewals_count', 0)}**",
        ]
        for r in (ctx.get("overdue_renewals") or [])[:6]:
            lines.append(f"• OVERDUE {r.get('title')} due {r.get('due_date')}")
        for r in (ctx.get("upcoming_renewals") or [])[:6]:
            lines.append(f"• {r.get('title')} due {r.get('due_date')}")
        return {
            "reply": "\n".join(lines),
            "links": [{"label": "Renewals", "href": "/renewals", "icon": "bi-arrow-repeat"}],
        }

    if _match(q, ["calendar", "reminder", "meeting", "schedule"]):
        lines = ["Upcoming reminders (next 7 days):"]
        for r in ctx.get("upcoming_reminders") or []:
            who = ", ".join(r.get("assignees") or [])
            extra = f" · {who}" if who else ""
            meet = f" · {r['meeting_url']}" if r.get("meeting_url") else ""
            lines.append(f"• {r['title']} — {r.get('remind_at')}{extra}{meet}")
        if not ctx.get("upcoming_reminders"):
            lines.append("No reminders in the next week.")
        if ctx.get("content_calendar"):
            lines.append("\nContent calendar (soon):")
            for item in ctx["content_calendar"][:4]:
                lines.append(
                    f"• {item.get('title')} — {item.get('client') or '—'} · {item.get('scheduled_date')}"
                )
        return {
            "reply": "\n".join(lines),
            "links": [
                {"label": "Calendar", "href": "/calendar", "icon": "bi-calendar3-fill"},
                {"label": "Reminders", "href": "/reminders", "icon": "bi-bell"},
            ],
        }

    return {
        "reply": (
            f"Quick snapshot: **{ctx.get('open_tasks_count', 0)}** open tasks, "
            f"**{ctx.get('active_projects_count', 0)}** active projects"
            + (
                f", **{ctx.get('overdue_invoices_count', 0)}** overdue invoices"
                if "overdue_invoices_count" in ctx
                else ""
            )
            + ".\n\n"
            "Try asking: “What needs attention?”, “My tasks”, “Open tickets”, “Estimates”, or “Help”."
        ),
        "links": _suggested_links(q, ctx),
    }


def _match(q: str, words: list[str]) -> bool:
    return any(w in q for w in words)


def _is_crm_query(q: str) -> bool:
    return _match(
        q.lower(),
        [
            "task",
            "todo",
            "to-do",
            "to do",
            "invoice",
            "overdue",
            "payment",
            "client",
            "employee",
            "employees",
            "staff",
            "team",
            "hr",
            "leave",
            "balance",
            "document",
            "letter",
            "workload",
            "who is doing",
            "who's doing",
            "project",
            "renewal",
            "calendar",
            "reminder",
            "attention",
            "deadline",
            "kwick",
            "dashboard",
            "sales",
            "proposal",
            "estimate",
            "quote",
            "ticket",
            "content",
            "week",
            "schedule",
            "help",
            "what needs",
            "where do i",
            "how do i",
        ],
    )


def _suggested_links(q: str, ctx: dict) -> list[dict]:
    """Attach deep-links only when the user explicitly asks to open/go somewhere."""
    ql = q.lower()
    wants_nav = _match(
        ql,
        [
            "open ",
            "go to",
            "take me",
            "show me the",
            "navigate",
            "link to",
            "dashboard",
            "where can i",
            "where do i",
            "how do i open",
            "how do i",
        ],
    )
    if not wants_nav:
        return []

    links = []
    if _match(ql, ["task"]):
        links.append({"label": "Tasks", "href": "/tasks", "icon": "bi-check-square-fill"})
    if _match(ql, ["todo", "to-do", "to do"]):
        links.append({"label": "To-Do", "href": "/todo", "icon": "bi-ui-checks-grid"})
    if _match(ql, ["calendar", "schedule", "reminder"]):
        links.append({"label": "Calendar", "href": "/calendar", "icon": "bi-calendar3-fill"})
    if _match(ql, ["reminder"]):
        links.append({"label": "Reminders", "href": "/reminders", "icon": "bi-bell"})
    if _match(ql, ["invoice", "payment", "overdue"]) and "overdue_invoices_count" in ctx:
        links.append({"label": "Invoices", "href": "/sales/invoices", "icon": "bi-receipt"})
    if _match(ql, ["proposal", "estimate", "quote"]):
        links.append({"label": "Proposals", "href": "/sales/proposals", "icon": "bi-file-earmark-text"})
    if _match(ql, ["client"]) and "clients_count" in ctx:
        links.append({"label": "Clients", "href": "/sales/clients", "icon": "bi-building"})
    if _match(ql, ["content"]):
        links.append({"label": "Project Clients", "href": "/projects/clients", "icon": "bi-people"})
    if _match(ql, ["employee", "staff", "hr", "leave"]):
        links.append({"label": "Staff", "href": "/hr/staff", "icon": "bi-people-fill"})
    if _match(ql, ["document", "letter"]):
        links.append({"label": "Documents", "href": "/hr/documents", "icon": "bi-folder2-open"})
    if _match(ql, ["renewal", "domain", "hosting", "visa"]) and "upcoming_renewals_count" in ctx:
        links.append({"label": "Renewals", "href": "/renewals", "icon": "bi-arrow-repeat"})
    if _match(ql, ["ticket", "profile"]):
        links.append({"label": "Profile", "href": "/profile", "icon": "bi-person-circle"})
    if _match(ql, ["chat", "message"]):
        links.append({"label": "Chat", "href": "/chat", "icon": "bi-chat-dots-fill"})
    if _match(ql, ["support"]):
        links.append({"label": "Support", "href": "/support", "icon": "bi-headset"})
    if _match(ql, ["project"]):
        links.append({"label": "Projects", "href": "/projects", "icon": "bi-kanban-fill"})
    if _match(ql, ["report"]) and (ctx.get("access") or {}).get("reports"):
        links.append({"label": "Reports", "href": "/reports", "icon": "bi-bar-chart-fill"})
    if _match(ql, ["dashboard"]) or not links:
        links.append({"label": "Dashboard", "href": "/dashboard", "icon": "bi-grid-1x2-fill"})

    seen = set()
    out = []
    for l in links:
        if l["href"] in seen:
            continue
        seen.add(l["href"])
        out.append(l)
    return out[:4]


def _normalize_images(images: list) -> list[dict]:
    """Keep at most 3 small data-URL images for multimodal chat."""
    out = []
    for raw in images[:3]:
        if not isinstance(raw, dict):
            continue
        mime = (raw.get("mime") or "image/jpeg").strip().lower()
        if mime not in {"image/jpeg", "image/png", "image/webp", "image/gif"}:
            continue
        url = (raw.get("url") or "").strip()
        if not url.startswith("data:") or ";base64," not in url:
            # Also accept bare base64 + mime
            data = (raw.get("data") or "").strip()
            if not data:
                continue
            url = f"data:{mime};base64,{data}"
        # ~1.6MB data-url ceiling keeps VPS payloads sane
        if len(url) > 1_800_000:
            continue
        out.append({"mime": mime, "url": url})
    return out


def _llm_message_payload(messages: list[dict]) -> list[dict]:
    """Convert history into OpenAI-compatible multimodal messages."""
    out = []
    for m in messages:
        role = m.get("role")
        text = (m.get("content") or "").strip()
        atts = m.get("attachments") or []
        if role != "user" or not atts:
            out.append({"role": role, "content": text})
            continue
        parts = []
        if text:
            parts.append({"type": "text", "text": text})
        for a in atts:
            url = a.get("url")
            if url:
                parts.append({"type": "image_url", "image_url": {"url": url}})
        out.append({"role": "user", "content": parts if parts else text})
    return out


def _llm_reply(ctx: dict, messages: list[dict]) -> str:
    base = (getattr(settings, "AI_BASE_URL", None) or "https://api.openai.com/v1").rstrip("/")
    model = getattr(settings, "AI_MODEL", None) or "gpt-4o-mini"
    key = settings.AI_API_KEY

    system = SYSTEM_PROMPT + "\n\nCRM CONTEXT:\n" + context_as_text(ctx)
    payload = {
        "model": model,
        "temperature": 0.5,
        "messages": [
            {"role": "system", "content": system},
            *_llm_message_payload(messages),
        ],
    }
    req = urllib.request.Request(
        f"{base}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "User-Agent": "Kwick-EDITH/1.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {e.code}: {body}") from e

    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError("Empty LLM response")
    content = (choices[0].get("message") or {}).get("content") or ""
    content = re.sub(r"^```\w*\n|```$", "", content.strip())
    return content.strip() or "No response from the model."
