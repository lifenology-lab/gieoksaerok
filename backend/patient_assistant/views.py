from django.db import transaction
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from people.services import OpenAITranscriptionError, transcribe_audio_file
from records.models import ConfusionEvent

from .models import PatientQuestionEvent
from .serializers import PatientQuestionEventSerializer


MAX_PATIENT_QUESTION_AUDIO_BYTES = 10 * 1024 * 1024

QUESTION_INTENT_TO_CONFUSION_TYPE = {
    'person': 'person',
    'place': 'place',
    'way_home': 'place',
    'schedule': 'task',
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
