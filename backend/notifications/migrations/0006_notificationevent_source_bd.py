from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("notifications", "0005_dashboard_card_dismiss"),
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
                    ("bd", "Business Development"),
                ],
                max_length=20,
            ),
        ),
    ]
