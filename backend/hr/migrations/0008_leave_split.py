from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("hr", "0007_leave_attachment"),
    ]

    operations = [
        migrations.AddField(
            model_name="leave",
            name="split",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
