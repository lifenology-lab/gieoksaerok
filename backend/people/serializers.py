import math

from rest_framework import serializers

from .models import Person


class PersonSerializer(serializers.ModelSerializer):
    class Meta:
        model = Person
        fields = [
            'id',
            'name',
            'relationship',
            'face_descriptor',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

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
