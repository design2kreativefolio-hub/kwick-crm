from django.contrib.auth.hashers import make_password
from django.db import migrations, models
import django.db.models.deletion


def seed_vault_pin(apps, schema_editor):
    VaultSettings = apps.get_model("passwords", "VaultSettings")
    if not VaultSettings.objects.exists():
        VaultSettings.objects.create(pin_hash=make_password("5532"))


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ("sales", "0008_invoice_builder"),
        ("accounts", "0007_module_passwords"),
    ]

    operations = [
        migrations.CreateModel(
            name="VaultSettings",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("pin_hash", models.CharField(max_length=128)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to="accounts.user",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "Vault settings",
            },
        ),
        migrations.CreateModel(
            name="PasswordEntry",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("client_name", models.CharField(blank=True, default="", max_length=200)),
                ("platform", models.CharField(max_length=120)),
                ("username", models.CharField(blank=True, default="", max_length=200)),
                ("password_encrypted", models.TextField(blank=True, default="")),
                ("link", models.URLField(blank=True, default="", max_length=500)),
                ("security_question", models.TextField(blank=True, default="")),
                ("start_date", models.DateField(blank=True, null=True)),
                ("expiry_date", models.DateField(blank=True, null=True)),
                ("comment", models.TextField(blank=True, default="")),
                (
                    "client",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="password_entries",
                        to="sales.client",
                    ),
                ),
                (
                    "created_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="password_entries_created",
                        to="accounts.user",
                    ),
                ),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="password_entries_updated",
                        to="accounts.user",
                    ),
                ),
            ],
            options={
                "verbose_name_plural": "Password entries",
                "ordering": ["-updated_at"],
            },
        ),
        migrations.CreateModel(
            name="PasswordAccessLog",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                (
                    "action",
                    models.CharField(
                        choices=[
                            ("unlocked", "Unlocked vault"),
                            ("listed", "Viewed password list"),
                            ("revealed", "Revealed password"),
                            ("created", "Created entry"),
                            ("updated", "Updated entry"),
                            ("deleted", "Deleted entry"),
                            ("pin_changed", "Changed vault PIN"),
                        ],
                        max_length=20,
                    ),
                ),
                ("client_label", models.CharField(blank=True, default="", max_length=200)),
                ("platform", models.CharField(blank=True, default="", max_length=120)),
                ("detail", models.CharField(blank=True, default="", max_length=300)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "entry",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="access_logs",
                        to="passwords.passwordentry",
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="password_access_logs",
                        to="accounts.user",
                    ),
                ),
            ],
            options={
                "ordering": ["-created_at"],
            },
        ),
        migrations.RunPython(seed_vault_pin, migrations.RunPython.noop),
    ]
