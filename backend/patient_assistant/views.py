import json

from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from people.services import OpenAITranscriptionError, transcribe_audio_file
from people.models import MemoryAlbumItem, Person, Promise
from people.promise_cleanup import expire_stale_promises
from people.promise_utils import (
    get_local_reference_date,
    get_promise_local_datetime,
    promise_sort_key,
)
from people.serializers import PromiseSerializer
from records.models import ConfusionEvent

from .models import PatientQuestionEvent
from .serializers import PatientQuestionEventSerializer
from .services import (
    OpenAIPatientQuestionClassificationError,
    OpenAIMemoryReflectionError,
    classify_patient_question,
    generate_memory_reflection_reply,
)


MAX_PATIENT_QUESTION_AUDIO_BYTES = 10 * 1024 * 1024
MAX_PATIENT_QUESTION_TRANSCRIPT_LENGTH = 500
MAX_MEMORY_REFLECTION_HISTORY_MESSAGES = 6
MAX_MEMORY_REFLECTION_SUMMARY_LENGTH = 200

QUESTION_INTENT_TO_CONFUSION_TYPE = {
    'person': 'person',
    'place': 'place',
    'way_home': 'place',
    'schedule': 'task',
    'time': 'time',
    'meal': 'meal',
}


def get_memory_reflection_context(raw_history, raw_summary):
    history = raw_history or []

    if isinstance(history, str):
        try:
            history = json.loads(history)
        except json.JSONDecodeError as exc:
            raise ValueError('회상 대화 형식이 올바르지 않아요.') from exc

    if not isinstance(history, list):
        raise ValueError('회상 대화 형식이 올바르지 않아요.')

    normalized_history = []
    for message in history[-MAX_MEMORY_REFLECTION_HISTORY_MESSAGES:]:
        if not isinstance(message, dict):
            continue

        role = message.get('role')
        content = str(message.get('content') or '').strip()

        if role not in {'user', 'assistant'} or not content:
            continue

        normalized_history.append(
            {
                'role': role,
                'content': content[:MAX_PATIENT_QUESTION_TRANSCRIPT_LENGTH],
            },
        )

    summary = str(raw_summary or '').strip()

    if len(summary) > MAX_MEMORY_REFLECTION_SUMMARY_LENGTH:
        raise ValueError('회상 요약이 너무 길어요.')

    return normalized_history, summary


