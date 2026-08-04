from django.conf import settings
from django.db import models
from django.utils import timezone

from common.models import TimeStampedModel


class Task(TimeStampedModel):
    class Status(models.TextChoices):
        TODO = "todo", "To do"
        IN_PROGRESS = "in_progress", "In progress"
        COMPLETED = "completed", "Completed"

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    class BoardStatus(models.TextChoices):
        TODO = "todo", "New Request"
        DOING = "doing", "In Progress"
        DONE = "done", "Complete"

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
    # Set only for a Task auto-created to mirror one assignee's slot on a
    # client's content calendar item — kept in sync (title/dates/status) by
    # ContentCalendarItemViewSet, and deleted along with the item or when
    # that assignee is removed from it (spec follow-up: assigning content
    # calendar work must show up in the assignee's own Tasks list too).
    content_item = models.ForeignKey(
        "projects.ContentCalendarItem",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="tasks",
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="tasks"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TODO)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    due_date = models.DateField(null=True, blank=True)
    # Set when status → completed; drives Dashboard monthly-reset count (spec §8/§15).
    completed_at = models.DateTimeField(null=True, blank=True)
    # Kanban board fields (spec §11 reuses this model).
    board_status = models.CharField(
        max_length=20, choices=BoardStatus.choices, default=BoardStatus.TODO
    )
    board_order = models.PositiveIntegerField(default=0)

    def save(self, *args, **kwargs):
        # Stamp / clear completed_at automatically as status flips.
        if self.status == self.Status.COMPLETED and self.completed_at is None:
            self.completed_at = timezone.now()
        elif self.status != self.Status.COMPLETED:
            self.completed_at = None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.title
