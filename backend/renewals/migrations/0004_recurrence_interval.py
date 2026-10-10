from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("renewals", "0003_recurring_registered_security_qa"),
    ]

    operations = [
        migrations.AddField(
            model_name="renewal",
            name="recurrence_interval",
            field=models.CharField(
                blank=True,
                choices=[("monthly", "Monthly"), ("yearly", "Yearly")],
                default="",
                max_length=10,
            ),
        ),
        # Existing recurring renewals were yearly in practice (domains, hosting, visas).
        migrations.RunSQL(
            "UPDATE renewals_renewal SET recurrence_interval = 'yearly' WHERE is_recurring = true",
            reverse_sql=migrations.RunSQL.noop,
        ),
    ]
