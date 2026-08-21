from django.db import migrations, models
import django.db.models.deletion


def backfill_mini_project_tasks(apps, schema_editor):
    Project = apps.get_model("projects", "Project")
    Task = apps.get_model("tasks", "Task")
    User = apps.get_model("accounts", "User")

    board_map = {
        "assigned": "todo",
        "in_progress": "doing",
        "completed": "done",
        "qc_completed": "done",
        "approved": "done",
    }

    for project in Project.objects.all().iterator():
        if Task.objects.filter(mini_project_id=project.id).exists():
            continue
        member_ids = list(project.members.values_list("id", flat=True))
        primary_id = member_ids[0] if member_ids else project.created_by_id
        if not primary_id:
            first = User.objects.filter(is_active=True).order_by("id").first()
            if not first:
                continue
            primary_id = first.id
            member_ids = [primary_id]
        published = project.status == "approved"
        task = Task.objects.create(
            mini_project_id=project.id,
            project_id=project.id,
            assignee_id=primary_id,
            title=project.name,
            description=project.description or "",
            client_name=project.client or "",
            due_date=None if published else project.delivery_date,
            status=project.status,
            priority=project.priority,
            board_status=board_map.get(project.status, "todo"),
        )
        if member_ids:
            task.assignees.set(member_ids)


class Migration(migrations.Migration):
    dependencies = [
        ("tasks", "0008_task_status_workflow"),
        ("projects", "0014_projectupdate"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="mini_project",
            field=models.OneToOneField(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="work_task",
                to="projects.project",
            ),
        ),
        migrations.RunPython(backfill_mini_project_tasks, migrations.RunPython.noop),
    ]
