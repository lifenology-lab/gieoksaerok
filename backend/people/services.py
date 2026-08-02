import base64
import json
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile

from django.conf import settings
from pydantic import BaseModel, Field

from .promise_utils import format_promise_display


class ConversationPromiseCandidate(BaseModel):
    title: str = Field(
        description='약속을 10~20자 안팎으로 표현한 제목 (예: 저녁 식사)',
    )
    description: str = Field(
        description='약속 내용을 환자가 이해하기 쉬운 한국어 한 문장으로 설명',
    )
    scheduled_at: str | None = Field(
        default=None,
        description='정확한 날짜와 시간이 있으면 ISO-8601 datetime. 없으면 null',
    )
    scheduled_date: str | None = Field(
        default=None,
        description='날짜만 확실하면 YYYY-MM-DD. 날짜도 불명확하면 null',
    )
    time_label: str | None = Field(
        default=None,
        description='저녁 7시, 오전, 점심처럼 화면 표시용 한국어 시간 표현',
    )
    timezone: str | None = Field(
        default=None,
        description='약속 날짜를 해석한 IANA timezone. 기본값은 Asia/Seoul',
    )
    raw_text: str = Field(description='약속 판단 근거가 된 STT 원문 일부')
    confidence: float = Field(
        default=0,
        ge=0,
        le=1,
        description='약속 추출 확신도 0~1',
    )


class ConversationMemoryRecap(BaseModel):
    title: str = Field(
        description='화면에 표시할 10자 안팎의 최근 대화 제목 (예: 병원 검사)',
    )
    summary: str = Field(
        description='환자가 바로 이해할 수 있는 1~2문장 한국어 요약',
    )
    upcoming_promise: str | None = Field(
        description='약속이나 예정된 일정 (없으면 null)',
    )
    promise: ConversationPromiseCandidate | None = Field(
        default=None,
        description='DB promises 테이블에 저장할 구조화된 약속. 없으면 null',
    )
    key_points: list[str] = Field(
        description='다음 대화에 도움이 되는 중요한 사실 목록',
    )


class LongTermMemoryCandidate(BaseModel):
    category: str = Field(
        description=(
            '장기 기억 카테고리. family, birth, marriage, education, career, '
            'health, death, relationship, other 중 하나'
        ),
    )
    title: str = Field(description='화면/관리자에서 볼 10~20자 안팎의 제목')
    description: str = Field(description='장기적으로 기억해야 할 사실 1문장')
    event_date: str | None = Field(
        default=None,
        description='명확한 사건 날짜. YYYY-MM-DD 형식으로 알 수 없으면 null',
    )
    confidence: float = Field(
        default=0,
        ge=0,
        le=1,
        description='장기 기억으로 저장할 만한 확신도 0~1. 0.8 이상만 후보로 반환',
    )
    source_text: str = Field(description='판단 근거가 된 STT 원문 일부')


class LongTermMemoryExtraction(BaseModel):
    items: list[LongTermMemoryCandidate] = Field(
        description='방금 대화에서 새로 추출한 장기 기억 후보 목록',
    )


class LongTermMemoryMergeDecision(BaseModel):
    should_update: bool = Field(
        description='기존 레코드를 새 정보로 갱신하거나 병합해야 하면 true',
    )
    title: str = Field(description='최종 장기 기억 제목')
    description: str = Field(description='최종 장기 기억 설명')
    event_date: str | None = Field(
        default=None,
        description='최종 사건 날짜. 알 수 없으면 null',
    )
    confidence: float = Field(
        default=0,
        ge=0,
        le=1,
        description='최종 장기 기억 확신도 0~1',
    )
    source_text: str = Field(description='최종 판단 근거 텍스트')
    reason: str = Field(description='기존/새 후보/병합 중 어떤 판단인지 짧게 설명')


