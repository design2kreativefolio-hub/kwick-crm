from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

import projects.models


class Migration(migrations.Migration):
    dependencies = [
        ("projects", "0014_projectupdate"),
        ("sales", "0003_client_id_poc_start_date"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="contentcalendaritem",
            name="client_post_files",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="contentcalendaritem",
            name="client_post_caption",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="contentcalendaritem",
            name="client_post_uploaded_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="ClientCalendarShare",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("token", models.CharField(default=projects.models._new_share_token, max_length=64, unique=True)),
                ("is_active", models.BooleanField(default=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                (
                    "client",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="calendar_share",
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
            options={"ordering": ["-created_at"], "abstract": False},
        ),
        migrations.CreateModel(
            name="ContentCalendarComment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("from_client", models.BooleanField(default=False)),
                ("author_name", models.CharField(blank=True, default="", max_length=120)),
                ("body", models.TextField()),
                (
                    "author",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "item",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="comments",
                        to="projects.contentcalendaritem",
                    ),
                ),
            ],
            options={"ordering": ["created_at"]},
        ),
    ]
