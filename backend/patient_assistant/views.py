from django.db import transaction
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from people.services import OpenAITranscriptionError, transcribe_audio_file
from people.models import Promise
from people.promise_cleanup import expire_stale_promises
from people.promise_utils import promise_sort_key
from people.serializers import PromiseSerializer
from records.models import ConfusionEvent

from .models import PatientQuestionEvent
from .serializers import PatientQuestionEventSerializer
from .services import (
    OpenAIPatientQuestionClassificationError,
    classify_patient_question,
)


MAX_PATIENT_QUESTION_AUDIO_BYTES = 10 * 1024 * 1024
MAX_PATIENT_QUESTION_TRANSCRIPT_LENGTH = 500

QUESTION_INTENT_TO_CONFUSION_TYPE = {
    'person': 'person',
    'place': 'place',
    'way_home': 'place',
    'schedule': 'task',
    'time': 'time',
    'meal': 'meal',
}


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
