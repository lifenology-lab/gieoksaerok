from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.db import transaction
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
    MemoryAlbumItem,
    PatientVoiceProfile,
    Person,
    PersonSummary,
    Promise,
)
from .serializers import (
    ConversationSerializer,
    LongTermMemorySerializer,
    MemoryAlbumItemSerializer,
    MemorySerializer,
    PersonSerializer,
    PersonSummarySerializer,
    PromiseSerializer,
)
from .promise_utils import (
    ensure_aware_datetime,
    get_default_promise_timezone,
    is_promise_expired,
    promise_sort_key,
)
from .services import (
    DISPLAY_SUMMARY_RECENT_MEMORY_LIMIT,
    OpenAIMemorySummaryError,
    OpenAITranscriptionError,
    RECENT_MEMORY_LIMIT,
    build_transcription_prompt,
    extract_initial_long_term_memories,
    extract_long_term_memories,
    generate_person_display_summary,
    generate_memory_recap,
    merge_long_term_memory_candidate,
    transcribe_audio_file,
)


MAX_PATIENT_VOICE_SAMPLE_BYTES = 10 * 1024 * 1024
LONG_TERM_MEMORY_DISPLAY_LIMIT = 20
LONG_TERM_MEMORY_MIN_CONFIDENCE = 0.8
PROMISE_MIN_CONFIDENCE = 0.7
ACTIVE_PROMISE_DISPLAY_LIMIT = 3


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


def expire_stale_promises(person=None):
    queryset = Promise.objects.filter(status=Promise.STATUS_ACTIVE)

    if person is not None:
        queryset = queryset.filter(person=person)

    expired_ids = [
        promise.id
        for promise in queryset
        if is_promise_expired(promise)
    ]

    if expired_ids:
        Promise.objects.filter(id__in=expired_ids).update(
            status=Promise.STATUS_EXPIRED,
            updated_at=timezone.now(),
        )


def get_active_promises_for_person(person, limit=ACTIVE_PROMISE_DISPLAY_LIMIT):
    expire_stale_promises(person)
    promises = list(
        Promise.objects.filter(
            person=person,
            status=Promise.STATUS_ACTIVE,
        ),
    )
    return sorted(promises, key=promise_sort_key)[:limit]


def get_promise_timezone(timezone_name):
    fallback_timezone_name = get_default_promise_timezone()
    timezone_name = timezone_name or fallback_timezone_name

    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo(fallback_timezone_name)


def create_promise_record(person, conversation, memory, promise_data):
    if not promise_data:
        return None

    if hasattr(promise_data, 'model_dump'):
        promise_data = promise_data.model_dump()

    title = (promise_data.get('title') or '').strip()
    description = (promise_data.get('description') or '').strip()
    confidence = clamp_confidence(promise_data.get('confidence'))

    if not title or not description or confidence < PROMISE_MIN_CONFIDENCE:
        return None

    timezone_name = (
        promise_data.get('timezone')
        or getattr(settings, 'PROMISE_DEFAULT_TIMEZONE', 'Asia/Seoul')
    )
    promise_zone = get_promise_timezone(timezone_name)
    scheduled_at_value = promise_data.get('scheduled_at')
    scheduled_date_value = promise_data.get('scheduled_date')
    scheduled_at = parse_datetime(scheduled_at_value) if scheduled_at_value else None

    if scheduled_at:
        scheduled_at = ensure_aware_datetime(scheduled_at, promise_zone)

    scheduled_date = parse_date(scheduled_date_value) if scheduled_date_value else None

    if scheduled_at and not scheduled_date:
        scheduled_date = scheduled_at.astimezone(promise_zone).date()

    if not scheduled_at and not scheduled_date:
        return None

    promise = Promise(
        person=person,
        conversation=conversation,
        memory=memory,
        title=title[:80],
        description=description,
        scheduled_at=scheduled_at,
        scheduled_date=scheduled_date,
        time_label=(promise_data.get('time_label') or '').strip()[:80],
        timezone=timezone_name[:64],
        raw_text=(promise_data.get('raw_text') or '').strip(),
        status=Promise.STATUS_ACTIVE,
        confidence=confidence,
    )

    if is_promise_expired(promise):
        return None

    promise.save()
    return promise


