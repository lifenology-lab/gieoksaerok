from datetime import datetime, time, timezone as datetime_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.utils import timezone


DEFAULT_PROMISE_TIMEZONE = 'Asia/Seoul'


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
