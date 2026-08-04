from django.db import migrations, models


def copy_client_names_forward(apps, schema_editor):
    Project = apps.get_model("projects", "Project")
    for project in Project.objects.exclude(client_fk__isnull=True).select_related("client_fk"):
        project.client_text = project.client_fk.name
        project.save(update_fields=["client_text"])


class Migration(migrations.Migration):

    dependencies = [
        ("projects", "0002_alter_artwork_artwork_type_alter_artwork_client_and_more"),
    ]

    operations = [
        # 1) Rename the old FK out of the way so both old and new columns
        #    can exist side by side while we copy data across.
        migrations.RenameField(
            model_name="project",
            old_name="client",
            new_name="client_fk",
        ),
        # 2) Add the new free-text column.
        migrations.AddField(
            model_name="project",
            name="client_text",
            field=models.CharField(max_length=200, blank=True, default=""),
        ),
        # 3) Copy every existing project's client name across before the FK
        #    (and the client relationship it represents) is dropped.
        migrations.RunPython(copy_client_names_forward, migrations.RunPython.noop),
        # 4) Drop the old FK column entirely.
        migrations.RemoveField(
            model_name="project",
            name="client_fk",
        ),
        # 5) Rename the text column into the final "client" name.
        migrations.RenameField(
            model_name="project",
            old_name="client_text",
            new_name="client",
        ),
    ]
