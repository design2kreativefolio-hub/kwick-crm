from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0006_estimate"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="website",
            field=models.CharField(blank=True, default="", max_length=300),
        ),
        migrations.AddField(
            model_name="client",
            name="address",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="client",
            name="trade_license_url",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="client",
            name="vat_registration_url",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="client",
            name="executives",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="client",
            name="additional_fields",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
