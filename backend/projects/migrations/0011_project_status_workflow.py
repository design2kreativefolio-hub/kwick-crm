# Remap legacy mini-project statuses to the shared workflow.

from django.db import migrations, models


def remap_statuses(apps, schema_editor):
    Project = apps.get_model("projects", "Project")
    Project.objects.filter(status="started").update(status="in_progress")
    Project.objects.filter(status="waiting_approval").update(status="qc_completed")


def reverse_remap(apps, schema_editor):
    Project = apps.get_model("projects", "Project")
    Project.objects.filter(status="in_progress").update(status="started")
    Project.objects.filter(status="qc_completed").update(status="waiting_approval")
    Project.objects.filter(status="approved").update(status="completed")


class Migration(migrations.Migration):
    dependencies = [
        ("projects", "0010_contentcalendaritem_deadline_time"),
    ]

    operations = [
        migrations.RunPython(remap_statuses, reverse_remap),
        migrations.AlterField(
            model_name="project",
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