def create_long_term_memory_records(
    person,
    conversation,
    candidates,
    status_value=LongTermMemory.STATUS_SUGGESTED,
):
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

        if confidence < LONG_TERM_MEMORY_MIN_CONFIDENCE:
            continue

        source_text = (candidate.get('source_text') or '').strip()

        existing_record = LongTermMemory.objects.filter(
            person=person,
            category=category,
        ).first()

        if not existing_record:
            record = LongTermMemory.objects.create(
                person=person,
                conversation=conversation,
                category=category,
                title=title[:80],
                description=description,
                event_date=event_date,
                status=status_value,
                confidence=confidence,
                source_text=source_text,
            )
            records.append(record)
            continue

        merge_decision = merge_long_term_memory_candidate(
            person=person,
            existing_memory=existing_record,
            candidate={
                'category': category,
                'title': title,
                'description': description,
                'event_date': event_date_value,
                'confidence': confidence,
                'source_text': source_text,
            },
        )

        should_promote_status = (
            status_value == LongTermMemory.STATUS_CONFIRMED
            and existing_record.status != LongTermMemory.STATUS_CONFIRMED
        )
        merged_confidence = clamp_confidence(merge_decision.get('confidence'))

        should_apply_merge = bool(merge_decision.get('should_update'))

        if not should_apply_merge and not should_promote_status:
            records.append(existing_record)
            continue

        if should_apply_merge and merged_confidence < LONG_TERM_MEMORY_MIN_CONFIDENCE:
            records.append(existing_record)
            continue

        if not should_apply_merge and should_promote_status:
            existing_record.status = status_value
            existing_record.confidence = max(existing_record.confidence, confidence)
            existing_record.save(
                update_fields=['status', 'confidence', 'updated_at'],
            )
            records.append(existing_record)
            continue

        merged_title = (merge_decision.get('title') or '').strip()
        merged_description = (merge_decision.get('description') or '').strip()

        if not merged_title or not merged_description:
            records.append(existing_record)
            continue

        merged_event_date_value = merge_decision.get('event_date')
        merged_event_date = (
            parse_date(merged_event_date_value)
            if merged_event_date_value
            else None
        )
        merged_source_text = (merge_decision.get('source_text') or '').strip()

        existing_record.conversation = conversation or existing_record.conversation
        existing_record.title = merged_title[:80]
        existing_record.description = merged_description
        existing_record.event_date = merged_event_date or existing_record.event_date

        if should_promote_status:
            existing_record.status = status_value

        existing_record.confidence = max(existing_record.confidence, merged_confidence)
        existing_record.source_text = merged_source_text or existing_record.source_text
        existing_record.save(
            update_fields=[
                'conversation',
                'title',
                'description',
                'event_date',
                'status',
                'confidence',
                'source_text',
                'updated_at',
            ],
        )
        records.append(existing_record)

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
        expire_stale_promises()
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
            Prefetch(
                'promises',
                queryset=Promise.objects.filter(
                    status=Promise.STATUS_ACTIVE,
                ).order_by('scheduled_at', 'scheduled_date', 'created_at'),
                to_attr='prefetched_active_promises',
            ),
        )
        serializer = PersonSerializer(people, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = PersonSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        initial_memory = serializer.validated_data.get('initial_memory', '')
        long_term_memory_records = []

        try:
            with transaction.atomic():
                person = serializer.save()

                if initial_memory:
                    initial_long_term_memory_candidates = (
                        extract_initial_long_term_memories(
                            person=person,
                            initial_memory=initial_memory,
                        )
                    )
                    long_term_memory_records = create_long_term_memory_records(
                        person=person,
                        conversation=None,
                        candidates=initial_long_term_memory_candidates,
                        status_value=LongTermMemory.STATUS_CONFIRMED,
                    )
        except OpenAIMemorySummaryError as exc:
            return Response(
                {'detail': str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        data = PersonSerializer(person).data
        data['initial_long_term_memories'] = LongTermMemorySerializer(
            long_term_memory_records,
            many=True,
        ).data
        return Response(data, status=status.HTTP_201_CREATED)


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
        long_term_memories = list(
            LongTermMemory.objects.filter(person=person)
            .exclude(status=LongTermMemory.STATUS_ARCHIVED)
            .order_by('-created_at')[:LONG_TERM_MEMORY_DISPLAY_LIMIT],
        )
        prompt = build_transcription_prompt(
            person,
            recent_memories=recent_memories,
            long_term_memories=long_term_memories,
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
        promise_records = []
        promise_error = None
        person_summary = None
        summary_error = None

        try:
            recap = generate_memory_recap(
                person=person,
                transcript=transcript,
                recent_memories=recent_memories,
                long_term_memories=long_term_memories,
                recorded_at=recorded_at,
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
                promise_record = create_promise_record(
                    person=person,
                    conversation=conversation,
                    memory=memory,
                    promise_data=recap.get('promise'),
                )

                if promise_record:
                    promise_records.append(promise_record)
            except (TypeError, ValueError) as exc:
                promise_error = str(exc)

            try:
                long_term_memory_candidates = extract_long_term_memories(
                    person=person,
                    transcript=transcript,
                    recent_memories=recent_memories,
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
                active_promises = get_active_promises_for_person(person)
                card = generate_person_display_summary(
                    person=person,
                    recent_memories=display_memories,
                    long_term_memories=display_long_term_memories,
                    active_promises=active_promises,
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
                    source_promise_ids=[
                        str(promise.id)
                        for promise in active_promises
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
        data['promises'] = PromiseSerializer(
            promise_records,
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

        if promise_error:
            data['promise_error'] = promise_error

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


class MemoryAlbumItemListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    def get(self, request, person_id):
        person = get_object_or_404(Person, pk=person_id)
        album_items = MemoryAlbumItem.objects.filter(person=person)
        serializer = MemoryAlbumItemSerializer(album_items, many=True)
        return Response(serializer.data)

    def post(self, request, person_id):
        person = get_object_or_404(Person, pk=person_id)
        serializer = MemoryAlbumItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(person=person)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class MemoryAlbumItemDetailView(APIView):
    def delete(self, request, person_id, item_id):
        person = get_object_or_404(Person, pk=person_id)
        album_item = get_object_or_404(
            MemoryAlbumItem,
            pk=item_id,
            person=person,
        )

        if album_item.photo:
            album_item.photo.delete(save=False)

        album_item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


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
