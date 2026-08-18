"""Task assignment notifications and calendar reminders."""
from __future__ import annotations

from datetime import datetime, time

from django.db.models import Q
from django.utils import timezone

from notifications.services import notify_user

from .models import Task


def assigned_user_ids(task: Task) -> list[int]:
    ids = list(task.assignees.values_list("id", flat=True))
    if ids:
        return ids
    return [task.assignee_id] if task.assignee_id else []


DEFAULT_DUE_TIME = time(9, 0)


def combine_due_datetime(due_date, due_time=None):
    """Build an aware datetime for reminders; defaults to 09:00 when time omitted."""
    if not due_date:
        return None
    return timezone.make_aware(datetime.combine(due_date, due_time or DEFAULT_DUE_TIME))


def format_due_label(task: Task) -> str:
    if not task.due_date:
        return ""
    label = task.due_date.strftime("%b %d, %Y")
    if task.due_time:
        label += f" at {task.due_time.strftime('%I:%M %p').lstrip('0')}"
    return label


def _priority_label(priority: str) -> str:
    return dict(Task.Priority.choices).get(priority, priority).capitalize()


def _assignment_body(*, task: Task, actor, client_hint: str = "") -> str:
    parts = [f"{actor.full_name or actor.email} assigned you this task."]
    parts.append(f"Priority: {_priority_label(task.priority)}.")
    if task.due_date:
        due = format_due_label(task)
        parts.append(f"Due: {due}.")
    elif client_hint:
        parts.append(client_hint)
    return " ".join(parts)


def notify_task_assignment(*, task: Task, actor, user_ids: set[int] | None = None) -> None:
    """Notify newly assigned users (never the actor)."""
    from django.contrib.auth import get_user_model

    User = get_user_model()
    targets = set(user_ids) if user_ids is not None else set(assigned_user_ids(task))
    targets.discard(actor.id)
    if not targets:
        return

    body = _assignment_body(task=task, actor=actor)
    for uid in targets:
        notify_user(
            user=User.objects.get(pk=uid),
            source="task",
            title=f"You've been assigned to \"{task.title}\"",
            body=body,
            object_ref=f"task:{task.id}:assigned:{uid}",
        )


def task_reminder_marker(task_id: int, user_id: int) -> str:
    return f"[kwick:task:{task_id}:user:{user_id}]"


def sync_task_reminders(task: Task) -> None:
    """Personal tasks with a due date get a calendar reminder per assignee."""
    from calendar_app.models import ManualReminder

    if task.content_item_id:
        return

    marker_prefix = f"[kwick:task:{task.id}"
    terminal = {Task.Status.COMPLETED, Task.Status.PUBLISHED}

    if task.status in terminal:
        ManualReminder.objects.filter(description__contains=marker_prefix).update(done=True)
        return

    if not task.due_date:
        ManualReminder.objects.filter(description__contains=marker_prefix).delete()
        return

    remind_at = combine_due_datetime(task.due_date, task.due_time)
    if remind_at is None:
        ManualReminder.objects.filter(description__contains=marker_prefix).delete()
        return
    assignee_ids = assigned_user_ids(task)

    existing = {
        rem.id: rem
        for rem in ManualReminder.objects.filter(description__contains=marker_prefix)
    }
    keep_ids: set[int] = set()

    for uid in assignee_ids:
        marker = task_reminder_marker(task.id, uid)
        rem = next((r for r in existing.values() if marker in (r.description or "")), None)
        body = f"Task assignment.\n{marker}"
        if rem is None:
            rem = ManualReminder.objects.create(
                owner_id=uid,
                title=task.title,
                description=body,
                remind_at=remind_at,
                visibility=ManualReminder.Visibility.PRIVATE,
                done=False,
            )
            rem.assignees.set([uid])
        else:
            rem.title = task.title
            rem.description = body
            rem.remind_at = remind_at
            rem.done = False
            rem.day_alert_sent = False
            rem.hour_alert_sent = False
            rem.save(
                update_fields=[
                    "title",
                    "description",
                    "remind_at",
                    "done",
                    "done_at",
                    "day_alert_sent",
                    "hour_alert_sent",
                    "updated_at",
                ]
            )
            rem.assignees.set([uid])
        keep_ids.add(rem.id)

    for rem in existing.values():
        if rem.id not in keep_ids:
            rem.delete()


def clear_task_reminders(task_id: int) -> None:
    from calendar_app.models import ManualReminder

    ManualReminder.objects.filter(description__contains=f"[kwick:task:{task_id}").delete()


def tasks_for_user(user):
    """Tasks assigned to a user via primary assignee or M2M assignees."""
    return Task.objects.filter(Q(assignee=user) | Q(assignees=user)).distinct()


def sync_todo_from_task(task: Task) -> None:
    """If this task was created from a personal to-do, keep that to-do in sync.

    To-do-sourced tasks only use todo / completed. Completing the task marks
    the to-do done (and the list view then hides it from Tasks).
    """
    from todos.models import TodoItem

    todo = TodoItem.objects.filter(linked_task_id=task.id).first()
    if not todo:
        return
    done = task.status in (Task.Status.COMPLETED, Task.Status.PUBLISHED)
    wanted_status = Task.Status.COMPLETED if done else Task.Status.TODO
    wanted_board = Task.BoardStatus.DONE if done else Task.BoardStatus.TODO
    if task.status != wanted_status or task.board_status != wanted_board:
        task.status = wanted_status
        task.board_status = wanted_board
        task.save()
    if todo.done != done:
        todo.done = done
        todo.save()
