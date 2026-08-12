from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_user_purged_at"),
    ]

    operations = [
        migrations.AlterField(
            model_name="moduleaccess",
            name="module",
            field=models.CharField(
                choices=[
                    ("hr", "HR"),
                    ("hr_documents", "HR · Documents"),
                    ("hr_staff", "HR · Staff"),
                    ("sales", "Sales"),
                    ("sales_clients", "Sales · Clients"),
                    ("sales_proposals", "Sales · Proposals"),
                    ("sales_invoices", "Sales · Invoices"),
                    ("renewals", "Renewals"),
                    ("reports", "Reports"),
                ],
                max_length=32,
            ),
        ),
    ]
