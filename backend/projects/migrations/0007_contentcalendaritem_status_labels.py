from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0006_contentcalendaritem"),
    ]

    operations = [
        migrations.AlterField(
            model_name="contentcalendaritem",
            name="status",
            field=models.CharField(
                choices=[
                    ("planned", "To do"),
                    ("in_progress", "In progress"),
                    ("done", "Completed"),
                ],
                default="planned",
                max_length=20,
            ),
        ),
    ]
