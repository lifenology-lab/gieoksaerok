from pathlib import Path
from tempfile import NamedTemporaryFile

from django.conf import settings


class OpenAITranscriptionError(Exception):
    pass


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


def transcribe_audio_file(uploaded_file, prompt=None):
    if not settings.OPENAI_API_KEY:
        raise OpenAITranscriptionError(
            'OPENAI_API_KEY가 설정되어 있지 않습니다.',
        )

    try:
        from openai import OpenAI
    except ImportError as exc:
        raise OpenAITranscriptionError(
            'openai Python 패키지가 설치되어 있지 않습니다.',
        ) from exc

    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    suffix = _suffix_for_audio_file(uploaded_file)

    with NamedTemporaryFile(suffix=suffix) as audio_file:
        for chunk in uploaded_file.chunks():
            audio_file.write(chunk)

        audio_file.flush()
        audio_file.seek(0)

        params = {
            'file': audio_file,
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
