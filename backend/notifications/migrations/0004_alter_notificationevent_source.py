from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0003_alter_notificationevent_source"),
    ]

    operations = [
        migrations.AlterField(
            model_name="notificationevent",
            name="source",
            field=models.CharField(
                choices=[
                    ("renewal", "Renewal"),
                    ("calendar", "Calendar"),
                    ("task", "Task"),
                    ("leave_request", "Leave request"),
                    ("ticket", "Ticket"),
                    ("document", "Document"),
                    ("staff_renewal", "Staff Renewal"),
                    ("registration", "Registration"),
                ],
                max_length=20,
            ),
        ),
    ]