class PersonDisplaySummaryCard(BaseModel):
    display_name: str = Field(description='예: 딸 지민')
    title: str = Field(description='얼굴 옆에 표시할 10자 안팎의 제목')
    body: str = Field(
        description=(
            '최근 대화 3개 중 환자에게 가장 중요하게 보여줄 대화를 요약한 '
            '1~2문장 한국어 본문'
        ),
    )
    upcoming_promise: str | None = Field(
        default=None,
        description='가장 중요한 다가오는 약속. 없으면 null',
    )
    long_term_hint: str | None = Field(
        default=None,
        description='관계를 떠올리는 데 도움 되는 장기 기억 한 문장. 없으면 null',
    )
    suggested_question: str | None = Field(
        default=None,
        description='다음 대화에 자연스럽게 물어볼 짧은 질문. 없으면 null',
    )


class OpenAITranscriptionError(Exception):
    pass


class OpenAIMemorySummaryError(Exception):
    pass


RECENT_MEMORY_LIMIT = 3
DISPLAY_SUMMARY_RECENT_MEMORY_LIMIT = 3
PATIENT_SPEAKER_NAME = '환자'


@dataclass
class TranscriptionResult:
    transcript: str
    speaker_segments: list[dict]


def _get_openai_client(error_class):
    if not settings.OPENAI_API_KEY:
        raise error_class('OPENAI_API_KEY가 설정되어 있지 않습니다.')

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise error_class('openai Python 패키지가 설치되어 있지 않습니다.') from exc

    return OpenAI(api_key=settings.OPENAI_API_KEY)


def _suffix_for_audio_file(uploaded_file):
    suffix = Path(uploaded_file.name or '').suffix.lower()

    if suffix:
        return suffix

    content_type = uploaded_file.content_type or ''

    if 'webm' in content_type:
        return '.webm'
    if 'mp4' in content_type:
        return '.mp4'
    if 'mpeg' in content_type or 'mp3' in content_type:
        return '.mp3'
    if 'wav' in content_type:
        return '.wav'

    return '.webm'


def _compact_json(value, max_length=2500):
    text = json.dumps(value, ensure_ascii=False, sort_keys=True)

    if len(text) <= max_length:
        return text

    return f'{text[:max_length]}...'


def _model_to_plain_data(value):
    if hasattr(value, 'model_dump'):
        return value.model_dump()

    if isinstance(value, dict):
        return value

    return {
        key: getattr(value, key)
        for key in dir(value)
        if not key.startswith('_') and not callable(getattr(value, key))
    }


def _patient_voice_reference_data_url(patient_voice_profile):
    content_type = patient_voice_profile.audio_content_type or 'audio/webm'
    audio_bytes = bytes(patient_voice_profile.audio_data)
    encoded_audio = base64.b64encode(audio_bytes).decode('utf-8')
    return f'data:{content_type};base64,{encoded_audio}'


def _recap_for_prompt(recap):
    if not isinstance(recap, dict):
        return recap

    keys = [
        'title',
        'headline',
        'summary',
        'upcoming_promise',
        'promise',
        'key_points',
        'follow_up_suggestions',
    ]
    compact_recap = {
        key: recap[key]
        for key in keys
        if key in recap and recap[key] not in (None, '', [])
    }

    return compact_recap or recap


def _memory_for_prompt(memory):
    memory_at = getattr(memory, 'memory_at', None)

    return {
        'memory_at': memory_at.isoformat() if memory_at else None,
        'recap': _recap_for_prompt(memory.recap),
    }


def _long_term_memory_for_prompt(memory):
    return {
        'id': str(memory.id),
        'category': memory.category,
        'title': memory.title,
        'description': memory.description,
        'event_date': memory.event_date.isoformat() if memory.event_date else None,
        'status': memory.status,
        'confidence': memory.confidence,
        'source_text': memory.source_text,
        'created_at': memory.created_at.isoformat() if memory.created_at else None,
    }


def _long_term_memories_for_prompt(long_term_memories):
    if not long_term_memories:
        return []

    return [
        _long_term_memory_for_prompt(memory)
        for memory in list(long_term_memories)
    ]


def _promise_value(promise, key, default=None):
    if isinstance(promise, dict):
        return promise.get(key, default)

    return getattr(promise, key, default)


def _isoformat_value(value):
    if hasattr(value, 'isoformat'):
        return value.isoformat()

    return value


