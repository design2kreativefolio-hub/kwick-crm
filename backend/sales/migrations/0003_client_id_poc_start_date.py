from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0002_client_services"),
    ]

    operations = [
        migrations.AddField(
            model_name="client",
            name="client_id",
            field=models.CharField(blank=True, default="", max_length=20, unique=True),
        ),
        migrations.AddField(
            model_name="client",
            name="start_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="client",
            name="poc_name",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
    ]
