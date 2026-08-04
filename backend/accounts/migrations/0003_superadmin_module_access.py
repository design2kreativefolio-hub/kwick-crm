import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def promote_managers_to_superadmin(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="manager").update(role="superadmin")


def revert_superadmins_to_manager(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(role="superadmin").update(role="manager")


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_staffprofile_iloe_renewal_date_and_more"),
    ]

    operations = [
        migrations.RunPython(promote_managers_to_superadmin, revert_superadmins_to_manager),
        migrations.AlterField(
            model_name="user",
            name="role",
            field=models.CharField(
                choices=[("superadmin", "Superadmin"), ("employee", "Employee")],
                default="employee",
                max_length=20,
            ),
        ),
        migrations.RemoveField(model_name="invitecode", name="issued_by"),
        migrations.RemoveField(model_name="invitecode", name="used_by"),
        migrations.DeleteModel(name="InviteCode"),
        migrations.CreateModel(
            name="ModuleAccess",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "module",
                    models.CharField(
                        choices=[
                            ("hr", "HR"),
                            ("sales", "Sales"),
                            ("renewals", "Renewals"),
                            ("reports", "Reports"),
                        ],
                        max_length=20,
                    ),
                ),
                (
                    "granted_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="+",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="module_access",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ["module", "user__full_name"],
            },
        ),
        migrations.AlterUniqueTogether(
            name="moduleaccess",
            unique_together={("user", "module")},
        ),
    ]
