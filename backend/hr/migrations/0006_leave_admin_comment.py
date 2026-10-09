from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("hr", "0005_leave_status_cancelled"),
    ]

    operations = [
        migrations.AddField(
            model_name="leave",
            name="admin_comment",
            field=models.TextField(blank=True, default=""),
        ),
    ]
