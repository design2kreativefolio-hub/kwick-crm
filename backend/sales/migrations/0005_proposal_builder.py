import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('sales', '0004_client_accent_color_logo_url'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='proposal',
            name='amount',
        ),
        migrations.RemoveField(
            model_name='proposal',
            name='valid_until',
        ),
        migrations.AlterField(
            model_name='proposal',
            name='client',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='proposals', to='sales.client'),
        ),
        migrations.AlterField(
            model_name='proposal',
            name='title',
            field=models.CharField(blank=True, default='Untitled Proposal', max_length=200),
        ),
        # A mid-development container rebuild already applied this AddField
        # directly to the database under an ephemeral, never-committed
        # migration (the entrypoint's `makemigrations --noinput` generated
        # and ran it, then the container — and the migration file with it —
        # was replaced by the next rebuild). The `content` column is really
        # there; only Django's migration history doesn't know it. Sync state
        # only, skip re-running the DB operation (it would fail with
        # "column already exists").
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='proposal',
                    name='content',
                    field=models.JSONField(blank=True, default=dict),
                ),
            ],
            database_operations=[],
        ),
    ]
