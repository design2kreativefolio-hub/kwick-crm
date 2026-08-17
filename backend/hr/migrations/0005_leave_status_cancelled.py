# Generated manually — additive choice only; no data rewrite.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("hr", "0004_hrletter"),
    ]

    operations = [
        migrations.AlterField(
            model_name="leave",
            name="status",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                    ("cancelled", "Cancelled"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
    ]
