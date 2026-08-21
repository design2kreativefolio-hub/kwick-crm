# Generated manually — remap legacy task statuses + add QC / Approved.

from django.db import migrations, models


def remap_statuses(apps, schema_editor):
    Task = apps.get_model("tasks", "Task")
    Task.objects.filter(status="todo").update(status="assigned")
    Task.objects.filter(status="published").update(status="approved")


def reverse_remap(apps, schema_editor):
    Task = apps.get_model("tasks", "Task")
    Task.objects.filter(status="assigned").update(status="todo")
    Task.objects.filter(status="approved").update(status="published")
    Task.objects.filter(status="qc_completed").update(status="completed")


class Migration(migrations.Migration):
    dependencies = [
        ("tasks", "0007_task_client_and_updates"),
    ]

    operations = [
        migrations.RunPython(remap_statuses, reverse_remap),
        migrations.AlterField(
            model_name="task",
            name="status",
            field=models.CharField(
                choices=[
                    ("assigned", "Assigned"),
                    ("in_progress", "In Progress"),
                    ("completed", "Completed"),
                    ("qc_completed", "QC Completed"),
                    ("approved", "Approved / Published"),
                ],
                default="assigned",
                max_length=20,
            ),
        ),
    ]
