from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0002_task_content_item"),
    ]

    operations = [
        migrations.AddField(
            model_name="task",
            name="client_name",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
    ]