def _promise_for_prompt(promise):
    display_text = _promise_value(promise, 'display_text')

    if not display_text and not isinstance(promise, dict):
        display_text = format_promise_display(promise)

    return {
        'id': str(_promise_value(promise, 'id')),
        'title': _promise_value(promise, 'title'),
        'description': _promise_value(promise, 'description'),
        'scheduled_at': _isoformat_value(_promise_value(promise, 'scheduled_at')),
        'scheduled_date': _isoformat_value(
            _promise_value(promise, 'scheduled_date'),
        ),
        'time_label': _promise_value(promise, 'time_label'),
        'timezone': _promise_value(promise, 'timezone'),
        'display_text': display_text,
        'confidence': _promise_value(promise, 'confidence'),
    }


def _promises_for_prompt(promises):
    if not promises:
        return []

    return [_promise_for_prompt(promise) for promise in list(promises)]


def _recent_memories_for_prompt(recent_memories):
    if not recent_memories:
        return []

    return [
        _memory_for_prompt(memory)
        for memory in list(recent_memories)[:RECENT_MEMORY_LIMIT]
    ]


def _format_recent_memory_line(index, memory_context):
    memory_at = memory_context.get('memory_at') or '날짜 미상'
    recap = _compact_json(memory_context.get('recap'), max_length=900)
    return f'{index}. ({memory_at}) {recap}'


def build_transcription_prompt(
    person,
    latest_memory=None,
    extra_prompt=None,
    recent_memories=None,
    long_term_memories=None,
):
    if recent_memories is None and latest_memory:
        recent_memories = [latest_memory]

    recent_memory_context = _recent_memories_for_prompt(recent_memories)
    long_term_memory_context = _long_term_memories_for_prompt(long_term_memories)
    parts = [
        '다음 오디오는 한국어 일상 대화입니다.',
        f'[배경 정보] 이름: {person.name} (관계: {person.relationship})',
        '사람 이름, 가족 호칭, 약속, 장소, 날짜, 건강 관련 표현을 가능한 한 정확하게 전사하세요.',
    ]

    if long_term_memory_context:
        parts.append('[장기 기억]')
        parts.append(_compact_json(long_term_memory_context, max_length=1800))

    if recent_memory_context:
        parts.append('[최근 만남 요약]')
        parts.extend(
            _format_recent_memory_line(index, memory_context)
            for index, memory_context in enumerate(recent_memory_context, start=1)
        )
        parts.append('위 맥락은 고유명사와 관계, 약속 표현을 더 정확히 듣기 위한 참고용입니다.')

    if extra_prompt:
        parts.extend(['추가 전사 참고사항:', extra_prompt])

    return '\n'.join(parts)


def _segment_value(segment, key, default=None):
    if isinstance(segment, dict):
        return segment.get(key, default)

    return getattr(segment, key, default)


def _normalize_speaker_segments(segments, person):
    partner_label = f'{person.relationship} {person.name}'
    normalized_segments = []

    for index, segment in enumerate(segments or []):
        text = (_segment_value(segment, 'text', '') or '').strip()

        if not text:
            continue

        raw_speaker = _segment_value(segment, 'speaker') or '상대방'
        is_patient = raw_speaker == PATIENT_SPEAKER_NAME
        speaker_label = PATIENT_SPEAKER_NAME if is_patient else partner_label

        normalized_segments.append(
            {
                'id': _segment_value(segment, 'id') or f'segment-{index + 1}',
                'speaker': raw_speaker,
                'speaker_label': speaker_label,
                'speaker_role': 'patient' if is_patient else 'counterpart',
                'start': _segment_value(segment, 'start'),
                'end': _segment_value(segment, 'end'),
                'text': text,
            },
        )

    return normalized_segments


def _format_transcript_from_segments(segments, fallback_text):
    if not segments:
        return fallback_text.strip()

    return '\n'.join(
        f"{segment['speaker_label']}: {segment['text']}"
        for segment in segments
        if segment.get('text')
    ).strip()


