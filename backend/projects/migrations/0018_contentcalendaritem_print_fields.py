from django.db import migrations, models


class Migration(migrations.Migration):
    """Adds four optional print-job columns. Purely additive: every existing row simply gets the empty
    default, nothing is altered or removed."""

    dependencies = [
        ("projects", "0017_contentcalendaritem_more_work_types"),
    ]

    operations = [
        migrations.AddField(
            model_name="contentcalendaritem",
            name="print_size",
            field=models.CharField(blank=True, default="", max_length=100),
        ),
        migrations.AddField(
            model_name="contentcalendaritem",
            name="print_quantity",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="contentcalendaritem",
            name="print_paper",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
        migrations.AddField(
            model_name="contentcalendaritem",
            name="print_printer",
            field=models.CharField(blank=True, default="", max_length=150),
        ),
    ]
