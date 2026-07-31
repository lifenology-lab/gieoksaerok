from django.db.models import Prefetch
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Conversation,
    LongTermMemory,
    Memory,
    PatientVoiceProfile,
    Person,
    PersonSummary,
)
from .serializers import (
    ConversationSerializer,
    LongTermMemorySerializer,
    MemorySerializer,
    PersonSerializer,
    PersonSummarySerializer,
)
from .services import (
    DISPLAY_SUMMARY_RECENT_MEMORY_LIMIT,
    OpenAIMemorySummaryError,
    OpenAITranscriptionError,
    RECENT_MEMORY_LIMIT,
    build_transcription_prompt,
    extract_long_term_memories,
    generate_person_display_summary,
    generate_memory_recap,
    transcribe_audio_file,
)


MAX_PATIENT_VOICE_SAMPLE_BYTES = 10 * 1024 * 1024
LONG_TERM_MEMORY_DISPLAY_LIMIT = 20


def normalize_long_term_memory_category(category):
    allowed_categories = {
        choice[0]
        for choice in LongTermMemory.CATEGORY_CHOICES
    }

    if category in allowed_categories:
        return category

    return LongTermMemory.CATEGORY_OTHER


def clamp_confidence(value):
    try:
        confidence = float(value)
    except (TypeError, ValueError):
        return 0

    return min(max(confidence, 0), 1)


def create_long_term_memory_records(person, conversation, candidates):
    records = []

    for candidate in candidates:
        title = (candidate.get('title') or '').strip()
        description = (candidate.get('description') or '').strip()

        if not title or not description:
            continue

        event_date_value = candidate.get('event_date')
        event_date = parse_date(event_date_value) if event_date_value else None
        category = normalize_long_term_memory_category(candidate.get('category'))
        confidence = clamp_confidence(candidate.get('confidence'))
        source_text = (candidate.get('source_text') or '').strip()
        record, created = LongTermMemory.objects.get_or_create(
            person=person,
            category=category,
            title=title[:80],
            description=description,
            defaults={
                'conversation': conversation,
                'event_date': event_date,
                'confidence': confidence,
                'source_text': source_text,
            },
        )

        if not created and confidence > record.confidence:
            record.conversation = conversation
            record.event_date = event_date or record.event_date
            record.confidence = confidence
            record.source_text = source_text or record.source_text
            record.save(
                update_fields=[
                    'conversation',
                    'event_date',
                    'confidence',
                    'source_text',
                    'updated_at',
                ],
            )

        records.append(record)

    return records


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
            Prefetch(
                'summaries',
                queryset=PersonSummary.objects.filter(
                    status=PersonSummary.STATUS_ACTIVE,
                ).order_by('-generated_at', '-created_at'),
                to_attr='prefetched_latest_summaries',
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
        long_term_memory_records = []
        long_term_memory_error = None
        person_summary = None
        summary_error = None

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

            try:
                long_term_memory_candidates = extract_long_term_memories(
                    person=person,
                    transcript=transcript,
                )
                long_term_memory_records = create_long_term_memory_records(
                    person=person,
                    conversation=conversation,
                    candidates=long_term_memory_candidates,
                )
            except OpenAIMemorySummaryError as exc:
                long_term_memory_error = str(exc)

            try:
                display_memories = list(
                    Memory.objects.filter(person=person)
                    .order_by('-memory_at', '-created_at')[
                        :DISPLAY_SUMMARY_RECENT_MEMORY_LIMIT
                    ],
                )
                display_long_term_memories = list(
                    LongTermMemory.objects.filter(person=person)
                    .exclude(status=LongTermMemory.STATUS_ARCHIVED)
                    .order_by('-created_at')[:LONG_TERM_MEMORY_DISPLAY_LIMIT],
                )
                card = generate_person_display_summary(
                    person=person,
                    recent_memories=display_memories,
                    long_term_memories=display_long_term_memories,
                )
                PersonSummary.objects.filter(
                    person=person,
                    status=PersonSummary.STATUS_ACTIVE,
                ).update(status=PersonSummary.STATUS_STALE)
                person_summary = PersonSummary.objects.create(
                    person=person,
                    conversation=conversation,
                    card=card,
                    source_memory_ids=[
                        str(display_memory.id)
                        for display_memory in display_memories
                    ],
                    source_long_term_memory_ids=[
                        str(long_term_memory.id)
                        for long_term_memory in display_long_term_memories
                    ],
                    generated_at=recorded_at,
                )
            except OpenAIMemorySummaryError as exc:
                summary_error = str(exc)
        except OpenAIMemorySummaryError as exc:
            memory_error = str(exc)
            conversation.status = Conversation.STATUS_FAILED
            conversation.save(update_fields=['status', 'updated_at'])

        serializer = ConversationSerializer(conversation)
        data = serializer.data
        data['memory'] = MemorySerializer(memory).data if memory else None
        data['long_term_memories'] = LongTermMemorySerializer(
            long_term_memory_records,
            many=True,
        ).data
        data['summary'] = (
            PersonSummarySerializer(person_summary).data
            if person_summary
            else None
        )

        if memory_error:
            data['memory_error'] = memory_error

        if long_term_memory_error:
            data['long_term_memory_error'] = long_term_memory_error

        if summary_error:
            data['summary_error'] = summary_error

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