def transcribe_audio_file(
    uploaded_file,
    prompt=None,
    person=None,
    patient_voice_profile=None,
):
    client = _get_openai_client(OpenAITranscriptionError)
    suffix = _suffix_for_audio_file(uploaded_file)
    should_diarize = (
        getattr(settings, 'OPENAI_TRANSCRIPTION_DIARIZATION_ENABLED', True)
        and person is not None
        and patient_voice_profile is not None
    )

    with NamedTemporaryFile(suffix=suffix) as audio_file:
        for chunk in uploaded_file.chunks():
            audio_file.write(chunk)

        audio_file.flush()
        audio_file.seek(0)

        params = {
            'file': audio_file.file,
            'model': (
                settings.OPENAI_TRANSCRIPTION_DIARIZATION_MODEL
                if should_diarize
                else settings.OPENAI_TRANSCRIPTION_MODEL
            ),
            'response_format': 'diarized_json' if should_diarize else 'json',
        }

        if should_diarize:
            params['chunking_strategy'] = 'auto'
            params['known_speaker_names'] = [PATIENT_SPEAKER_NAME]
            params['known_speaker_references'] = [
                _patient_voice_reference_data_url(patient_voice_profile),
            ]

        if settings.OPENAI_TRANSCRIPTION_LANGUAGE:
            params['language'] = settings.OPENAI_TRANSCRIPTION_LANGUAGE

        if prompt and not should_diarize:
            params['prompt'] = prompt

        try:
            transcription = client.audio.transcriptions.create(**params)
        except Exception as exc:
            message = 'OpenAI 음성 텍스트 변환 요청에 실패했습니다.'

            if settings.DEBUG and str(exc):
                message = f'{message} {exc}'

            raise OpenAITranscriptionError(message) from exc

    if isinstance(transcription, str):
        return TranscriptionResult(
            transcript=transcription.strip(),
            speaker_segments=[],
        )

    transcription_data = _model_to_plain_data(transcription)
    text = transcription_data.get('text')
    raw_segments = transcription_data.get('segments') or []
    speaker_segments = (
        _normalize_speaker_segments(raw_segments, person)
        if person
        else []
    )

    if not text and not speaker_segments:
        raise OpenAITranscriptionError('변환된 텍스트가 비어 있습니다.')

    transcript = _format_transcript_from_segments(speaker_segments, text or '')

    if not transcript:
        raise OpenAITranscriptionError('변환된 텍스트가 비어 있습니다.')

    return TranscriptionResult(
        transcript=transcript,
        speaker_segments=speaker_segments,
    )


def _extract_parsed_memory(response):
    parsed = getattr(response, 'output_parsed', None)

    if parsed:
        return parsed

    for output in getattr(response, 'output', []):
        if getattr(output, 'type', None) != 'message':
            continue

        for item in getattr(output, 'content', []):
            if getattr(item, 'type', None) == 'refusal':
                raise OpenAIMemorySummaryError(item.refusal)

            parsed = getattr(item, 'parsed', None)

            if parsed:
                return parsed

    raise OpenAIMemorySummaryError('요약 결과를 JSON으로 해석하지 못했습니다.')


