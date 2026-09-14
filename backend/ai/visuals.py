"""Structured UI cards so EDITH can show tasks visually, not only as text."""

from __future__ import annotations

STATUS_LABEL = {
    "assigned": "Assigned",
    "todo": "Assigned",
    "in_progress": "In Progress",
    "completed": "Completed",
    "qc_completed": "QC Completed",
    "approved": "Approved / Published",
    "published": "Approved / Published",
}
PRIORITY_LABEL = {
    "low": "Low",
    "medium": "Medium",
    "high": "High",
}


def _contains(q: str, words: list[str]) -> bool:
    return any(w in q for w in words)


_NAME_STOPWORDS = {
    "who",
    "the",
    "you",
    "our",
    "any",
    "all",
    "for",
    "what",
    "this",
    "that",
    "with",
    "your",
    "their",
    "team",
}


def _name_in_query(name: str, q: str) -> bool:
    """True when any significant part of a CRM display name appears in the question."""
    full = (name or "").lower().strip()
    if not full or full == "unassigned":
        return False
    if full in q:
        return True
    padded = f" {q} "
    parts = [p for p in full.split() if len(p) >= 3 and p not in _NAME_STOPWORDS]
    for part in parts:
        if f" {part} " in padded:
            return True
        if f"{part}'s" in q:
            return True
        if f"of {part}" in q or f"for {part}" in q:
            return True
        if f"{part} only" in q or q.endswith(f" {part}"):
            return True
    return False


def named_person(query: str, ctx: dict) -> str | None:
    """Return a CRM person name mentioned in the question, else None."""
    q = (query or "").lower()
    names: list[str] = []
    me = (ctx.get("user_name") or "").strip()
    if me:
        names.append(me)
    for row in ctx.get("employees") or []:
        n = (row.get("name") or "").strip()
        if n:
            names.append(n)
    for t in ctx.get("open_tasks") or []:
        if t.get("assignee"):
            names.append(t["assignee"])
        for a in t.get("assignees") or []:
            if a:
                names.append(a)
    for w in ctx.get("workload") or []:
        if w.get("person"):
            names.append(w["person"])

    uniq = sorted({n for n in names if n and n.lower() != "unassigned"}, key=len, reverse=True)
    for name in uniq:
        if _name_in_query(name, q):
            return name
    return None


def _client_names(ctx: dict) -> list[str]:
    """Every client name EDITH currently knows about — the always-on Sales
    directory list plus whatever client names show up in this user's active
    mini-projects, content calendar items, and open tasks (covers clients not
    in the Sales directory, and doesn't depend on Sales module access)."""
    names: set[str] = set()
    for n in ctx.get("client_names") or []:
        if n:
            names.add(n)
    for row in ctx.get("clients") or []:
        n = (row.get("name") or "").strip()
        if n:
            names.add(n)
    for p in ctx.get("active_projects") or []:
        n = (p.get("client") or "").strip()
        if n:
            names.add(n)
    for item in ctx.get("content_calendar") or []:
        n = (item.get("client") or "").strip()
        if n:
            names.add(n)
    for t in ctx.get("open_tasks") or []:
        n = (t.get("client_name") or "").strip()
        if n:
            names.add(n)
    return sorted(names, key=len, reverse=True)


def named_client(query: str, ctx: dict) -> str | None:
    """Return a CRM client name mentioned in the question, else None."""
    q = (query or "").lower()
    for name in _client_names(ctx):
        if _name_in_query(name, q):
            return name
    return None


_PERSON_WORK_HINTS = [
    "task",
    "assigned",
    "working",
    "doing",
    "workload",
    "open work",
    "have",
    "has",
    "got",
    "what does",
    "what do",
    "what's on",
    "on their plate",
    "on her plate",
    "on his plate",
    "work",
]


def wants_task_cards(query: str, ctx: dict) -> bool:
    q = (query or "").lower()
    if _contains(q, ["how do i", "how to", "create a task", "add a task", "new task", "make a task"]):
        return False
    person = named_person(q, ctx)
    if person:
        if _contains(q, ["leave", "time off", "vacation", "invoice", "proposal", "email", "phone"]):
            return False
        identity = _contains(q, ["who is ", "who's ", "who was "]) and not _contains(
            q, ["task", "doing", "working", "have", "has"]
        )
        if identity:
            return False
        if _contains(q, ["content", "write", "draft", "caption", "brainstorm", "ideas", "reel", "script"]):
            return False
        if _contains(q, _PERSON_WORK_HINTS):
            return True
        # Short “Jane?” / “Jane's tasks” — show their open work.
        if len(q.split()) <= 5:
            return True
        return False
    if _contains(
        q,
        [
            "my tasks",
            "open tasks",
            "pending tasks",
            "assigned tasks",
            "who is doing",
            "who's doing",
            "who working",
            "workload",
            "show tasks",
            "list tasks",
            "task list",
            "working on",
        ],
    ):
        return True
    if _contains(q, ["pending"]) and _contains(q, ["task"]):
        return True
    if _contains(q, ["task"]) and not _contains(q, ["what is a task", "what are tasks"]):
        return True
    return False


