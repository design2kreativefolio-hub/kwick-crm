from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("messaging", "0002_alter_message_attachment_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="is_system",
            field=models.BooleanField(default=False),
        ),
    ]
