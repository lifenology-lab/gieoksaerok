import math

from rest_framework import serializers

from .models import Conversation, LongTermMemory, Memory, Person, PersonSummary


class MemorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Memory
        fields = [
            'id',
            'person',
            'conversation',
            'recap',
            'memory_at',
            'verified_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

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

        return attrs


class LongTermMemorySerializer(serializers.ModelSerializer):
    class Meta:
        model = LongTermMemory
        fields = [
            'id',
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
        read_only_fields = ['id', 'created_at', 'updated_at']


class PersonSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = PersonSummary
        fields = [
            'id',
            'person',
            'conversation',
            'card',
            'source_memory_ids',
            'source_long_term_memory_ids',
            'status',
            'generated_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class PersonSerializer(serializers.ModelSerializer):
    latest_memory = serializers.SerializerMethodField()
    latest_summary = serializers.SerializerMethodField()

    class Meta:
        model = Person
        fields = [
            'id',
            'name',
            'relationship',
            'core_memory',
            'face_descriptor',
            'latest_memory',
            'latest_summary',
            'created_at',
            'updated_at',
        ]
        read_only_fields = [
            'id',
            'latest_memory',
            'latest_summary',
            'created_at',
            'updated_at',
        ]

    def get_latest_memory(self, obj):
        prefetched_memories = getattr(obj, 'prefetched_latest_memories', None)

        if prefetched_memories is not None:
            memory = prefetched_memories[0] if prefetched_memories else None
        else:
            memory = obj.memories.order_by('-memory_at', '-created_at').first()

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

        return PersonSummarySerializer(summary).data

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
            'person',
            'transcript',
            'speaker_segments',
            'status',
            'recorded_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
