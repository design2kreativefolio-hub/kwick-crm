# Generated manually for subject "other" + custom type/subject labels

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("renewals", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="renewal",
            name="subject_type",
            field=models.CharField(
                choices=[("client", "Client"), ("staff", "Staff"), ("other", "Other")],
                max_length=10,
            ),
        ),
        migrations.AddField(
            model_name="renewal",
            name="subject_name",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
        migrations.AddField(
            model_name="renewal",
            name="renewal_type_detail",
            field=models.CharField(blank=True, default="", max_length=120),
        ),
    ]
