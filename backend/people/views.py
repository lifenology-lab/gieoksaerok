from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Conversation, Memory, Person
from .serializers import ConversationSerializer, MemorySerializer, PersonSerializer
from .services import (
    OpenAIMemorySummaryError,
    OpenAITranscriptionError,
    build_transcription_prompt,
    generate_memory_recap,
    transcribe_audio_file,
)


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
        latest_memory = (
            Memory.objects.filter(person=person)
            .order_by('-memory_at', '-created_at')
            .first()
        )
        prompt = build_transcription_prompt(
            person,
            latest_memory=latest_memory,
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
            transcript = transcribe_audio_file(audio_file, prompt=prompt)
        except OpenAITranscriptionError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        conversation = Conversation.objects.create(
            person=person,
            transcript=transcript,
            status=Conversation.STATUS_RECORDED,
            recorded_at=recorded_at,
        )
        memory = None
        memory_error = None

        try:
            recap = generate_memory_recap(
                person=person,
                transcript=transcript,
                previous_memory=latest_memory,
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
