from django.db import migrations, models

CHOICES = [
    ("static_post", "Static Post"),
    ("reel", "Reel"),
    ("story", "Story"),
    ("video", "Video"),
    ("carousel", "Carousel"),
    ("print", "Print Work"),
    ("design", "Graphic Design"),
    ("shoot", "Photo / Video Shoot"),
    ("ad", "Ad Campaign"),
    ("website", "Website"),
    ("other", "Other Work"),
]


class Migration(migrations.Migration):
    """Calendar items are not only social posts (print jobs, shoots, ads...). Only the list of allowed
    values changes: no column is added or altered in the database and existing rows are untouched."""

    dependencies = [
        ("projects", "0016_project_status_invoiced"),
    ]

    operations = [
        migrations.AlterField(
            model_name="contentcalendaritem",
            name="content_type",
            field=models.CharField(choices=CHOICES, default="static_post", max_length=20),
        ),
    ]
