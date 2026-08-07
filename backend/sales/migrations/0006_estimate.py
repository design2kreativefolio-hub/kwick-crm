from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0005_proposal_builder"),
    ]

    operations = [
        migrations.CreateModel(
            name="Estimate",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("title", models.CharField(blank=True, default="Untitled Estimate", max_length=200)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("draft", "Draft"),
                            ("sent", "Sent"),
                            ("accepted", "Accepted"),
                            ("rejected", "Rejected"),
                        ],
                        default="draft",
                        max_length=20,
                    ),
                ),
                ("content", models.JSONField(blank=True, default=dict)),
                (
                    "client",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="estimates",
                        to="sales.client",
                    ),
                ),
            ],
            options={
                "abstract": False,
            },
        ),
    ]