def wants_todo_cards(query: str) -> bool:
    q = (query or "").lower()
    if _contains(q, ["how do i", "how to", "create a to-do", "add a to-do", "add a todo"]):
        return False
    return _contains(q, ["my to-do", "my todo", "to-dos", "todos", "personal checklist", "my checklist"])


def _task_item(t: dict) -> dict:
    names = t.get("assignees") or ([t["assignee"]] if t.get("assignee") else [])
    return {
        "id": t.get("id"),
        "title": t.get("title") or "Untitled task",
        "status": t.get("status") or "assigned",
        "status_label": STATUS_LABEL.get(t.get("status") or "", t.get("status") or "Assigned"),
        "priority": t.get("priority") or "medium",
        "priority_label": PRIORITY_LABEL.get(t.get("priority") or "", "Medium"),
        "due_date": t.get("due_date"),
        "assignee": t.get("assignee") or "Unassigned",
        "assignees": names,
        "project": t.get("project"),
        "client": t.get("client_name"),
        "href": f"/tasks/{t['id']}" if t.get("id") else "/tasks",
    }


def _matches_client(task: dict, client: str) -> bool:
    name = (task.get("client_name") or "").strip().lower()
    return bool(name) and name == (client or "").strip().lower()


def _matches_person(task: dict, person: str) -> bool:
    target = (person or "").lower().strip()
    if not target:
        return False
    target_parts = [p for p in target.split() if len(p) >= 2]
    names = [task.get("assignee") or ""] + list(task.get("assignees") or [])
    for n in names:
        nl = (n or "").lower().strip()
        if not nl or nl == "unassigned":
            continue
        if nl == target or nl.startswith(f"{target} ") or target.startswith(f"{nl} "):
            return True
        n_parts = [p for p in nl.split() if len(p) >= 2]
        if target_parts and n_parts and set(target_parts) & set(n_parts):
            return True
    return False


def count_tasks_for_person(ctx: dict, person: str) -> int:
    return sum(1 for t in ctx.get("open_tasks") or [] if _matches_person(t, person))


def build_task_cards(
    ctx: dict, *, person: str | None = None, mine: bool = False, client: str | None = None
) -> dict | None:
    tasks = list(ctx.get("open_tasks") or [])
    me = (ctx.get("user_name") or "").strip()
    if mine and me:
        person = me
    if client:
        tasks = [t for t in tasks if _matches_client(t, client)]
    if person:
        tasks = [t for t in tasks if _matches_person(t, person)]

    groups: dict[str, list] = {}
    for t in tasks:
        item = _task_item(t)
        if person:
            groups.setdefault(person, []).append(item)
            continue
        keys = t.get("assignees") or [t.get("assignee") or "Unassigned"]
        seen: set[str] = set()
        for key in keys:
            k = key or "Unassigned"
            if k in seen:
                continue
            seen.add(k)
            groups.setdefault(k, []).append(item)

    grouped = [{"person": name, "items": items} for name, items in groups.items()]
    grouped.sort(key=lambda g: (-len(g["items"]), g["person"]))

    total = sum(len(g["items"]) for g in grouped)
    if person:
        title = f"{person}'s tasks"
        subtitle = f"{total} open" if total else "No open tasks"
    elif client:
        title = f"{client} — open tasks"
        subtitle = f"{total} open" if total else "No open tasks"
    else:
        title = "Open tasks"
        subtitle = f"{total} across the team" if grouped else "Nothing open"

    return {
        "kind": "task_cards",
        "title": title,
        "subtitle": subtitle,
        "groups": grouped,
    }


def build_todo_cards(ctx: dict) -> dict | None:
    todos = ctx.get("todos") or []
    items = [
        {
            "id": t.get("id"),
            "title": t.get("title") or "To-do",
            "due_date": t.get("due_date"),
            "href": "/todo",
        }
        for t in todos
    ]
    return {
        "kind": "todo_cards",
        "title": "Personal to-dos",
        "subtitle": f"{len(items)} open" if items else "None open",
        "groups": [{"person": ctx.get("user_name") or "You", "items": items}],
    }


def attach_visual_cards(query: str, ctx: dict, result: dict) -> dict:
    """Add card payloads for list-style CRM questions. Safe to call on LLM + local replies."""
    q = (query or "").lower()
    result = dict(result or {})
    if result.get("cards"):
        return result

    if wants_todo_cards(q) and not wants_task_cards(q, ctx):
        result["cards"] = build_todo_cards(ctx)
        return result

    if wants_task_cards(q, ctx):
        mine = _contains(q, ["my task", "my tasks", "assigned to me", "pending tasks", "my pending"])
        show_all = _contains(q, ["who is doing", "who's doing", "workload", "everyone", "all task"])
        person = None if show_all else named_person(q, ctx)
        client = None if (show_all or person) else named_client(q, ctx)
        if mine:
            person = ctx.get("user_name")
        result["cards"] = build_task_cards(ctx, person=person, client=client, mine=mine)
        n = sum(len(g.get("items") or []) for g in (result["cards"] or {}).get("groups") or [])
        who = f" for **{person}**" if person else (f" for **{client}**" if client else "")
        if n == 0:
            result.setdefault("reply", f"No open tasks{who or ' right now'}.")
        elif not (result.get("reply") or "").strip():
            result["reply"] = f"Here are **{n}** open task(s){who}. Cards below — tap one to open it."
        elif person:
            result["reply"] = _person_task_summary(result.get("reply") or "", person, n)
        elif client:
            result["reply"] = _client_task_summary(result.get("reply") or "", client, n)
        else:
            result["reply"] = _shorten_when_cards(result.get("reply") or "", n, who)
    return result


