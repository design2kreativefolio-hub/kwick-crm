from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0007_contentcalendaritem_status_labels"),
    ]

    operations = [
        migrations.AddField(
            model_name="contentcalendaritem",
            name="attachment_urls",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
