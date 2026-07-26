import uuid

from django.db import migrations


def normalize_person_uuid_ids(apps, schema_editor):
    with schema_editor.connection.cursor() as cursor:
        cursor.execute('SELECT id FROM people')
        person_ids = [row[0] for row in cursor.fetchall()]

        for old_id in person_ids:
            try:
                uuid.UUID(str(old_id))
                continue
            except (TypeError, ValueError, AttributeError):
                new_id = uuid.uuid4().hex

            cursor.execute(
                'UPDATE people SET id = %s WHERE id = %s',
                [new_id, old_id],
            )
            cursor.execute(
                'UPDATE conversations SET person_id = %s WHERE person_id = %s',
                [new_id, old_id],
            )
            cursor.execute(
                'UPDATE memories SET person_id = %s WHERE person_id = %s',
                [new_id, old_id],
            )


class Migration(migrations.Migration):
    dependencies = [
        ('people', '0002_alter_person_id_alter_person_table_conversation_and_more'),
    ]

    operations = [
        migrations.RunPython(normalize_person_uuid_ids, migrations.RunPython.noop),
    ]
