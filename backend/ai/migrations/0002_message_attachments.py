from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("ai", "0001_edith_chat_history"),
    ]

    operations = [
        migrations.AddField(
            model_name="message",
            name="attachments",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AlterField(
            model_name="message",
            name="content",
            field=models.TextField(blank=True, default=""),
        ),
    ]
