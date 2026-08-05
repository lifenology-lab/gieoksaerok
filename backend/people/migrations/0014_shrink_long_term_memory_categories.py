from django.db import migrations, models


CATEGORY_MAP = {
    'birth': 'family',
    'marriage': 'family',
    'death': 'family',
    'education': 'career',
}

STATUS_PRIORITY = {
    'confirmed': 3,
    'suggested': 2,
    'archived': 1,
}


def unique_nonempty(values):
    result = []

    for value in values:
        value = (value or '').strip()

        if value and value not in result:
            result.append(value)

    return result


def normalize_and_merge_categories(apps, schema_editor):
    LongTermMemory = apps.get_model('people', 'LongTermMemory')
    buckets = {}

    for memory in LongTermMemory.objects.all():
        target_category = CATEGORY_MAP.get(memory.category, memory.category)
        key = (memory.person_id, target_category)
        buckets.setdefault(key, []).append(memory)

    for (person_id, target_category), memories in buckets.items():
        memories.sort(
            key=lambda memory: (
                STATUS_PRIORITY.get(memory.status, 0),
                memory.confidence or 0,
                memory.updated_at,
                memory.created_at,
            ),
            reverse=True,
        )
        keeper = memories[0]
        duplicate_ids = [memory.id for memory in memories[1:]]

        descriptions = unique_nonempty(memory.description for memory in memories)
        source_texts = unique_nonempty(memory.source_text for memory in memories)
        event_dates = [memory.event_date for memory in memories if memory.event_date]
        confirmed_exists = any(memory.status == 'confirmed' for memory in memories)

        if duplicate_ids:
            LongTermMemory.objects.filter(id__in=duplicate_ids).delete()

        keeper.category = target_category
        keeper.description = '\n'.join(descriptions) or keeper.description
        keeper.source_text = '\n'.join(source_texts) or keeper.source_text
        keeper.confidence = max(memory.confidence or 0 for memory in memories)

        if confirmed_exists:
            keeper.status = 'confirmed'

        if event_dates and not keeper.event_date:
            keeper.event_date = event_dates[0]

        keeper.save(
            update_fields=[
                'category',
                'description',
                'source_text',
                'confidence',
                'status',
                'event_date',
                'updated_at',
            ],
        )


class Migration(migrations.Migration):
    dependencies = [
        ('people', '0013_add_user_ownership'),
    ]

    operations = [
        migrations.RunPython(
            normalize_and_merge_categories,
            migrations.RunPython.noop,
        ),
        migrations.AlterField(
            model_name='longtermmemory',
            name='category',
            field=models.CharField(
                choices=[
                    ('family', '가족'),
                    ('health', '건강'),
                    ('career', '커리어'),
                    ('relationship', '관계'),
                    ('other', '기타'),
                ],
                max_length=40,
            ),
        ),
    ]
