import math

from rest_framework import serializers

from .display_summary import select_face_card_body
from .models import (
    Conversation,
    LongTermMemory,
    Memory,
    MemoryAlbumItem,
    Person,
    PersonSummary,
    Promise,
)
from .promise_utils import (
    format_person_summary_promise_display,
    format_promise_display,
    promise_sort_key,
)


MAX_MEMORY_ALBUM_PHOTO_BYTES = 10 * 1024 * 1024
ALLOWED_MEMORY_ALBUM_IMAGE_TYPES = {
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
}


class MemorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Memory
        fields = [
            'id',
            'user',
            'person',
            'conversation',
            'recap',
            'memory_at',
            'verified_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def validate(self, attrs):
        person = attrs.get('person') or getattr(self.instance, 'person', None)
        conversation = attrs.get('conversation') or getattr(
            self.instance,
            'conversation',
            None,
        )

        if person and conversation and conversation.person_id != person.id:
            raise serializers.ValidationError(
                'memory의 person과 conversation의 person이 같아야 합니다.',
            )

        user = attrs.get('user') or getattr(self.instance, 'user', None)

        if user and person and person.user_id != user.id:
            raise serializers.ValidationError(
                'memory의 user와 person의 user가 같아야 합니다.',
            )

        if user and conversation and conversation.user_id != user.id:
            raise serializers.ValidationError(
                'memory의 user와 conversation의 user가 같아야 합니다.',
            )

        return attrs


class MemoryAlbumItemSerializer(serializers.ModelSerializer):
    photo = serializers.FileField(write_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = MemoryAlbumItem
        fields = [
            'id',
            'user',
            'person',
            'photo',
            'photo_url',
            'description',
            'crop_x',
            'crop_y',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'person',
            'user',
            'photo_url',
            'created_at',
            'updated_at',
        ]

    def get_photo_url(self, obj):
        if not obj.photo:
            return None

        return obj.photo.url

    def validate_photo(self, value):
        content_type = getattr(value, 'content_type', '')

        if content_type not in ALLOWED_MEMORY_ALBUM_IMAGE_TYPES:
            raise serializers.ValidationError(
                'jpg, png, webp, gif 형식의 사진만 등록할 수 있습니다.',
            )

        if value.size > MAX_MEMORY_ALBUM_PHOTO_BYTES:
            raise serializers.ValidationError('사진은 10MB 이하로 등록해주세요.')

        return value

    def validate_description(self, value):
        description = value.strip()

        if not description:
            raise serializers.ValidationError('짧은 설명을 입력해주세요.')

        return description

    def validate_crop_x(self, value):
        return self.validate_crop_percent(value, 'crop_x')

    def validate_crop_y(self, value):
        return self.validate_crop_percent(value, 'crop_y')

    def validate_crop_percent(self, value, field_name):
        if value < 0 or value > 100:
            raise serializers.ValidationError(
                f'{field_name}는 0 이상 100 이하의 값이어야 합니다.',
            )

        return value


class LongTermMemorySerializer(serializers.ModelSerializer):
    class Meta:
        model = LongTermMemory
        fields = [
            'id',
            'user',
            'person',
            'conversation',
            'category',
            'title',
            'description',
            'event_date',
            'status',
            'confidence',
            'source_text',
            'verified_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']


class PersonSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonSummary
        fields = [
            'id',
            'user',
            'person',
            'conversation',
            'card',
            'source_memory_ids',
            'source_long_term_memory_ids',
            'source_promise_ids',
            'status',
            'generated_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']


class PromiseSerializer(serializers.ModelSerializer):
    display_text = serializers.SerializerMethodField()

    class Meta:
        model = Promise
        fields = [
            'id',
            'user',
            'person',
            'conversation',
            'memory',
            'title',
            'description',
            'scheduled_at',
            'scheduled_date',
            'time_label',
            'timezone',
            'raw_text',
            'status',
            'confidence',
            'display_text',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'user',
            'display_text',
            'created_at',
            'updated_at',
        ]

    def get_display_text(self, obj):
        return format_promise_display(obj)


class PersonSerializer(serializers.ModelSerializer):
    initial_memory = serializers.CharField(
        required=False,
        allow_blank=True,
        trim_whitespace=True,
        write_only=True,
    )
    latest_memory = serializers.SerializerMethodField()
    latest_summary = serializers.SerializerMethodField()
    latest_promise = serializers.SerializerMethodField()

    class Meta:
        model = Person
        fields = [
            'id',
            'user',
            'name',
            'relationship',
            'initial_memory',
            'face_descriptor',
            'latest_memory',
            'latest_summary',
            'latest_promise',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'user',
            'latest_memory',
            'latest_summary',
            'latest_promise',
            'created_at',
            'updated_at',
        ]

    def create(self, validated_data):
        validated_data.pop('initial_memory', None)
        return super().create(validated_data)

    def get_latest_memory(self, obj):
        memory = self._get_latest_memory_obj(obj)

        if not memory:
            return None

        return MemorySerializer(memory).data

    def get_latest_summary(self, obj):
        prefetched_summaries = getattr(obj, 'prefetched_latest_summaries', None)

        if prefetched_summaries is not None:
            summary = prefetched_summaries[0] if prefetched_summaries else None
        else:
            summary = (
                obj.summaries.filter(status=PersonSummary.STATUS_ACTIVE)
                .order_by('-generated_at', '-created_at')
                .first()
            )

        if not summary:
            return None

        data = PersonSummarySerializer(summary).data
        latest_memory = self._get_latest_memory_obj(obj)
        active_promise = self._get_latest_active_promise(obj)
        card = dict(data.get('card') or {})
        recap = latest_memory.recap if latest_memory else {}

        if not isinstance(recap, dict):
            recap = {}

        card['title'] = (
            recap.get('title')
            or recap.get('headline')
            or card.get('title')
            or ''
        )
        card['body'] = select_face_card_body(
            recap,
            promise=active_promise,
            person=obj,
            fallback=card.get('body') or '',
        )
        card.pop('suggested_question', None)
        card['upcoming_promise'] = (
            format_person_summary_promise_display(active_promise, person=obj)
            if active_promise
            else None
        )
        data['card'] = card
        return data

    def get_latest_promise(self, obj):
        active_promise = self._get_latest_active_promise(obj)

        if not active_promise:
            return None

        return PromiseSerializer(active_promise).data

    def _get_latest_memory_obj(self, obj):
        prefetched_memories = getattr(obj, 'prefetched_latest_memories', None)

        if prefetched_memories is not None:
            return prefetched_memories[0] if prefetched_memories else None

        return obj.memories.order_by('-memory_at', '-created_at').first()

    def _get_latest_active_promise(self, obj):
        prefetched_promises = getattr(obj, 'prefetched_active_promises', None)

        if prefetched_promises is not None:
            sorted_promises = sorted(prefetched_promises, key=promise_sort_key)
            return sorted_promises[0] if sorted_promises else None

        active_promises = list(
            obj.promises.filter(status=Promise.STATUS_ACTIVE),
        )
        sorted_promises = sorted(active_promises, key=promise_sort_key)
        return sorted_promises[0] if sorted_promises else None

    def validate_face_descriptor(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError('face_descriptor는 숫자 배열이어야 합니다.')

        if len(value) != 128:
            raise serializers.ValidationError('face_descriptor는 128개의 숫자가 필요합니다.')

        try:
            normalized_value = [float(item) for item in value]
        except (TypeError, ValueError) as exc:
            raise serializers.ValidationError(
                'face_descriptor에는 숫자만 포함할 수 있습니다.',
            ) from exc

        if not all(math.isfinite(item) for item in normalized_value):
            raise serializers.ValidationError(
                'face_descriptor에는 유효한 숫자만 포함할 수 있습니다.',
            )

        return normalized_value


class ConversationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Conversation
        fields = [
            'id',
            'user',
            'person',
            'transcript',
            'speaker_segments',
            'status',
            'recorded_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def validate(self, attrs):
        user = attrs.get('user') or getattr(self.instance, 'user', None)
        person = attrs.get('person') or getattr(self.instance, 'person', None)

        if user and person and person.user_id != user.id:
            raise serializers.ValidationError(
                'conversation의 user와 person의 user가 같아야 합니다.',
            )

        return attrs
