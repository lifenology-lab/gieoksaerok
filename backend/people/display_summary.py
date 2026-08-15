import re

from .promise_utils import normalize_promise_description


FUTURE_DATE_PATTERN = re.compile(
    r'내일|모레|다음\s*주|이번\s*주|주말|\d{1,2}\s*월\s*\d{1,2}\s*일',
)
TIME_PATTERN = re.compile(
    r'(오전|오후|저녁|아침|점심|밤|새벽)?\s*\d{1,2}\s*시'
    r'|\d{1,2}:\d{2}',
)
PROMISE_ACTION_PATTERN = re.compile(
    r'약속|예정|하기로|가기로|오기로|만나기로|먹기로|식사|방문',
)
TOKEN_PATTERN = re.compile(r'[0-9A-Za-z가-힣]+')


def _normalize_text(value):
    return re.sub(r'\s+', ' ', str(value or '').strip())


def _has_final_consonant(text):
    if not text:
        return False

    code = ord(text[-1])

    if not 0xAC00 <= code <= 0xD7A3:
        return False

    return (code - 0xAC00) % 28 != 0


def _person_display_name(person):
    if not person:
        return ''

    name = _normalize_text(getattr(person, 'name', ''))
    relationship = _normalize_text(getattr(person, 'relationship', ''))

    return f'{relationship} {name}'.strip()


def _append_sentence_period(text):
    text = _normalize_text(text)

    if not text:
        return ''

    if text[-1] in '.!?。':
        return text

    return f'{text}.'


def _tokens(text):
    return set(TOKEN_PATTERN.findall(_normalize_text(text)))


def _promise_event_text(promise, person=None):
    if not promise:
        return ''

    title = _normalize_text(getattr(promise, 'title', ''))
    description = _normalize_text(getattr(promise, 'description', ''))
    time_label = _normalize_text(getattr(promise, 'time_label', ''))
    return normalize_promise_description(
        description or title,
        person=person,
        time_label=time_label,
    )


def _overlaps_promise(text, promise, person=None):
    promise_event_text = _promise_event_text(promise, person=person)

    if not text or not promise_event_text:
        return False

    normalized_text = _normalize_text(text)

    if promise_event_text and promise_event_text in normalized_text:
        return True

    text_tokens = _tokens(normalized_text)
    promise_tokens = _tokens(promise_event_text)

    if not text_tokens or not promise_tokens:
        return False

    overlap_count = len(text_tokens & promise_tokens)
    return overlap_count / min(len(text_tokens), len(promise_tokens)) >= 0.6


def is_promise_like_display_text(text, promise=None, person=None):
    text = _normalize_text(text)

    if not text:
        return False

    if _overlaps_promise(text, promise, person=person):
        return True

    has_future_or_time = bool(
        FUTURE_DATE_PATTERN.search(text) or TIME_PATTERN.search(text),
    )
    has_promise_action = bool(PROMISE_ACTION_PATTERN.search(text))

    return has_future_or_time and has_promise_action


def ensure_explicit_person_reference(text, person=None):
    text = _normalize_text(text)
    display_name = _person_display_name(person)

    if not text or not display_name or display_name in text:
        return text

    name = _normalize_text(getattr(person, 'name', ''))

    if name and name in text:
        return text.replace(name, display_name, 1)

    particle = '과' if _has_final_consonant(display_name) else '와'
    return f'{display_name}{particle} {text}'


def select_face_card_body(recap, promise=None, person=None, fallback=''):
    if not isinstance(recap, dict):
        recap = {}

    primary_body = _normalize_text(
        recap.get('description')
        or recap.get('summary')
        or fallback
    )

    if primary_body and not is_promise_like_display_text(
        primary_body,
        promise=promise,
        person=person,
    ):
        return ensure_explicit_person_reference(primary_body, person=person)

    key_points = recap.get('key_points') or []

    if isinstance(key_points, list):
        memory_points = [
            _normalize_text(point)
            for point in key_points
            if _normalize_text(point)
            and not is_promise_like_display_text(
                point,
                promise=promise,
                person=person,
            )
        ]

        if memory_points:
            body = ' '.join(
                _append_sentence_period(point)
                for point in memory_points[:2]
            ).strip()
            return ensure_explicit_person_reference(body, person=person)

    return ensure_explicit_person_reference(primary_body, person=person)
