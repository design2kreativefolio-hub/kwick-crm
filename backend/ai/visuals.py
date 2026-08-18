"""Structured UI cards so EDITH can show tasks visually, not only as text."""

from __future__ import annotations

STATUS_LABEL = {
    "todo": "To do",
    "in_progress": "In progress",
    "completed": "Completed",
    "published": "Published",
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
        "status": t.get("status") or "todo",
        "status_label": STATUS_LABEL.get(t.get("status") or "", t.get("status") or "To do"),
        "priority": t.get("priority") or "medium",
        "priority_label": PRIORITY_LABEL.get(t.get("priority") or "", "Medium"),
        "due_date": t.get("due_date"),
        "assignee": t.get("assignee") or "Unassigned",
        "assignees": names,
        "project": t.get("project"),
        "client": t.get("client_name"),
        "href": f"/tasks/{t['id']}" if t.get("id") else "/tasks",
    }


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


def build_task_cards(ctx: dict, *, person: str | None = None, mine: bool = False) -> dict | None:
    tasks = list(ctx.get("open_tasks") or [])
    me = (ctx.get("user_name") or "").strip()
    if mine and me:
        person = me
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
        mine = _contains(q, ["my task", "my tasks", "assigned to me"])
        show_all = _contains(q, ["who is doing", "who's doing", "workload", "everyone", "all task"])
        person = None if show_all else named_person(q, ctx)
        if mine:
            person = ctx.get("user_name")
        result["cards"] = build_task_cards(ctx, person=person, mine=mine)
        n = sum(len(g.get("items") or []) for g in (result["cards"] or {}).get("groups") or [])
        who = f" for **{person}**" if person else ""
        if n == 0:
            result.setdefault("reply", f"No open tasks{who or ' right now'}.")
        elif not (result.get("reply") or "").strip():
            result["reply"] = f"Here are **{n}** open task(s){who}. Cards below — tap one to open it."
        elif person:
            result["reply"] = _person_task_summary(result.get("reply") or "", person, n)
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
