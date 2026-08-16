import re
from datetime import datetime, timedelta, time, timezone as datetime_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.utils import timezone


DEFAULT_PROMISE_TIMEZONE = 'Asia/Seoul'
BROAD_TIME_WORDS = ['아침', '오전', '점심', '오후', '저녁', '밤', '새벽']
KOREAN_WEEKDAYS = {
    '월': 0,
    '월요일': 0,
    '화': 1,
    '화요일': 1,
    '수': 2,
    '수요일': 2,
    '목': 3,
    '목요일': 3,
    '금': 4,
    '금요일': 4,
    '토': 5,
    '토요일': 5,
    '일': 6,
    '일요일': 6,
}


def get_default_promise_timezone():
    return getattr(
        settings,
        'PROMISE_DEFAULT_TIMEZONE',
        DEFAULT_PROMISE_TIMEZONE,
    )


def get_promise_zone(promise):
    timezone_name = (
        getattr(promise, 'timezone', None)
        or get_default_promise_timezone()
    )

    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo(DEFAULT_PROMISE_TIMEZONE)


def ensure_aware_datetime(value, zone=None):
    if value is None:
        return None

    if timezone.is_aware(value):
        return value

    return timezone.make_aware(
        value,
        zone or ZoneInfo(get_default_promise_timezone()),
    )


def get_local_reference_date(reference=None, zone=None):
    reference = reference or timezone.now()
    zone = zone or ZoneInfo(get_default_promise_timezone())

    if isinstance(zone, str):
        try:
            zone = ZoneInfo(zone)
        except ZoneInfoNotFoundError:
            zone = ZoneInfo(DEFAULT_PROMISE_TIMEZONE)

    if timezone.is_naive(reference):
        reference = timezone.make_aware(reference, zone)

    return reference.astimezone(zone).date()


def _date_for_weekday(reference_date, target_weekday, week_offset=0):
    week_start = reference_date - timedelta(days=reference_date.weekday())
    return week_start + timedelta(days=(week_offset * 7) + target_weekday)


def _date_for_this_weekend(reference_date):
    if reference_date.weekday() <= KOREAN_WEEKDAYS['토요일']:
        return _date_for_weekday(reference_date, KOREAN_WEEKDAYS['토요일'])

    return reference_date


def infer_korean_relative_date(text, reference=None, zone=None):
    if not text:
        return None

    normalized_text = re.sub(r'\s+', ' ', text.strip())
    reference_date = get_local_reference_date(reference, zone)

    if '모레' in normalized_text:
        return reference_date + timedelta(days=2)

    if '내일' in normalized_text:
        return reference_date + timedelta(days=1)

    if '오늘' in normalized_text:
        return reference_date

    if re.search(r'다음\s*주말', normalized_text):
        return _date_for_weekday(reference_date, KOREAN_WEEKDAYS['토요일'], 1)

    if re.search(r'이번\s*주말', normalized_text):
        return _date_for_this_weekend(reference_date)

    weekday_match = re.search(
        r'(이번\s*주|다음\s*주)\s*'
        r'(월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일)',
        normalized_text,
    )

    if not weekday_match:
        return None

    week_text = re.sub(r'\s+', '', weekday_match.group(1))
    weekday_text = weekday_match.group(2)
    week_offset = 1 if week_text == '다음주' else 0

    return _date_for_weekday(
        reference_date,
        KOREAN_WEEKDAYS[weekday_text],
        week_offset,
    )


def get_reference_now(promise=None, now=None):
    reference = now or timezone.now()

    if timezone.is_naive(reference):
        reference = reference.replace(tzinfo=datetime_timezone.utc)

    if promise is None:
        return reference

    return reference.astimezone(get_promise_zone(promise))


def get_promise_local_datetime(promise):
    scheduled_at = getattr(promise, 'scheduled_at', None)

    if scheduled_at:
        return ensure_aware_datetime(
            scheduled_at,
            get_promise_zone(promise),
        ).astimezone(get_promise_zone(promise))

    scheduled_date = getattr(promise, 'scheduled_date', None)

    if scheduled_date:
        return datetime.combine(
            scheduled_date,
            time.min,
            tzinfo=get_promise_zone(promise),
        )

    return None


def is_promise_expired(promise, now=None):
    reference_now = get_reference_now(promise, now)
    scheduled_at = getattr(promise, 'scheduled_at', None)

    if scheduled_at:
        return get_promise_local_datetime(promise) <= reference_now

    scheduled_date = getattr(promise, 'scheduled_date', None)

    if scheduled_date:
        return scheduled_date < reference_now.date()

    return False


