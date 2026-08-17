from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("projects", "0009_contentcalendaritem_status_published"),
    ]

    operations = [
        migrations.AddField(
            model_name="contentcalendaritem",
            name="deadline_time",
            field=models.TimeField(blank=True, null=True),
        ),
    ]