def generate_memory_recap(
    person,
    transcript,
    previous_memory=None,
    recent_memories=None,
    long_term_memories=None,
    recorded_at=None,
    promise_timezone=None,
):
    client = _get_openai_client(OpenAIMemorySummaryError)

    if recent_memories is None and previous_memory:
        recent_memories = [previous_memory]

    recent_memory_context = _recent_memories_for_prompt(recent_memories)
    recent_memory_lines = [
        _format_recent_memory_line(index, memory_context)
        for index, memory_context in enumerate(recent_memory_context, start=1)
    ]
    recent_memory_text = '\n'.join(recent_memory_lines) or '이전 만남 요약 없음'
    long_term_memory_text = _compact_json(
        _long_term_memories_for_prompt(long_term_memories),
        max_length=2400,
    )
    promise_timezone = (
        promise_timezone
        or getattr(settings, 'PROMISE_DEFAULT_TIMEZONE', 'Asia/Seoul')
    )
    recorded_at_text = recorded_at.isoformat() if recorded_at else '알 수 없음'

    instructions = (
        'You are an expert AI medical assistant specializing in cognitive support '
        "for patients with Alzheimer's disease and dementia. "
        'Your goal is to extract the core summary from a noisy Speech-to-Text '
        '(STT) transcript between a patient and their family member, and convert '
        'it into a clear, reassuring memory card for the patient. '
        'STT Noise Reduction Rules: Ignore filler words such as "어", "음", '
        '"그니까", repetitions, and minor speech recognition errors. Focus '
        'strictly on factual information, explicit commitments or promises, and '
        'warm interactions. '
        'Patient Readability & Cognitive Rules: Write in a clear, warm, polite '
        'Korean tone ending like "~했습니다" or "~입니다". Never use pronouns '
        'such as "그녀", "그분", or "상대방"; always explicitly write the '
        'relationship and name together, for example "딸 지민". Keep summary '
        'under 2 sentences and no more than 20 Korean words total. Avoid complex '
        'clause structures and passive voice. Extract any specific future time, '
        'place, promise, or scheduled plan into upcoming_promise and promise. '
        'Promise Extraction Rules: Use recorded_at and promise_timezone to '
        'convert relative Korean dates such as 오늘, 내일, 이번 주말, 다음 주 into '
        'absolute dates. Fill promise.scheduled_at with an ISO-8601 datetime '
        'when an exact date and time are clear. Fill promise.scheduled_date '
        'when only the date is clear. Fill promise.time_label with a short '
        'Korean time phrase such as "저녁 7시" or "오전". Return promise=null '
        'and upcoming_promise=null when there is no concrete future promise or '
        'the date cannot be inferred. Do not save vague plans, past events, or '
        'one-off appointments that already passed. '
        'Output Format: You must respond strictly using the provided JSON schema. '
        'Use title for a 10-character Korean topic label, summary for the memory '
        'card body, upcoming_promise for a display string, promise for the DB '
        'record, and key_points for up to 4 useful facts for the next '
        'conversation. Use long_term_memories '
        'as durable background information, and use recent_memories as short-term '
        'context so older but important details are not lost. The JSON you return '
        'must be the new memory card for current_transcript, not a full rewrite '
        'of every old memory. Prefer facts from current_transcript when there is '
        'any conflict. Use only facts found in current_transcript, long_term_memories, '
        'or recent_memories and do not guess.'
    )

    try:
        response = client.responses.parse(
            model=settings.OPENAI_MEMORY_SUMMARY_MODEL,
            instructions=instructions,
            input=(
                '[배경 정보]\n'
                f'이름: {person.name}\n'
                f'관계: {person.relationship}\n'
                f'대화 기록 시각(recorded_at): {recorded_at_text}\n'
                f'약속 기준 timezone: {promise_timezone}\n'
                f'장기 기억: {long_term_memory_text}\n\n'
                f'[최근 {RECENT_MEMORY_LIMIT}번의 만남 요약]\n'
                f'{recent_memory_text}\n\n'
                '[현재 방금 끝난 대화 STT 원문]\n'
                f'"{transcript}"\n\n'
                '[지시사항]\n'
                '위 맥락을 바탕으로 오늘 방금 끝난 대화를 요약하고 업데이트하세요. '
                '환자가 다음에 이 사람을 만났을 때 바로 볼 memory JSON을 생성하세요.'
            ),
            text_format=ConversationMemoryRecap,
            max_output_tokens=settings.OPENAI_MEMORY_SUMMARY_MAX_OUTPUT_TOKENS,
            temperature=0.2,
        )
    except Exception as exc:
        raise OpenAIMemorySummaryError(
            'OpenAI 대화 요약 요청에 실패했습니다.',
        ) from exc

    parsed = _extract_parsed_memory(response)

    if hasattr(parsed, 'model_dump'):
        return parsed.model_dump()

    return dict(parsed)