def promise_sort_key(promise):
    promise_datetime = get_promise_local_datetime(promise)

    if promise_datetime:
        return promise_datetime

    return datetime.max.replace(tzinfo=ZoneInfo(get_default_promise_timezone()))


def format_korean_time(value):
    hour = value.hour
    minute = value.minute
    period = '오전' if hour < 12 else '오후'
    hour_12 = hour % 12 or 12

    if minute:
        return f'{period} {hour_12}시 {minute}분'

    return f'{period} {hour_12}시'


def format_promise_display(promise, now=None):
    promise_datetime = get_promise_local_datetime(promise)

    if not promise_datetime:
        return (
            getattr(promise, 'title', '')
            or getattr(promise, 'description', '')
        )

    today = get_reference_now(promise, now).date()
    promise_date = promise_datetime.date()
    day_delta = (promise_date - today).days

    if day_delta == 0:
        date_text = '오늘'
    elif day_delta == 1:
        date_text = '내일'
    elif day_delta == 2:
        date_text = '모레'
    else:
        date_text = f'{promise_date.month}월 {promise_date.day}일'

    time_label = (getattr(promise, 'time_label', '') or '').strip()

    if getattr(promise, 'scheduled_at', None):
        time_text = time_label or format_korean_time(promise_datetime)
    else:
        time_text = time_label

    title = (getattr(promise, 'title', '') or '').strip()
    description = (getattr(promise, 'description', '') or '').strip()
    event_text = title or description
    parts = [date_text]

    if time_text:
        parts.append(time_text)

    if event_text:
        parts.append(event_text)

    return ' '.join(parts).strip()


def has_explicit_clock_time(text):
    if not text:
        return False

    return bool(
        re.search(r'\d{1,2}\s*시(\s*\d{1,2}\s*분)?', text)
        or re.search(r'\d{1,2}:\d{2}', text)
    )


def infer_explicit_clock_time(text):
    text = re.sub(r'\s+', ' ', (text or '').strip())

    if not text:
        return None

    clock_match = re.search(r'(\d{1,2}):(\d{2})', text)

    if clock_match:
        hour = int(clock_match.group(1))
        minute = int(clock_match.group(2))

        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return time(hour, minute)

        return None

    korean_time_match = re.search(
        r'(오전|오후|저녁|아침|점심|밤|새벽)?\s*'
        r'(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?',
        text,
    )

    if not korean_time_match:
        return None

    period = korean_time_match.group(1) or ''
    hour = int(korean_time_match.group(2))
    minute = int(korean_time_match.group(3) or 0)

    if not 1 <= hour <= 24 or not 0 <= minute <= 59:
        return None

    if hour == 24:
        hour = 0

    if period in {'오후', '저녁', '밤'} and hour < 12:
        hour += 12
    elif period in {'오전', '아침', '새벽'} and hour == 12:
        hour = 0
    elif period == '점심' and hour < 11:
        hour += 12

    if hour > 23:
        return None

    return time(hour, minute)


def infer_scheduled_at_from_explicit_time(scheduled_date, zone, *texts):
    if not scheduled_date:
        return None

    for text in texts:
        explicit_time = infer_explicit_clock_time(text)

        if explicit_time:
            return datetime.combine(scheduled_date, explicit_time, tzinfo=zone)

    return None


def _date_string_from_iso_datetime(value):
    if not value:
        return None

    if hasattr(value, 'date'):
        return value.date().isoformat()

    try:
        return datetime.fromisoformat(
            str(value).replace('Z', '+00:00'),
        ).date().isoformat()
    except ValueError:
        return None


def normalize_promise_time_label(time_label, source_text=None):
    source_text = source_text or ''
    time_label = re.sub(r'\s+', ' ', (time_label or '').strip())

    if not time_label:
        return ''

    if has_explicit_clock_time(source_text):
        return time_label[:80]

    for broad_time_word in BROAD_TIME_WORDS:
        if broad_time_word in source_text:
            return broad_time_word

    if has_explicit_clock_time(time_label):
        return ''

    return time_label[:80]


def _strip_person_prefix(text, person=None):
    if not text or person is None:
        return text

    name = (getattr(person, 'name', '') or '').strip()
    relationship = (getattr(person, 'relationship', '') or '').strip()

    if not name:
        return text

    display_names = [name]

    if relationship:
        display_names.extend(
            [
                f'{relationship} {name}',
                f'{relationship}{name}',
            ],
        )

    for display_name in sorted(display_names, key=len, reverse=True):
        text = re.sub(
            rf'^{re.escape(display_name)}\s*(과|와|랑|하고)\s*',
            '',
            text,
        )

    return text.strip()


