# Generated manually after accounts.User was introduced.

import django.db.models.deletion
from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.db import migrations, models


LOCAL_PATIENT_USERNAME = 'local-patient'


def get_local_patient_user(apps):
    User = apps.get_model('accounts', 'User')
    user, created = User.objects.get_or_create(
        username=LOCAL_PATIENT_USERNAME,
        defaults={
            'password': make_password(None),
            'name': '로컬 환자',
            'email': '',
            'is_active': True,
        },
    )
    return user


def assign_existing_rows_to_patient(apps, schema_editor):
    user = get_local_patient_user(apps)
    Person = apps.get_model('people', 'Person')
    Conversation = apps.get_model('people', 'Conversation')
    PatientVoiceProfile = apps.get_model('people', 'PatientVoiceProfile')
    Memory = apps.get_model('people', 'Memory')
    Promise = apps.get_model('people', 'Promise')
    MemoryAlbumItem = apps.get_model('people', 'MemoryAlbumItem')
    LongTermMemory = apps.get_model('people', 'LongTermMemory')
    PersonSummary = apps.get_model('people', 'PersonSummary')

    Person.objects.filter(user__isnull=True).update(user=user)
    PatientVoiceProfile.objects.filter(user__isnull=True).update(user=user)

    for model in [
        Conversation,
        Memory,
        Promise,
        MemoryAlbumItem,
        LongTermMemory,
        PersonSummary,
    ]:
        for record in model.objects.filter(user__isnull=True).select_related('person'):
            record.user_id = getattr(record.person, 'user_id', None) or user.id
            record.save(update_fields=['user'])


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('people', '0012_personsummary_source_promise_ids_promise'),
    ]

    operations = [
        migrations.AddField(
            model_name='person',
            name='user',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='people',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='conversation',
            name='user',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='conversations',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='patientvoiceprofile',
            name='id',
            field=models.BigAutoField(primary_key=True, serialize=False),
        ),
        migrations.AddField(
            model_name='patientvoiceprofile',
            name='user',
            field=models.OneToOneField(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='patient_voice_profile',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='memory',
            name='user',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='memories',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='promise',
            name='user',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='promises',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='memoryalbumitem',
            name='user',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='memory_album_items',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='longtermmemory',
            name='user',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='long_term_memories',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name='personsummary',
            name='user',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='summaries',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(
            assign_existing_rows_to_patient,
            reverse_code=migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name='person',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='people',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='conversation',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='conversations',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='patientvoiceprofile',
            name='user',
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='patient_voice_profile',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='memory',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='memories',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='promise',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='promises',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='memoryalbumitem',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='memory_album_items',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='longtermmemory',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='long_term_memories',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name='personsummary',
            name='user',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='summaries',
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterModelOptions(
            name='person',
            options={'ordering': ['user', 'name', 'id']},
        ),
        migrations.AddIndex(
            model_name='person',
            index=models.Index(fields=['user', 'name'], name='person_user_name_idx'),
        ),
        migrations.AddIndex(
            model_name='conversation',
            index=models.Index(
                fields=['user', '-recorded_at'],
                name='conversation_user_recent_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='memory',
            index=models.Index(fields=['user', '-memory_at'], name='memory_user_recent_idx'),
        ),
        migrations.AddIndex(
            model_name='promise',
            index=models.Index(
                fields=['user', 'status', 'scheduled_at'],
                name='promise_user_status_at_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='memoryalbumitem',
            index=models.Index(fields=['user', '-created_at'], name='album_user_recent_idx'),
        ),
        migrations.AddIndex(
            model_name='longtermmemory',
            index=models.Index(
                fields=['user', 'status', '-created_at'],
                name='ltm_user_status_recent_idx',
            ),
        ),
        migrations.AddIndex(
            model_name='personsummary',
            index=models.Index(
                fields=['user', 'status', '-generated_at'],
                name='summary_user_status_idx',
            ),
        ),
    ]