def extract_long_term_memories(person, transcript, recent_memories=None):
    client = _get_openai_client(OpenAIMemorySummaryError)
    recent_memory_context = _recent_memories_for_prompt(recent_memories)
    instructions = (
        'You are an expert memory curator for a dementia support app. Extract '
        'only must-remember, durable long-term facts from a noisy Korean STT '
        'transcript. Save only facts that strongly help the patient understand '
        'the relationship or recognize this person in future meetings. '
        'Save: core relationship events such as family relationship changes, '
        'marriage, birth, or death; life-stage changes such as school admission, '
        'graduation, employment, job change, or retirement; long-term illness, '
        'surgery, or major health changes; residence changes, moving in together, '
        'separation, or other major living-context changes; stable identifying '
        'facts that strongly help recognition. '
        'Do not save: simple hobbies, ordinary meals, visits, outings, temporary '
        'moods or recent status updates, one-off appointments, vague plans, or '
        'anything sufficiently handled by recent_memories. '
        'Use only facts explicitly stated in current_transcript. Do not guess. '
        'Return candidates only when confidence is at least 0.8; otherwise '
        'return an empty items array. Write title and description in warm, '
        'simple Korean. Output strictly using the provided JSON schema.'
    )
    input_payload = {
        'person': {
            'id': str(person.id),
            'name': person.name,
            'relationship': person.relationship,
        },
        'allowed_categories': [
            'family',
            'birth',
            'marriage',
            'education',
            'career',
            'health',
            'death',
            'relationship',
            'other',
        ],
        'current_transcript': transcript,
        'recent_memories': recent_memory_context,
    }

    try:
        response = client.responses.parse(
            model=settings.OPENAI_MEMORY_SUMMARY_MODEL,
            instructions=instructions,
            input=(
                '아래 JSON을 바탕으로 새 장기 기억 후보만 추출하세요.\n'
                f'{json.dumps(input_payload, ensure_ascii=False)}'
            ),
            text_format=LongTermMemoryExtraction,
            max_output_tokens=settings.OPENAI_MEMORY_SUMMARY_MAX_OUTPUT_TOKENS,
            temperature=0.1,
        )
    except Exception as exc:
        raise OpenAIMemorySummaryError(
            'OpenAI 장기 기억 추출 요청에 실패했습니다.',
        ) from exc

    parsed = _extract_parsed_memory(response)

    if hasattr(parsed, 'model_dump'):
        return parsed.model_dump().get('items', [])

    return dict(parsed).get('items', [])


def extract_initial_long_term_memories(person, initial_memory):
    if not initial_memory or not initial_memory.strip():
        return []

    client = _get_openai_client(OpenAIMemorySummaryError)
    instructions = (
        'You are an expert memory curator for a dementia support app. Convert '
        'a short Korean profile note written during person registration into '
        'durable long-term memory records. Long-term facts include family '
        'relationship details, birth, marriage, education, career, health, '
        'death, important life changes, and stable facts that help the patient '
        'recognize the person months later. Split distinct facts into separate '
        'items when useful. Do not invent information. Write title and '
        'description in warm, simple Korean. If the note contains no durable '
        'facts, return an empty items array. Output strictly using the provided '
        'JSON schema.'
    )
    input_payload = {
        'person': {
            'id': str(person.id),
            'name': person.name,
            'relationship': person.relationship,
        },
        'allowed_categories': [
            'family',
            'birth',
            'marriage',
            'education',
            'career',
            'health',
            'death',
            'relationship',
            'other',
        ],
        'initial_memory_note': initial_memory.strip(),
    }

    try:
        response = client.responses.parse(
            model=settings.OPENAI_MEMORY_SUMMARY_MODEL,
            instructions=instructions,
            input=(
                '아래 JSON을 바탕으로 인물 등록 시 입력된 핵심 기억을 '
                '장기 기억 후보로 변환하세요.\n'
                f'{json.dumps(input_payload, ensure_ascii=False)}'
            ),
            text_format=LongTermMemoryExtraction,
            max_output_tokens=settings.OPENAI_MEMORY_SUMMARY_MAX_OUTPUT_TOKENS,
            temperature=0.1,
        )
    except Exception as exc:
        raise OpenAIMemorySummaryError(
            'OpenAI 초기 장기 기억 변환 요청에 실패했습니다.',
        ) from exc

    parsed = _extract_parsed_memory(response)

    if hasattr(parsed, 'model_dump'):
        return parsed.model_dump().get('items', [])

    return dict(parsed).get('items', [])


