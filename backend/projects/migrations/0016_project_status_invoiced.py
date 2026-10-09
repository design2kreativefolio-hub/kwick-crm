from django.db import migrations, models

CHOICES = [
    ("assigned", "Assigned"),
    ("in_progress", "In Progress"),
    ("completed", "Completed"),
    ("qc_completed", "QC Completed"),
    ("approved", "Approved / Published"),
    ("invoiced", "Invoiced"),
]


class Migration(migrations.Migration):
    dependencies = [
        ("projects", "0015_client_calendar_share"),
    ]

    operations = [
        migrations.AlterField(
            model_name="project",
            name="status",
            field=models.CharField(choices=CHOICES, default="assigned", max_length=20),
        ),
    ]
