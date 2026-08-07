from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_staffprofile_hr_record_fields"),
        ("hr", "0003_employeerecord"),
    ]

    operations = [
        migrations.CreateModel(
            name="HrLetter",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "doc_type",
                    models.CharField(
                        choices=[
                            ("handover_letter", "Handover Letter"),
                            ("experience_letter", "Experience Letter"),
                            ("payslip_letter", "Payslip Letter"),
                            ("relieving_letter", "Relieving Letter"),
                            ("probation_confirmation", "Probation Confirmation Letter"),
                            ("warning_letter", "Warning Letter"),
                            ("increment_letter", "Increment Letter"),
                            ("offer_letter", "Offer Letter"),
                        ],
                        max_length=40,
                    ),
                ),
                ("title", models.CharField(blank=True, default="", max_length=200)),
                ("content", models.JSONField(blank=True, default=dict)),
                (
                    "status",
                    models.CharField(
                        choices=[("draft", "Draft"), ("issued", "Issued")],
                        default="draft",
                        max_length=20,
                    ),
                ),
                ("file_url", models.URLField(blank=True)),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_hr_letters",
                        to="accounts.user",
                    ),
                ),
                (
                    "staff",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="hr_letters",
                        to="accounts.user",
                    ),
                ),
            ],
            options={"ordering": ["-created_at"]},
        ),
    ]
