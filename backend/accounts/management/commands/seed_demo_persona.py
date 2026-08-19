import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from people.models import MemoryAlbumItem, Person


User = get_user_model()
SEED_ROOT = Path(__file__).resolve().parents[2] / 'demo_seed'
PERSON_CONFIG_PATH = SEED_ROOT / 'people' / 'jimin' / 'person.json'
MEMORY_ITEMS_PATH = SEED_ROOT / 'memory-items.json'


def _load_json(path):
    try:
        with path.open(encoding='utf-8') as file:
            return json.load(file)
    except FileNotFoundError as exc:
        raise CommandError(f'시드 파일을 찾을 수 없습니다: {path}') from exc
    except json.JSONDecodeError as exc:
        raise CommandError(f'시드 JSON 형식이 올바르지 않습니다: {path}') from exc


def _load_face_descriptor(person_config):
    descriptor_path = SEED_ROOT / person_config['face_descriptor_file']
    descriptor_data = _load_json(descriptor_path)
    descriptor = descriptor_data.get('descriptor')

    if not isinstance(descriptor, list) or len(descriptor) != 128:
        raise CommandError(
            '김지민 얼굴 descriptor는 숫자 128개여야 합니다. '
            f'{descriptor_path} 파일을 채운 뒤 다시 실행해주세요.',
        )

    try:
        return [float(value) for value in descriptor]
    except (TypeError, ValueError) as exc:
        raise CommandError('김지민 얼굴 descriptor에는 숫자만 넣어주세요.') from exc


def _get_or_create_album_item(*, user, person, item_data):
    relative_photo_path = item_data.get('photo', '').strip()
    description = item_data.get('description', '').strip()

    if not relative_photo_path or not description:
        raise CommandError(
            f"{item_data.get('id', '알 수 없는 항목')}의 photo와 description을 모두 채워주세요.",
        )

    source_path = SEED_ROOT / relative_photo_path
    if not source_path.is_file():
        raise CommandError(f'추억 사진을 찾을 수 없습니다: {source_path}')

    storage_name = f'demo/jimin/{item_data["id"]}{source_path.suffix.lower()}'
    album_item = MemoryAlbumItem.objects.filter(
        user=user,
        person=person,
        photo__endswith=storage_name,
    ).first()

    if album_item is None:
        album_item = MemoryAlbumItem(user=user, person=person)

    album_item.description = description
    album_item.crop_x = 50
    album_item.crop_y = 50

    # 이미 저장된 데모 사진은 다시 업로드하지 않는다. 같은 명령을 여러 번 실행해도
    # 앨범 항목과 파일이 중복되지 않도록 한다.
    if not album_item.photo:
        with source_path.open('rb') as photo_file:
            album_item.photo.save(storage_name, File(photo_file), save=False)

    album_item.save()
    return album_item


class Command(BaseCommand):
    help = '원본 데모 계정에 김지민 인물과 12개 추억 앨범 자료를 등록합니다.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--username',
            default=settings.DEMO_EXPERIENCE_USERNAME,
            help='원본 데모 계정 username (기본값: DEMO_EXPERIENCE_USERNAME)',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        username = (options['username'] or '').strip()
        if not username:
            raise CommandError(
                '--username 또는 DEMO_EXPERIENCE_USERNAME을 설정해주세요.',
            )

        template_user = User.objects.filter(username=username, is_active=True).first()
        if template_user is None:
            raise CommandError(f'활성 원본 데모 계정을 찾을 수 없습니다: {username}')

        person_config = _load_json(PERSON_CONFIG_PATH)
        descriptor = _load_face_descriptor(person_config)
        person, created = Person.objects.update_or_create(
            user=template_user,
            name=person_config['name'].strip(),
            relationship=person_config['relationship'].strip(),
            defaults={'face_descriptor': descriptor},
        )

        memory_items = _load_json(MEMORY_ITEMS_PATH)
        if not isinstance(memory_items, list) or len(memory_items) != 12:
            raise CommandError('memory-items.json에는 정확히 12개의 추억이 필요합니다.')

        created_count = 0
        for item_data in memory_items:
            storage_name = f'demo/jimin/{item_data["id"]}{Path(item_data["photo"]).suffix.lower()}'
            exists = MemoryAlbumItem.objects.filter(
                user=template_user,
                person=person,
                photo__endswith=storage_name,
            ).exists()
            _get_or_create_album_item(
                user=template_user,
                person=person,
                item_data=item_data,
            )
            created_count += not exists

        action = '등록했습니다' if created else '갱신했습니다'
        self.stdout.write(
            self.style.SUCCESS(
                f'김지민 인물을 {action}. 추억 {len(memory_items)}개 중 '
                f'{created_count}개를 새로 등록했습니다.',
            ),
        )