def _clean_promise_event_text(text):
    text = re.sub(r'\s+', ' ', (text or '').strip())
    text = text.rstrip('.。')
    text = re.sub(r'\s*(을|를)?\s*합니다$', '', text)
    text = re.sub(r'\s*하기로\s*했습니다$', '', text)
    text = re.sub(r'\s*할\s*예정입니다$', '', text)
    text = re.sub(r'\s*예정입니다$', '', text)
    text = re.sub(r'기념으로\s+', '기념 ', text)
    return text.strip()


def _preserve_meal_context(text, time_label=None):
    time_label = time_label or ''

    for meal_text in ['아침', '점심', '저녁']:
        if (
            meal_text in time_label
            and '식사' in text
            and f'{meal_text} 식사' not in text
        ):
            return re.sub(r'식사', f'{meal_text} 식사', text, count=1)

    return text


def normalize_promise_description(
    text,
    person=None,
    time_label=None,
):
    text = _strip_person_prefix(text, person)
    text = re.sub(r'\s+', ' ', (text or '').strip())

    if not text:
        return ''

    date_patterns = [
        r'\b오늘\b',
        r'\b내일\b',
        r'\b모레\b',
        r'이번\s*주말',
        r'다음\s*주말',
        r'(이번\s*주|다음\s*주)\s*'
        r'(월요일|화요일|수요일|목요일|금요일|토요일|일요일|월|화|수|목|금|토|일)',
        r'\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일',
        r'\d{1,2}\s*월\s*\d{1,2}\s*일',
    ]
    time_patterns = [
        r'(오전|오후|저녁|아침|점심|밤|새벽)\s*\d{1,2}\s*시(\s*\d{1,2}\s*분)?',
        r'\d{1,2}\s*시\s*\d{1,2}\s*분',
        r'\d{1,2}\s*시',
    ]

    for pattern in [*date_patterns, *time_patterns]:
        text = re.sub(
            rf'(^|\s){pattern}(에|에는|쯤|께)?(?=\s|$)',
            ' ',
            text,
        )

    text = re.sub(r'\s+', ' ', text).strip()
    text = re.sub(r'^(에|에는)\s+', '', text)

    text = _clean_promise_event_text(text)
    return _preserve_meal_context(text, time_label)


def normalize_promise_data(promise_data, person=None):
    if not promise_data:
        return promise_data

    promise_data = dict(promise_data)
    source_text = promise_data.get('raw_text') or ''
    normalized_time_label = normalize_promise_time_label(
        promise_data.get('time_label'),
        source_text,
    )

    if promise_data.get('scheduled_at') and not has_explicit_clock_time(source_text):
        promise_data['scheduled_date'] = (
            promise_data.get('scheduled_date')
            or _date_string_from_iso_datetime(promise_data.get('scheduled_at'))
        )
        promise_data['scheduled_at'] = None

    promise_data['time_label'] = normalized_time_label
    promise_data['description'] = normalize_promise_description(
        promise_data.get('description'),
        person=person,
        time_label=normalized_time_label,
    )

    return promise_data


def format_person_summary_promise_display(promise, person=None, now=None):
    promise_datetime = get_promise_local_datetime(promise)

    if not promise_datetime:
        event_text = normalize_promise_description(
            getattr(promise, 'description', '')
            or getattr(promise, 'title', ''),
            person,
            getattr(promise, 'time_label', ''),
        )
        return f'{event_text} 예정'.strip() if event_text else None

    today = get_reference_now(promise, now).date()
    promise_date = promise_datetime.date()
    day_delta = (promise_date - today).days

    if day_delta == 0:
        date_text = '오늘'
    elif day_delta == 1:
        date_text = '내일'
    elif day_delta == 2:
        date_text = '모레'
    else:
        date_text = f'{promise_date.month}월 {promise_date.day}일'

    time_label = (getattr(promise, 'time_label', '') or '').strip()

    if getattr(promise, 'scheduled_at', None) and not time_label:
        time_label = format_korean_time(promise_datetime)

    event_text = normalize_promise_description(
        getattr(promise, 'description', '')
        or getattr(promise, 'title', ''),
        person,
        time_label,
    )
    parts = [date_text]

    if time_label:
        parts.append(time_label)

    if event_text:
        parts.append(event_text)

    display_text = ' '.join(parts).strip()

    if display_text and not display_text.endswith('예정'):
        display_text = f'{display_text} 예정'

    return display_text or None
