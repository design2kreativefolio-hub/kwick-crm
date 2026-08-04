from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0003_superadmin_module_access"),
    ]

    operations = [
        migrations.AddField(
            model_name="staffprofile",
            name="nationality",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="staffprofile",
            name="emergency_contact_uae",
            field=models.CharField(blank=True, max_length=40),
        ),
        migrations.AddField(
            model_name="staffprofile",
            name="emergency_contact_relation",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="staffprofile",
            name="home_country_address",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="staffprofile",
            name="home_country_number",
            field=models.CharField(blank=True, max_length=40),
        ),
    ]
