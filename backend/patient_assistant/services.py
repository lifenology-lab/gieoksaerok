import json

from django.conf import settings


PATIENT_QUESTION_INTENTS = {
    'person',
    'meal',
    'time',
    'schedule',
    'place',
    'way_home',
    'unknown',
}

MAX_MEMORY_REFLECTION_HISTORY_MESSAGES = 6

MEMORY_REFLECTION_SYSTEM_PROMPT = '''
당신은 기억새록의 회상 대화 도우미입니다. 치매 환자가 한 장의 추억 사진을
보며 자신의 경험과 느낌을 편안하게 이야기하도록 곁에서 돕습니다. 시험을
보거나 기억을 확인하는 역할이 아닙니다.

대답 원칙:
1. 환자가 방금 말한 내용 중 가장 중요한 감정·사건·표현에 먼저 자연스럽게
   반응하세요. "좋은 추억이네요"처럼 어느 말에나 쓸 수 있는 말은 피하세요.
2. 사진 속 인물과 사진 설명, 이전 회상 요약에 있는 정보만 사실처럼 말할 수
   있습니다. 없는 장소·시간·사건·감정은 추측하거나 보태지 마세요.
3. 환자가 직접 질문하면 제공된 정보 안에서 짧고 분명하게 답하세요. 정보가
   부족하면 모른다고 솔직히 말하고, 환자가 떠오르는 내용을 이야기할 수 있게
   부드럽게 이어 주세요.
4. 질문은 대화를 자연스럽게 이어 갈 필요가 있을 때만 한 개 이하로 하세요.
   매번 질문으로 끝내지 않아도 됩니다.
5. "기억이 안 나요", 짧은 대답, 망설임에는 재촉하거나 평가하지 말고 사진을
   함께 천천히 살펴보자는 식으로 부담을 덜어 주세요.

말투와 안전:
- 따뜻하고 쉬운 한국어 존댓말로 1~3문장만 답하세요.
- 환자의 말이 사실인지 평가·정정하지 말고, 의료 조언·혼동 통계·진단을
  언급하지 마세요.
- 사진 설명을 기계적으로 반복하거나, 근거 없는 위로나 과장된 칭찬을 하지
  마세요.
'''.strip()


class OpenAIPatientQuestionClassificationError(Exception):
    pass


class OpenAIMemoryReflectionError(Exception):
    pass


class OpenAITextToSpeechError(Exception):
    pass


def generate_speech_audio(text):
    if not settings.OPENAI_API_KEY:
        raise OpenAITextToSpeechError('음성 안내 설정을 찾지 못했어요.')

    try:
        from openai import OpenAI

        response = OpenAI(api_key=settings.OPENAI_API_KEY).audio.speech.create(
            model=settings.OPENAI_TTS_MODEL,
            voice=settings.OPENAI_TTS_VOICE,
            input=text,
            response_format='mp3',
        )
        audio = response.read()
    except Exception as exc:
        raise OpenAITextToSpeechError(
            '음성 안내를 만들지 못했어요.'
        ) from exc

    if not audio:
        raise OpenAITextToSpeechError('음성 안내를 만들지 못했어요.')

    return audio


def generate_memory_reflection_reply(
    person,
    album_item,
    transcript,
    conversation_history=None,
    conversation_summary='',
):
    if not settings.OPENAI_API_KEY:
        raise OpenAIMemoryReflectionError('회상 대화 설정을 찾지 못했어요.')

    try:
        from openai import OpenAI

        history_messages = (conversation_history or [])[
            -MAX_MEMORY_REFLECTION_HISTORY_MESSAGES:
        ]
        messages = [
            {
                'role': 'system',
                'content': (
                    f'{MEMORY_REFLECTION_SYSTEM_PROMPT}\n\n'
                    '[회상에 사용할 수 있는 정보]\n'
                    f'사진 속 인물: {person.relationship} {person.name}\n'
                    f'사진 설명: {album_item.description or "등록된 설명이 없어요."}\n'
                    f'이전 회상 요약: {conversation_summary or "아직 없어요."}'
                ),
            },
            *history_messages,
            {'role': 'user', 'content': transcript},
        ]
        response = OpenAI(api_key=settings.OPENAI_API_KEY).chat.completions.create(
            model=settings.OPENAI_MEMORY_REFLECTION_MODEL,
            temperature=0.5,
            messages=messages,
            response_format={
                'type': 'json_schema',
                'json_schema': {
                    'name': 'memory_reflection_reply',
                    'strict': True,
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'reply': {'type': 'string'},
                            'summary': {
                                'type': 'string',
                                'description': (
                                    '다음 대화를 잇기 위한 200자 이하의 중립적 메모. '
                                    '환자가 이야기한 내용은 "환자는 ~라고 말했다"처럼 '
                                    '사실로 단정하지 않고, 사진 설명 밖의 내용을 추가하지 않는다.'
                                ),
                            },
                        },
                        'required': ['reply', 'summary'],
                        'additionalProperties': False,
                    },
                },
            },
        )
        result = json.loads(response.choices[0].message.content or '{}')
        reply = str(result.get('reply') or '').strip()
        summary = str(result.get('summary') or '').strip()
    except Exception as exc:
        raise OpenAIMemoryReflectionError(
            '회상 이야기에 답하지 못했어요.'
        ) from exc

    if not reply:
        raise OpenAIMemoryReflectionError('회상 이야기에 답하지 못했어요.')

    return {'reply': reply, 'summary': summary[:200]}


def classify_patient_question(transcript):
    if not settings.OPENAI_API_KEY:
        raise OpenAIPatientQuestionClassificationError(
            '질문 분류 설정을 찾지 못했어요.'
        )

    try:
        from openai import OpenAI

        response = OpenAI(api_key=settings.OPENAI_API_KEY).chat.completions.create(
            model=settings.OPENAI_PATIENT_QUESTION_CLASSIFICATION_MODEL,
            temperature=0,
            messages=[
                {
                    'role': 'system',
                    'content': (
                        '당신은 한국어 치매 환자 일상 보조 서비스의 질문 분류기입니다. '
                        '질문을 아래 의도 중 하나로만 분류하세요. '
                        'person: 사람의 정체·이름·관계 질문, '
                        'meal: 식사·음식·먹은 여부 질문, '
                        'time: 시간·날짜·요일 질문, '
                        'schedule: 약속·일정·해야 할 일 질문, '
                        'place: 현재 장소 질문, '
                        'way_home: 집에 가는 길·귀가 방법 질문, '
                        'unknown: 어느 범주에도 맞지 않거나 의미를 알 수 없는 질문. '
                        '집으로 돌아가는 방법은 place가 아니라 way_home입니다.'
                    ),
                },
                {'role': 'user', 'content': transcript},
            ],
            response_format={
                'type': 'json_schema',
                'json_schema': {
                    'name': 'patient_question_intent',
                    'strict': True,
                    'schema': {
                        'type': 'object',
                        'properties': {
                            'intent': {
                                'type': 'string',
                                'enum': sorted(PATIENT_QUESTION_INTENTS),
                            },
                        },
                        'required': ['intent'],
                        'additionalProperties': False,
                    },
                },
            },
        )
        content = response.choices[0].message.content
        result = json.loads(content or '{}')
        intent = result.get('intent')
    except Exception as exc:
        raise OpenAIPatientQuestionClassificationError(
            '질문을 분류하지 못했어요.'
        ) from exc

    if intent not in PATIENT_QUESTION_INTENTS:
        raise OpenAIPatientQuestionClassificationError(
            '질문을 분류하지 못했어요.'
        )

    return intent
