import base64
import json
from dataclasses import dataclass
from pathlib import Path
from tempfile import NamedTemporaryFile

from django.conf import settings
from pydantic import BaseModel, Field


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
    key_points: list[str] = Field(
        description='다음 대화에 도움이 되는 중요한 사실 목록',
    )


class OpenAITranscriptionError(Exception):
    pass


class OpenAIMemorySummaryError(Exception):
    pass


RECENT_MEMORY_LIMIT = 3
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


def _format_core_memory(core_memory):
    if not core_memory:
        return '없음'

    if isinstance(core_memory, str):
        return core_memory

    return _compact_json(core_memory, max_length=1600)


def _recap_for_prompt(recap):
    if not isinstance(recap, dict):
        return recap

    keys = [
        'title',
        'headline',
        'summary',
        'upcoming_promise',
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
):
    if recent_memories is None and latest_memory:
        recent_memories = [latest_memory]

    recent_memory_context = _recent_memories_for_prompt(recent_memories)
    parts = [
        '다음 오디오는 한국어 일상 대화입니다.',
        f'[배경 정보] 이름: {person.name} (관계: {person.relationship})',
        f'핵심 정보(장기 기억): {_format_core_memory(person.core_memory)}',
        '사람 이름, 가족 호칭, 약속, 장소, 날짜, 건강 관련 표현을 가능한 한 정확하게 전사하세요.',
    ]

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
            params['extra_body'] = {
                'known_speaker_names': [PATIENT_SPEAKER_NAME],
                'known_speaker_references': [
                    _patient_voice_reference_data_url(patient_voice_profile),
                ],
            }

        if settings.OPENAI_TRANSCRIPTION_LANGUAGE:
            params['language'] = settings.OPENAI_TRANSCRIPTION_LANGUAGE

        if prompt:
            params['prompt'] = prompt

        try:
            transcription = client.audio.transcriptions.create(**params)
        except Exception as exc:
            raise OpenAITranscriptionError(
                'OpenAI 음성 텍스트 변환 요청에 실패했습니다.',
            ) from exc

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
        'place, promise, or scheduled plan into upcoming_promise. If no clear '
        'future promise exists, return null. '
        'Output Format: You must respond strictly using the provided JSON schema. '
        'Use title for a 10-character Korean topic label, summary for the memory '
        'card body, upcoming_promise for the future action, and key_points for '
        'up to 4 useful facts for the next conversation. Use core_memory as '
        'long-term background information, and use recent_memories as short-term '
        'context so older but important details are not lost. The JSON you return '
        'must be the new memory card for current_transcript, not a full rewrite '
        'of every old memory. Prefer facts from current_transcript when there is '
        'any conflict. Use only facts found in current_transcript, core_memory, '
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
                f'핵심 정보(장기 기억): {_format_core_memory(person.core_memory)}\n\n'
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
