from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("projects", "0012_contentcalendaritem_status_workflow"),
    ]

    operations = [
        migrations.AddField(
            model_name="project",
            name="attachment_url",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="project",
            name="attachment_urls",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
