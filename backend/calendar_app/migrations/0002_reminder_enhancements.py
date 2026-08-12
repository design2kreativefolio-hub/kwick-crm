# Generated manually for reminder enhancements

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("calendar_app", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="manualreminder",
            name="description",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="manualreminder",
            name="meeting_url",
            field=models.URLField(blank=True, max_length=500),
        ),
        migrations.AddField(
            model_name="manualreminder",
            name="recurrence",
            field=models.CharField(
                choices=[
                    ("none", "Does not repeat"),
                    ("daily", "Daily"),
                    ("weekly", "Weekly"),
                    ("monthly", "Monthly"),
                ],
                default="none",
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="manualreminder",
            name="recurrence_end",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="manualreminder",
            name="done",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="manualreminder",
            name="done_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="manualreminder",
            name="day_alert_sent",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="manualreminder",
            name="hour_alert_sent",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="manualreminder",
            name="assignees",
            field=models.ManyToManyField(
                blank=True,
                related_name="assigned_reminders",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
