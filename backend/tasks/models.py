from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import TimeStampedModel


class Task(TimeStampedModel):
    class Status(models.TextChoices):
        ASSIGNED = "assigned", "Assigned"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        QC_COMPLETED = "qc_completed", "QC Completed"
        APPROVED = "approved", "Approved / Published"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    class BoardStatus(models.TextChoices):
        TODO = "todo", "New Request"
        DOING = "doing", "In Progress"
        DONE = "done", "Complete"

    # Done / closed enough to leave "pending" and "open" lists.
    TERMINAL_STATUSES = frozenset(
        {Status.COMPLETED, Status.QC_COMPLETED, Status.APPROVED}
    )

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    project = models.ForeignKey(
        "projects.Project", on_delete=models.SET_NULL, null=True, blank=True, related_name="tasks"
    )
    # Free text, same convention as Project.client (see projects/models.py) —
    # pick an existing client's name or just type any name; never creates or
    # touches a row in the real Clients directory. Replaces "Project" as the
    # context field on the Tasks page's own create form (spec follow-up).
    client_name = models.CharField(max_length=200, blank=True, default="")
    client = models.ForeignKey(
        "sales.Client",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tasks",
    )
    # Set only for a Task auto-created to mirror a client's content calendar
    # item — one task per content item (multiple people via `assignees` M2M).
    content_item = models.ForeignKey(
        "projects.ContentCalendarItem",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="tasks",
    )
    # Primary assignee (required for personal tasks / kanban ownership).
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tasks"
    )
    # Full assignee set — content calendar (and optionally other) tasks can
    # list several people on one row instead of duplicating the task.
    assignees = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="assigned_tasks",
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ASSIGNED)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    due_date = models.DateField(null=True, blank=True)
    due_time = models.TimeField(null=True, blank=True)
    # Set when status → completed / later stages; drives Dashboard monthly count.
    completed_at = models.DateTimeField(null=True, blank=True)
    # Kanban board fields (spec §11 reuses this model).
    board_status = models.CharField(
        max_length=20, choices=BoardStatus.choices, default=BoardStatus.TODO
    )
    board_order = models.PositiveIntegerField(default=0)

    def save(self, *args, **kwargs):
        # Stamp completed_at once work is done through QC / approval.
        # Approved / Published is the finished state — no due date once it ships.
        if self.status in self.TERMINAL_STATUSES and self.completed_at is None:
            self.completed_at = timezone.now()
        elif self.status not in self.TERMINAL_STATUSES:
            self.completed_at = None
        if self.status == self.Status.APPROVED:
            self.due_date = None
            self.due_time = None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title


class TaskUpdate(TimeStampedModel):
    """Daily progress note on a task. Only assignees may create entries."""

    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name="updates")
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="task_updates"
    )
    body = models.TextField()

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Update on {self.task_id} by {self.author_id}"