def _person_task_summary(reply: str, person: str, n: int) -> str:
    """Replace a team-wide task count with the filtered person summary."""
    import re

    cleaned = re.sub(
        r"\*\*\d+\*\*\s+open shared task\(s\)\.?",
        f"**{n}** open task(s) for **{person}**.",
        reply.strip(),
        count=1,
    )
    if cleaned != reply.strip():
        return cleaned
    if n == 0:
        return f"No open tasks for **{person}** right now."
    return f"**{n}** open task(s) for **{person}**. Cards below — tap one to open it."


def _client_task_summary(reply: str, client: str, n: int) -> str:
    """Same as _person_task_summary, but for a named client."""
    import re

    cleaned = re.sub(
        r"\*\*\d+\*\*\s+open shared task\(s\)\.?",
        f"**{n}** open task(s) for **{client}**.",
        reply.strip(),
        count=1,
    )
    if cleaned != reply.strip():
        return cleaned
    if n == 0:
        return f"No open tasks for **{client}** right now."
    return f"**{n}** open task(s) for **{client}**. Cards below — tap one to open it."


def _shorten_when_cards(reply: str, n: int, who: str) -> str:
    """Keep a short summary when visual cards already list every task."""
    lines = reply.splitlines()
    bullets = sum(
        1
        for line in lines
        if line.strip().startswith(("•", "-", "–", "*")) or (len(line.lstrip()) > 2 and line.lstrip()[:2].rstrip(".").isdigit())
    )
    if bullets < 3:
        return reply.strip()
    kept: list[str] = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(("•", "-", "–", "*")) or (
            len(stripped) > 2 and stripped[:2].rstrip(".").isdigit()
        ):
            break
        kept.append(line)
    summary = "\n".join(kept).strip()
    if not summary:
        summary = f"Here are **{n}** open task(s){who}."
    return summary


def wants_client_summary(query: str, ctx: dict) -> bool:
    """True when the question is a general ask about a named client
    ("details of gate eight", "gate eight?", "status on nova studio") rather
    than a task list (that's wants_task_cards' job) or a writing request."""
    q = (query or "").lower()
    if _contains(
        q,
        ["content for", "write", "draft", "caption", "brainstorm", "ideas", "reel", "script", "email to", "proposal for"],
    ):
        return False
    if not named_client(q, ctx):
        return False
    if wants_task_cards(q, ctx):
        return False
    return True


def build_client_summary(ctx: dict, client: str) -> dict:
    """Compact, read-only brief for a named client: active mini-projects,
    upcoming content-calendar items, open task count, and Sales contact info
    when available. Built from CONTEXT only — no invented figures."""
    cl = (client or "").strip().lower()
    lines = [f"**{client}**"]

    sales_row = next(
        (c for c in ctx.get("clients") or [] if (c.get("name") or "").strip().lower() == cl), None
    )
    if sales_row:
        bits = []
        company = (sales_row.get("company") or "").strip()
        if company and company.lower() != cl:
            bits.append(company)
        if sales_row.get("poc_name"):
            bits.append(f"POC {sales_row['poc_name']}")
        if sales_row.get("contact_email"):
            bits.append(sales_row["contact_email"])
        if bits:
            lines.append(" · ".join(bits))

    projects = [p for p in ctx.get("active_projects") or [] if (p.get("client") or "").strip().lower() == cl]
    if projects:
        lines.append(f"Active mini-projects: **{len(projects)}**")
        for p in projects[:5]:
            due = f" — due {p['delivery_date']}" if p.get("delivery_date") else ""
            lines.append(f"• {p['name']} [{p['status']}]{due}")
    else:
        lines.append("No active mini-projects right now.")

    cal = [c for c in ctx.get("content_calendar") or [] if (c.get("client") or "").strip().lower() == cl]
    if cal:
        lines.append(f"Upcoming content (next 14d): **{len(cal)}**")
        for c in cal[:5]:
            lines.append(f"• {c['title']} — {c.get('scheduled_date')} [{c.get('status')}]")

    n_tasks = sum(1 for t in ctx.get("open_tasks") or [] if _matches_client(t, client))
    lines.append(f"Open tasks: **{n_tasks}**")

    return {
        "reply": "\n".join(lines),
        "links": [{"label": "Projects", "href": "/projects", "icon": "bi-kanban-fill"}],
    }
