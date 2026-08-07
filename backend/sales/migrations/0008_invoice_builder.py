from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0007_client_sales_crm_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="invoice",
            name="content",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AlterField(
            model_name="invoice",
            name="client",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="invoices",
                to="sales.client",
            ),
        ),
        migrations.AlterField(
            model_name="invoice",
            name="invoice_number",
            field=models.CharField(blank=True, default="", max_length=50, unique=True),
        ),
    ]
