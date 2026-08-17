from django.db import migrations, models


def ensure_proposal_content_column(apps, schema_editor):
    """0005 recorded Proposal.content in Django state but skipped the DB
    ALTER (a local container already had the column). Fresh/live databases
    that ran 0001→0005 never got the column, so creating a proposal 500s."""
    Proposal = apps.get_model("sales", "Proposal")
    table = Proposal._meta.db_table
    with schema_editor.connection.cursor() as cursor:
        names = {
            col.name
            for col in schema_editor.connection.introspection.get_table_description(cursor, table)
        }
    if "content" in names:
        return
    schema_editor.add_field(Proposal, Proposal._meta.get_field("content"))


class Migration(migrations.Migration):

    dependencies = [
        ("sales", "0008_invoice_builder"),
    ]

    operations = [
        migrations.RunPython(ensure_proposal_content_column, migrations.RunPython.noop),
        migrations.AddField(
            model_name="client",
            name="other_service",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
    ]
