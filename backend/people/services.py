import json
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


def build_transcription_prompt(person, latest_memory=None, extra_prompt=None):
    parts = [
        '다음 오디오는 한국어 일상 대화입니다.',
        f'대화 상대는 {person.name}이며 환자와의 관계는 {person.relationship}입니다.',
        '사람 이름, 가족 호칭, 약속, 장소, 날짜, 건강 관련 표현을 가능한 한 정확하게 전사하세요.',
    ]

    if latest_memory:
        parts.extend(
            [
                '이전 대화 요약 JSON은 아래와 같습니다.',
                _compact_json(latest_memory.recap),
                '위 맥락은 고유명사와 관계를 더 정확히 듣기 위한 참고용입니다.',
            ],
        )

    if extra_prompt:
        parts.extend(['추가 전사 참고사항:', extra_prompt])

    return '\n'.join(parts)


def transcribe_audio_file(uploaded_file, prompt=None):
    client = _get_openai_client(OpenAITranscriptionError)
    suffix = _suffix_for_audio_file(uploaded_file)

    with NamedTemporaryFile(suffix=suffix) as audio_file:
        for chunk in uploaded_file.chunks():
            audio_file.write(chunk)

        audio_file.flush()
        audio_file.seek(0)

        params = {
            'file': audio_file.file,
            'model': settings.OPENAI_TRANSCRIPTION_MODEL,
            'response_format': 'json',
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
        return transcription

    text = getattr(transcription, 'text', None)

    if not text and isinstance(transcription, dict):
        text = transcription.get('text')

    if not text:
        raise OpenAITranscriptionError('변환된 텍스트가 비어 있습니다.')

    return text.strip()


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


def generate_memory_recap(person, transcript, previous_memory=None):
    client = _get_openai_client(OpenAIMemorySummaryError)
    previous_recap = previous_memory.recap if previous_memory else None
    input_payload = {
        'person': {
            'id': str(person.id),
            'name': person.name,
            'relationship': person.relationship,
        },
        'previous_memory': previous_recap,
        'new_transcript': transcript,
    }

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
        'up to 4 useful facts for the next conversation. '
        'Use only facts found in new_transcript or previous_memory and do not guess.'
    )

    try:
        response = client.responses.parse(
            model=settings.OPENAI_MEMORY_SUMMARY_MODEL,
            instructions=instructions,
            input=(
                '아래 JSON 데이터를 바탕으로 다음 만남에 보여줄 memory JSON을 생성하세요.\n'
                f'{json.dumps(input_payload, ensure_ascii=False)}'
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
