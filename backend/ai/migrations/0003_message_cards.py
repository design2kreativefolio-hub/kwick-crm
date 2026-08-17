from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("ai", "0002_message_attachments"),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="cards",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
