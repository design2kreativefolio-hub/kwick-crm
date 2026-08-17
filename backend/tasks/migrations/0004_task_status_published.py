# Generated manually — additive choice only; no data rewrite.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0003_task_client_name"),
    ]

    operations = [
        migrations.AlterField(
            model_name="task",
            name="status",
            field=models.CharField(
                choices=[
                    ("todo", "To do"),
                    ("in_progress", "In progress"),
                    ("completed", "Completed"),
                    ("published", "Published"),
                ],
                default="todo",
                max_length=20,
            ),
        ),
    ]
