# Generated manually for recurring flag, registered date, and security Q&A

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("renewals", "0002_other_subject_and_type_detail"),
    ]

    operations = [
        migrations.AddField(
            model_name="renewal",
            name="registered_date",
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="renewal",
            name="is_recurring",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="renewal",
            name="security_qa",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
