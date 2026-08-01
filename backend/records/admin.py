from django.contrib import admin

from .models import ConfusionEvent, MealContextEvent, MealRecord


@admin.register(MealRecord)
class MealRecordAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "meal_type", "eaten_at", "source", "created_at")
    list_filter = ("meal_type", "source")
    search_fields = ("user__username", "menu", "memo")


@admin.register(MealContextEvent)
class MealContextEventAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "user",
        "context_result",
        "user_action",
        "is_meal_scene",
        "meal_scene_probability",
        "detected_at",
    )
    list_filter = ("context_result", "user_action", "is_meal_scene")
    search_fields = ("user__username",)


@admin.register(ConfusionEvent)
class ConfusionEventAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "confusion_type", "occurred_at", "created_at")
    list_filter = ("confusion_type",)
    search_fields = ("user__username",)