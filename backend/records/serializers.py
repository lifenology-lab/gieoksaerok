from rest_framework import serializers

from .models import ConfusionEvent, MealContextEvent, MealRecord


class MealRecordSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)

    class Meta:
        model = MealRecord
        fields = [
            "id",
            "user_id",
            "meal_type",
            "eaten_at",
            "menu",
            "memo",
            "scene_image",
            "source",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user_id", "created_at", "updated_at"]

    def validate_scene_image(self, image):
        if image and image.size > 3 * 1024 * 1024:
            raise serializers.ValidationError(
                "식사 사진은 3MB 이하로 올려주세요."
            )

        return image


class MealContextEventSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    recent_meal_record_id = serializers.PrimaryKeyRelatedField(
        source="recent_meal_record",
        queryset=MealRecord.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = MealContextEvent
        fields = [
            "id",
            "user_id",
            "recent_meal_record_id",
            "detected_at",
            "is_meal_scene",
            "meal_scene_probability",
            "context_result",
            "user_action",
            "created_at",
        ]
        read_only_fields = ["id", "user_id", "created_at"]

    def validate_recent_meal_record_id(self, recent_meal_record):
        if recent_meal_record is None:
            return recent_meal_record

        request = self.context.get("request")

        if request and recent_meal_record.user != request.user:
            raise serializers.ValidationError(
                "현재 사용자의 식사 기록만 연결할 수 있습니다."
            )

        return recent_meal_record

    def validate_meal_scene_probability(self, value):
        if value is None:
            return value

        if value < 0 or value > 1:
            raise serializers.ValidationError(
                "meal_scene_probability는 0 이상 1 이하의 값이어야 합니다."
            )

        return value


class ConfusionEventSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)

    class Meta:
        model = ConfusionEvent
        fields = [
            "id",
            "user_id",
            "confusion_type",
            "occurred_at",
            "created_at",
        ]
        read_only_fields = ["id", "user_id", "created_at"]
