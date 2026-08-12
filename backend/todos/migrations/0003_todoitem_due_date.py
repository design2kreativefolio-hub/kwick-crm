# Generated manually for calendar due_date on todos

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("todos", "0002_todoitem_linked_task"),
    ]

    operations = [
        migrations.AddField(
            model_name="todoitem",
            name="due_date",
            field=models.DateField(blank=True, null=True),
        ),
    ]
