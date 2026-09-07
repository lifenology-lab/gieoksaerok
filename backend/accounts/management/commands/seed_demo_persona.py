import json
from datetime import time
from pathlib import Path
from zoneinfo import ZoneInfo

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files import File
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from people.models import MemoryAlbumItem, Person
from records.models import MealRecord


User = get_user_model()
SEED_ROOT = Path(__file__).resolve().parents[2] / 'demo_seed'
PERSON_CONFIG_PATH = SEED_ROOT / 'people' / 'jimin' / 'person.json'
MEMORY_ITEMS_PATH = SEED_ROOT / 'memory-items.json'
MEAL_PHOTO_DIR = SEED_ROOT / 'meal-photos'

# 데모용 점심 식사 기록. 촬영 당일 seed를 실행하면 "오늘 점심"으로 기록된다.
# 음성 질의("오늘 점심 먹었던가?") 시 이 기록이 조회된다.
DEMO_MEAL_RECORD = {
    'meal_type': 'lunch',
    'menu': '육회비빔밥, 미역국, 깍두기, 오렌지',
    'memo': '',
    'source': 'patient_confirmed',
    'photo': 'yukhoe-bibimbap.jpg',  # meal-photos/ 아래 파일명
    'eaten_time': time(12, 30),  # 실행일의 12:30
    'storage_name': 'demo/meals/yukhoe-bibimbap.jpg',
}


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


def _seed_demo_meal_record(user):
    """실행일 점심(12:30)으로 데모 식사 기록을 만든다. 중복 실행 시 갱신한다.

    같은 사용자에게 같은 storage_name의 사진을 가진 식사 기록이 이미 있으면
    eaten_at만 오늘로 갱신한다. 없으면 새로 만든다.
    반환값: (meal_record, created, photo_missing)
    """
    # 프로젝트 TIME_ZONE이 UTC이므로, "오늘 점심 12:30"을 한국시간 기준으로 만든다.
    # (Asia/Seoul 12:30 → 내부적으로 UTC 03:30으로 저장되어, 한국 브라우저에서 12:30으로 표시)
    seoul_tz = ZoneInfo(getattr(settings, 'PROMISE_DEFAULT_TIMEZONE', 'Asia/Seoul'))
    now_seoul = timezone.now().astimezone(seoul_tz)
    eaten_at = now_seoul.replace(
        hour=DEMO_MEAL_RECORD['eaten_time'].hour,
        minute=DEMO_MEAL_RECORD['eaten_time'].minute,
        second=0,
        microsecond=0,
    )

    storage_name = DEMO_MEAL_RECORD['storage_name']
    meal_record = MealRecord.objects.filter(
        user=user,
        scene_image__endswith=storage_name,
    ).first()
    created = meal_record is None

    if meal_record is None:
        meal_record = MealRecord(user=user)

    meal_record.meal_type = DEMO_MEAL_RECORD['meal_type']
    meal_record.eaten_at = eaten_at
    meal_record.menu = DEMO_MEAL_RECORD['menu']
    meal_record.memo = DEMO_MEAL_RECORD['memo'] or None
    meal_record.source = DEMO_MEAL_RECORD['source']

    photo_missing = False
    if not meal_record.scene_image:
        source_path = MEAL_PHOTO_DIR / DEMO_MEAL_RECORD['photo']
        if source_path.is_file():
            with source_path.open('rb') as photo_file:
                meal_record.scene_image.save(
                    storage_name,
                    File(photo_file),
                    save=False,
                )
        else:
            # 사진이 아직 없어도 식사 기록 자체는 생성한다(음성 질의는 사진 없이도 동작).
            photo_missing = True

    meal_record.save()
    return meal_record, created, photo_missing


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

        # 데모 점심 식사 기록(육회비빔밥)을 실행일 12:30으로 넣는다.
        meal_record, meal_created, photo_missing = _seed_demo_meal_record(
            template_user,
        )
        meal_action = '등록했습니다' if meal_created else '갱신했습니다'
        self.stdout.write(
            self.style.SUCCESS(
                f'점심 식사 기록({meal_record.menu})을 '
                f'{meal_record.eaten_at:%Y-%m-%d %H:%M}로 {meal_action}.',
            ),
        )
        if photo_missing:
            self.stdout.write(
                self.style.WARNING(
                    f'식사 사진을 찾지 못해 사진 없이 저장했습니다. '
                    f'{MEAL_PHOTO_DIR / DEMO_MEAL_RECORD["photo"]}에 사진을 넣고 '
                    f'다시 실행하면 사진이 추가됩니다.',
                ),
            )