class PatientQuestionTranscriptionView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        audio_file = request.FILES.get('audio')

        if not audio_file:
            return Response(
                {'detail': 'audio 파일이 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if audio_file.size > MAX_PATIENT_QUESTION_AUDIO_BYTES:
            return Response(
                {'detail': '음성 질문 파일은 10MB 이하만 사용할 수 있습니다.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            transcription = transcribe_audio_file(
                audio_file,
                prompt=(
                    '사용자가 일상생활에 대해 도움을 요청하는 짧은 한국어 질문입니다. '
                    '질문을 있는 그대로 전사하세요.'
                ),
            )
        except OpenAITranscriptionError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        transcript = (
            transcription
            if isinstance(transcription, str)
            else transcription.transcript
        ).strip()

        if not transcript:
            return Response(
                {'detail': '변환된 텍스트가 비어 있습니다.'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        return Response({'transcript': transcript}, status=status.HTTP_200_OK)


class PatientQuestionEventView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        events = PatientQuestionEvent.objects.filter(user=request.user)
        serializer = PatientQuestionEventSerializer(events, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = PatientQuestionEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        with transaction.atomic():
            event = serializer.save(user=request.user)
            confusion_type = QUESTION_INTENT_TO_CONFUSION_TYPE.get(
                event.intent_type,
            )

            if confusion_type:
                ConfusionEvent.objects.create(
                    user=request.user,
                    confusion_type=confusion_type,
                    occurred_at=event.occurred_at,
                )

        return Response(
            PatientQuestionEventSerializer(event).data,
            status=status.HTTP_201_CREATED,
        )


class PatientQuestionClassificationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        transcript = str(request.data.get('transcript') or '').strip()

        if not transcript:
            return Response(
                {'detail': '질문 내용이 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(transcript) > MAX_PATIENT_QUESTION_TRANSCRIPT_LENGTH:
            return Response(
                {'detail': '질문은 500자 이하로 입력해 주세요.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            intent = classify_patient_question(transcript)
        except OpenAIPatientQuestionClassificationError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({'intent': intent}, status=status.HTTP_200_OK)


class MemoryReflectionAudioView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        audio_file = request.FILES.get('audio')
        person_id = request.data.get('person_id')
        album_item_id = request.data.get('album_item_id')

        if not audio_file or not person_id or not album_item_id:
            return Response(
                {'detail': '사진과 음성 이야기 내용이 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if audio_file.size > MAX_PATIENT_QUESTION_AUDIO_BYTES:
            return Response(
                {'detail': '음성 이야기 파일은 10MB 이하만 사용할 수 있습니다.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            normalized_history, summary = get_memory_reflection_context(
                request.data.get('history'),
                request.data.get('summary'),
            )
        except ValueError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        person = get_object_or_404(Person, id=person_id, user=request.user)
        album_item = get_object_or_404(
            MemoryAlbumItem,
            id=album_item_id,
            person=person,
            user=request.user,
        )

        try:
            transcription = transcribe_audio_file(
                audio_file,
                prompt=(
                    '사용자가 추억 사진을 보며 떠오르는 기억과 느낌을 이야기하는 '
                    '짧은 한국어 발화입니다. 말한 내용을 있는 그대로 전사하세요.'
                ),
            )
        except OpenAITranscriptionError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        transcript = (
            transcription
            if isinstance(transcription, str)
            else transcription.transcript
        ).strip()

        if not transcript:
            return Response(
                {'detail': '말씀하신 내용을 확인하지 못했어요. 다시 말씀해 주세요.'},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        if len(transcript) > MAX_PATIENT_QUESTION_TRANSCRIPT_LENGTH:
            return Response(
                {'detail': '이야기는 500자 이하로 말씀해 주세요.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = generate_memory_reflection_reply(
                person,
                album_item,
                transcript,
                conversation_history=normalized_history,
                conversation_summary=summary,
            )
        except OpenAIMemoryReflectionError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {'transcript': transcript, **result},
            status=status.HTTP_200_OK,
        )


class PatientQuestionScheduleContextView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        expire_stale_promises(user=request.user)
        promises = list(
            Promise.objects.filter(
                user=request.user,
                status=Promise.STATUS_ACTIVE,
            ).select_related('person')
        )
        upcoming_promises = sorted(promises, key=promise_sort_key)[:5]
        serialized_promises = PromiseSerializer(upcoming_promises, many=True).data

        for promise_data, promise in zip(serialized_promises, upcoming_promises):
            promise_data['person_name'] = promise.person.name
            promise_data['person_relationship'] = promise.person.relationship

        return Response(
            serialized_promises,
            status=status.HTTP_200_OK,
        )


class PatientMemoryScheduleView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        expire_stale_promises(user=user)
        promises = list(
            Promise.objects.filter(user=user).exclude(
                status=Promise.STATUS_CANCELLED,
            ).select_related('person'),
        )
        today = get_local_reference_date()
        grouped_promises = {
            'past': [],
            'today': [],
            'upcoming': [],
        }

        for promise in promises:
            promise_datetime = get_promise_local_datetime(promise)

            if not promise_datetime:
                continue

            if promise_datetime.date() < today:
                grouped_promises['past'].append(promise)
            elif promise_datetime.date() == today:
                grouped_promises['today'].append(promise)
            else:
                grouped_promises['upcoming'].append(promise)

        grouped_promises['past'].sort(key=promise_sort_key, reverse=True)
        grouped_promises['today'].sort(key=promise_sort_key)
        grouped_promises['upcoming'].sort(key=promise_sort_key)

        def serialize_group(items):
            serialized_items = PromiseSerializer(items, many=True).data

            for promise_data, promise in zip(serialized_items, items):
                promise_data['person_name'] = promise.person.name
                promise_data['person_relationship'] = promise.person.relationship

            return serialized_items

        return Response(
            {
                group_name: serialize_group(items)
                for group_name, items in grouped_promises.items()
            },
            status=status.HTTP_200_OK,
        )
