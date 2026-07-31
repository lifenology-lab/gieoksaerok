from rest_framework import serializers

# Request validation
class SignUpRequestSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)
    name = serializers.CharField(max_length=100, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)

class TokenRefreshRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField()