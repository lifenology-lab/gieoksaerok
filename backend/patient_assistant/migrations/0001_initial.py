# Generated manually to match patient_assistant.models.PatientQuestionEvent.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PatientQuestionEvent',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name='ID',
                    ),
                ),
                ('transcript', models.TextField()),
                (
                    'input_method',
                    models.CharField(
                        choices=[('text', 'Text'), ('voice', 'Voice')],
                        max_length=10,
                    ),
                ),
                (
                    'intent_type',
                    models.CharField(
                        choices=[
                            ('meal', 'Meal'),
                            ('way_home', 'Way Home'),
                            ('schedule', 'Schedule'),
                            ('place', 'Place'),
                            ('unknown', 'Unknown'),
                        ],
                        max_length=30,
                    ),
                ),
                ('response_summary', models.TextField()),
                ('occurred_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                (
                    'user',
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name='patient_question_events',
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                'ordering': ['-occurred_at', '-created_at'],
            },
        ),
    ]
