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


class OpenAIPatientQuestionClassificationError(Exception):
    pass


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
