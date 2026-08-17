# Generated manually — additive choice only; no data rewrite.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0008_contentcalendaritem_attachment_urls"),
    ]

    operations = [
        migrations.AlterField(
            model_name="contentcalendaritem",
            name="status",
            field=models.CharField(
                choices=[
                    ("planned", "To do"),
                    ("in_progress", "In progress"),
                    ("done", "Completed"),
                    ("published", "Published"),
                ],
                default="planned",
                max_length=20,
            ),
        ),
    ]
