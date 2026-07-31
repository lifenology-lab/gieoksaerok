from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Conversation, Memory, PatientVoiceProfile, Person
from .serializers import ConversationSerializer, MemorySerializer, PersonSerializer
from .services import (
    OpenAIMemorySummaryError,
    OpenAITranscriptionError,
    RECENT_MEMORY_LIMIT,
    build_transcription_prompt,
    generate_memory_recap,
    transcribe_audio_file,
)


MAX_PATIENT_VOICE_SAMPLE_BYTES = 10 * 1024 * 1024


def patient_voice_profile_response(profile):
    if not profile:
        return {
            'is_registered': False,
            'speaker_name': '환자',
            'updated_at': None,
        }

    return {
        'is_registered': True,
        'speaker_name': profile.speaker_name,
        'audio_content_type': profile.audio_content_type,
        'audio_filename': profile.audio_filename,
        'updated_at': profile.updated_at,
    }


class PersonListCreateView(APIView):
    def get(self, request):
        people = Person.objects.prefetch_related(
            Prefetch(
                'memories',
                queryset=Memory.objects.order_by('-memory_at', '-created_at'),
                to_attr='prefetched_latest_memories',
            ),
        )
        serializer = PersonSerializer(people, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = PersonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ConversationListCreateView(APIView):
    def get(self, request):
        conversations = Conversation.objects.select_related('person').all()
        serializer = ConversationSerializer(conversations, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = ConversationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ConversationTranscriptionCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        person_id = request.data.get('person') or request.data.get('person_id')
        audio_file = request.FILES.get('audio')

        if not person_id:
            return Response(
                {'detail': 'person 또는 person_id가 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not audio_file:
            return Response(
                {'detail': 'audio 파일이 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        person = get_object_or_404(Person, pk=person_id)
        recent_memories = list(
            Memory.objects.filter(person=person)
            .order_by('-memory_at', '-created_at')[:RECENT_MEMORY_LIMIT],
        )
        prompt = build_transcription_prompt(
            person,
            recent_memories=recent_memories,
            extra_prompt=request.data.get('prompt') or None,
        )
        recorded_at = timezone.now()

        if request.data.get('recorded_at'):
            parsed_recorded_at = parse_datetime(request.data['recorded_at'])

            if not parsed_recorded_at:
                return Response(
                    {'detail': 'recorded_at 형식이 올바르지 않습니다.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            recorded_at = parsed_recorded_at

        try:
            patient_voice_profile = PatientVoiceProfile.objects.first()
            transcription = transcribe_audio_file(
                audio_file,
                prompt=prompt,
                person=person,
                patient_voice_profile=patient_voice_profile,
            )
        except OpenAITranscriptionError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        if isinstance(transcription, str):
            transcript = transcription
            speaker_segments = []
        else:
            transcript = transcription.transcript
            speaker_segments = transcription.speaker_segments

        conversation = Conversation.objects.create(
            person=person,
            transcript=transcript,
            speaker_segments=speaker_segments,
            status=Conversation.STATUS_RECORDED,
            recorded_at=recorded_at,
        )
        memory = None
        memory_error = None

        try:
            recap = generate_memory_recap(
                person=person,
                transcript=transcript,
                recent_memories=recent_memories,
            )
            memory = Memory.objects.create(
                person=person,
                conversation=conversation,
                recap=recap,
                memory_at=recorded_at,
            )
            conversation.status = Conversation.STATUS_SUMMARIZED
            conversation.save(update_fields=['status', 'updated_at'])
        except OpenAIMemorySummaryError as exc:
            memory_error = str(exc)
            conversation.status = Conversation.STATUS_FAILED
            conversation.save(update_fields=['status', 'updated_at'])

        serializer = ConversationSerializer(conversation)
        data = serializer.data
        data['memory'] = MemorySerializer(memory).data if memory else None

        if memory_error:
            data['memory_error'] = memory_error

        return Response(data, status=status.HTTP_201_CREATED)


class MemoryListCreateView(APIView):
    def get(self, request):
        memories = Memory.objects.select_related('person', 'conversation').all()
        serializer = MemorySerializer(memories, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = MemorySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class PatientVoiceProfileView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request):
        profile = PatientVoiceProfile.objects.first()
        return Response(patient_voice_profile_response(profile))

    def post(self, request):
        audio_file = request.FILES.get('audio')

        if not audio_file:
            return Response(
                {'detail': 'audio 파일이 필요합니다.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if audio_file.size > MAX_PATIENT_VOICE_SAMPLE_BYTES:
            return Response(
                {'detail': '환자 목소리 샘플은 10MB 이하로 등록해주세요.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        audio_data = b''.join(audio_file.chunks())

        if not audio_data:
            return Response(
                {'detail': '녹음된 오디오가 비어 있습니다.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile, created = PatientVoiceProfile.objects.update_or_create(
            id=1,
            defaults={
                'speaker_name': request.data.get('speaker_name') or '환자',
                'audio_data': audio_data,
                'audio_content_type': audio_file.content_type or 'audio/webm',
                'audio_filename': audio_file.name or '',
            },
        )
        return Response(
            patient_voice_profile_response(profile),
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request):
        PatientVoiceProfile.objects.all().delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
