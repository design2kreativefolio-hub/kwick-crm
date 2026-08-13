# Generated manually for DashboardCardDismiss

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("notifications", "0004_alter_notificationevent_source"),
    ]

    operations = [
        migrations.CreateModel(
            name="DashboardCardDismiss",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("notification", "Notification"),
                            ("reminder", "Calendar reminder"),
                            ("todo", "To-do"),
                        ],
                        max_length=20,
                    ),
                ),
                ("object_id", models.PositiveIntegerField()),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="dashboard_card_dismissals",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
        ),
        migrations.AddIndex(
            model_name="dashboardcarddismiss",
            index=models.Index(fields=["user", "kind"], name="notificatio_user_id_kind_idx"),
        ),
        migrations.AddConstraint(
            model_name="dashboardcarddismiss",
            constraint=models.UniqueConstraint(
                fields=("user", "kind", "object_id"),
                name="uniq_dashboard_card_dismiss",
            ),
        ),
    ]
