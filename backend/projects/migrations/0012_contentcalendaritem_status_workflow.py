# Remap content calendar item statuses to the shared workflow.

from django.db import migrations, models


def remap_statuses(apps, schema_editor):
    Item = apps.get_model("projects", "ContentCalendarItem")
    Item.objects.filter(status="planned").update(status="assigned")
    Item.objects.filter(status="done").update(status="completed")
    Item.objects.filter(status="published").update(status="approved")


def reverse_remap(apps, schema_editor):
    Item = apps.get_model("projects", "ContentCalendarItem")
    Item.objects.filter(status="assigned").update(status="planned")
    Item.objects.filter(status="completed").update(status="done")
    Item.objects.filter(status="approved").update(status="published")
    Item.objects.filter(status="qc_completed").update(status="done")


class Migration(migrations.Migration):
    dependencies = [
        ("projects", "0011_project_status_workflow"),
    ]

    operations = [
        migrations.RunPython(remap_statuses, reverse_remap),
        migrations.AlterField(
            model_name="contentcalendaritem",
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
