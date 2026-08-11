from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('patient_assistant', '0001_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='patientquestionevent',
            name='intent_type',
            field=models.CharField(
                choices=[
                    ('meal', 'Meal'),
                    ('person', 'Person'),
                    ('way_home', 'Way Home'),
                    ('schedule', 'Schedule'),
                    ('place', 'Place'),
                    ('unknown', 'Unknown'),
                ],
                max_length=30,
            ),
        ),
    ]
