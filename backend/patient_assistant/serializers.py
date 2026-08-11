from rest_framework import serializers

from .models import PatientQuestionEvent


class PatientQuestionEventSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source='user.id', read_only=True)

    class Meta:
        model = PatientQuestionEvent
        fields = [
            'id',
            'user_id',
            'transcript',
            'input_method',
            'intent_type',
            'response_summary',
            'occurred_at',
            'created_at',
        ]
        read_only_fields = ['id', 'user_id', 'created_at']
