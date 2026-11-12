from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("hr", "0006_leave_admin_comment"),
    ]

    operations = [
        migrations.AddField(
            model_name="leave",
            name="attachment_url",
            field=models.URLField(blank=True, default="", max_length=500),
        ),
        migrations.AddField(
            model_name="leave",
            name="attachment_name",
            field=models.CharField(blank=True, default="", max_length=255),
        ),
    ]
