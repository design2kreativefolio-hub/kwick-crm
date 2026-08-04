import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0003_client_id_poc_start_date"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("projects", "0005_project_created_by_project_priority"),
    ]

    operations = [
        migrations.CreateModel(
            name="ContentCalendarItem",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "content_type",
                    models.CharField(
                        choices=[
                            ("static_post", "Static Post"),
                            ("reel", "Reel"),
                            ("story", "Story"),
                            ("video", "Video"),
                            ("carousel", "Carousel"),
                            ("other", "Other"),
                        ],
                        default="static_post",
                        max_length=20,
                    ),
                ),
                ("title", models.CharField(max_length=200)),
                ("description", models.TextField(blank=True, default="")),
                ("scheduled_date", models.DateField()),
                ("deadline", models.DateField(blank=True, null=True)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("planned", "Planned"),
                            ("in_progress", "In Progress"),
                            ("done", "Done"),
                        ],
                        default="planned",
                        max_length=20,
                    ),
                ),
                ("attachment_url", models.URLField(blank=True, default="")),
                (
                    "assignees",
                    models.ManyToManyField(
                        blank=True, related_name="content_calendar_items", to=settings.AUTH_USER_MODEL
                    ),
                ),
                (
                    "client",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="content_items",
                        to="sales.client",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["scheduled_date"],
            },
        ),
    ]
