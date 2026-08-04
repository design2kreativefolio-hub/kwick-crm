from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0003_client_id_poc_start_date"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="accent_color",
            field=models.CharField(blank=True, default="", max_length=7),
        ),
        migrations.AddField(
            model_name="client",
            name="logo_url",
            field=models.URLField(blank=True, default=""),
        ),
    ]