def merge_long_term_memory_candidate(person, existing_memory, candidate):
    client = _get_openai_client(OpenAIMemorySummaryError)
    instructions = (
        'You are an expert memory curator for a dementia support app. A person '
        'can have only one long-term memory record per category. Compare the '
        'existing record and the new candidate. Keep the existing record if the '
        'candidate is weaker, redundant, temporary, or less useful for future '
        'recognition. Update to the candidate if it is clearly more accurate, '
        'more important, or replaces outdated information. Merge them into one '
        'record if both contain durable, compatible facts in the same category. '
        'Do not invent information. Preserve warm, simple Korean. Return '
        'should_update=false when the existing record should remain unchanged. '
        'Return should_update=true with the final merged record when the DB '
        'record should be updated. Output strictly using the provided JSON schema.'
    )
    input_payload = {
        'person': {
            'id': str(person.id),
            'name': person.name,
            'relationship': person.relationship,
        },
        'category': existing_memory.category,
        'existing_memory': _long_term_memory_for_prompt(existing_memory),
        'new_candidate': candidate,
    }

    try:
        response = client.responses.parse(
            model=settings.OPENAI_MEMORY_SUMMARY_MODEL,
            instructions=instructions,
            input=(
                '아래 JSON을 바탕으로 같은 category의 장기 기억을 하나의 '
                '최종 레코드로 유지/교체/병합할지 판단하세요.\n'
                f'{json.dumps(input_payload, ensure_ascii=False)}'
            ),
            text_format=LongTermMemoryMergeDecision,
            max_output_tokens=settings.OPENAI_MEMORY_SUMMARY_MAX_OUTPUT_TOKENS,
            temperature=0.1,
        )
    except Exception as exc:
        raise OpenAIMemorySummaryError(
            'OpenAI 장기 기억 병합 요청에 실패했습니다.',
        ) from exc

    parsed = _extract_parsed_memory(response)

    if hasattr(parsed, 'model_dump'):
        return parsed.model_dump()

    return dict(parsed)


def generate_person_display_summary(
    person,
    recent_memories,
    long_term_memories,
    active_promises=None,
):
    client = _get_openai_client(OpenAIMemorySummaryError)
    recent_memory_context = [
        _memory_for_prompt(memory)
        for memory in list(recent_memories)[:DISPLAY_SUMMARY_RECENT_MEMORY_LIMIT]
    ]
    long_term_memory_context = [
        _long_term_memory_for_prompt(memory)
        for memory in list(long_term_memories)
    ]
    active_promise_context = _promises_for_prompt(active_promises)
    instructions = (
        'You are an expert AI assistant creating a small face-adjacent memory '
        'card for a patient with Alzheimer disease or dementia. Use the '
        'person profile, recent conversation memories, and long-term memories '
        'to create one clear, reassuring Korean card. The body field must '
        'summarize the most important conversation from recent_memories, which '
        'contains up to the 3 most recent conversation summaries. Do not use '
        'long_term_memories as the main source for body; use them only for '
        'recognition context and long_term_hint. Use active_promises as the '
        'only source for upcoming_promise. If active_promises is non-empty, '
        'set upcoming_promise to the most helpful active promise display_text. '
        'If active_promises is empty, set upcoming_promise to null even if old '
        'recent_memories contain stale promise text. Include a '
        'long_term_hint only when a stable fact helps the patient recognize '
        'the person. Never use vague '
        'pronouns like "그분" or "상대방"; explicitly write the relationship '
        'and name together. Use only provided facts and do not guess. Output '
        'strictly using the provided JSON schema.'
    )
    input_payload = {
        'person': {
            'id': str(person.id),
            'name': person.name,
            'relationship': person.relationship,
        },
        'recent_memories': recent_memory_context,
        'long_term_memories': long_term_memory_context,
        'active_promises': active_promise_context,
    }

    try:
        response = client.responses.parse(
            model=settings.OPENAI_MEMORY_SUMMARY_MODEL,
            instructions=instructions,
            input=(
                '아래 JSON을 바탕으로 얼굴 옆에 보여줄 표시용 memory card를 생성하세요.\n'
                f'{json.dumps(input_payload, ensure_ascii=False)}'
            ),
            text_format=PersonDisplaySummaryCard,
            max_output_tokens=settings.OPENAI_MEMORY_SUMMARY_MAX_OUTPUT_TOKENS,
            temperature=0.2,
        )
    except Exception as exc:
        raise OpenAIMemorySummaryError(
            'OpenAI 표시용 요약 생성 요청에 실패했습니다.',
        ) from exc

    parsed = _extract_parsed_memory(response)

    if hasattr(parsed, 'model_dump'):
        return parsed.model_dump()

    return dict(parsed)
