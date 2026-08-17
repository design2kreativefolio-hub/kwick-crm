from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("tasks", "0005_task_assignees_m2m"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="due_time",
            field=models.TimeField(blank=True, null=True),
        ),
    ]
