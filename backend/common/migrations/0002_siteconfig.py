from django.db import migrations, models


def seed_site_config(apps, schema_editor):
    SiteConfig = apps.get_model("common", "SiteConfig")
    SiteConfig.objects.get_or_create(pk=1, defaults={"maintenance_mode": False})


class Migration(migrations.Migration):

    dependencies = [
        ("common", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="SiteConfig",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("maintenance_mode", models.BooleanField(default=False)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
            options={
                "verbose_name": "Site config",
                "verbose_name_plural": "Site config",
            },
        ),
        migrations.RunPython(seed_site_config, migrations.RunPython.noop),
    ]
