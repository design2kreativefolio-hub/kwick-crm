# Generated manually — one Task row can list multiple people.

from django.conf import settings
from django.db import migrations, models


def merge_content_calendar_duplicates(apps, schema_editor):
    """Collapse one-task-per-assignee content mirrors into a single task."""
    Task = apps.get_model("tasks", "Task")
    content_ids = (
        Task.objects.filter(content_item_id__isnull=False)
        .values_list("content_item_id", flat=True)
        .distinct()
    )
    for cid in content_ids:
        tasks = list(Task.objects.filter(content_item_id=cid).order_by("id"))
        if not tasks:
            continue
        keep = tasks[0]
        assignee_ids = []
        for t in tasks:
            if t.assignee_id and t.assignee_id not in assignee_ids:
                assignee_ids.append(t.assignee_id)
        for t in tasks[1:]:
            t.delete()
        if assignee_ids:
            keep.assignees.set(assignee_ids)
            if keep.assignee_id != assignee_ids[0]:
                keep.assignee_id = assignee_ids[0]
                keep.save(update_fields=["assignee_id"])

    # Personal tasks: seed M2M from the FK so assignee_name stays correct.
    for t in Task.objects.filter(content_item_id__isnull=True).exclude(assignee_id=None):
        if not t.assignees.exists():
            t.assignees.set([t.assignee_id])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("tasks", "0004_task_status_published"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="assignees",
            field=models.ManyToManyField(
                blank=True,
                related_name="assigned_tasks",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(merge_content_calendar_duplicates, noop_reverse),
    ]
