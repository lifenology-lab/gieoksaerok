from django.conf import settings
from django.db import models


class MealRecord(models.Model):
    MEAL_TYPE_CHOICES = [
        ("breakfast", "Breakfast"),
        ("lunch", "Lunch"),
        ("dinner", "Dinner"),
        ("snack", "Snack"),
        ("unknown", "Unknown"),
    ]

    SOURCE_CHOICES = [
        ("patient_confirmed", "Patient Confirmed"),
        ("caregiver_recorded", "Caregiver Recorded"),
        ("system_suggested", "System Suggested"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="meal_records",
    )
    meal_type = models.CharField(max_length=20, choices=MEAL_TYPE_CHOICES)
    eaten_at = models.DateTimeField()
    menu = models.CharField(max_length=255, blank=True, null=True)
    memo = models.TextField(blank=True, null=True)
    source = models.CharField(max_length=30, choices=SOURCE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-eaten_at", "-created_at"]

    def __str__(self):
        return f"{self.user_id} - {self.meal_type} - {self.eaten_at}"


class MealContextEvent(models.Model):
    CONTEXT_RESULT_CHOICES = [
        ("non_meal_scene", "Non Meal Scene"),
        ("meal_notice_suppressed", "Meal Notice Suppressed"),
        ("recent_meal_found", "Recent Meal Found"),
        ("meal_detected_without_record", "Meal Detected Without Record"),
    ]

    USER_ACTION_CHOICES = [
        ("none", "None"),
        ("view_record", "View Record"),
        ("create_record", "Create Record"),
        ("dismiss", "Dismiss"),
        ("confirm", "Confirm"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="meal_context_events",
    )
    recent_meal_record = models.ForeignKey(
        MealRecord,
        on_delete=models.SET_NULL,
        related_name="context_events",
        blank=True,
        null=True,
    )
    detected_at = models.DateTimeField()
    is_meal_scene = models.BooleanField(blank=True, null=True)
    meal_scene_probability = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        blank=True,
        null=True,
    )
    context_result = models.CharField(
        max_length=50,
        choices=CONTEXT_RESULT_CHOICES,
    )
    user_action = models.CharField(
        max_length=50,
        choices=USER_ACTION_CHOICES,
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-detected_at", "-created_at"]

    def __str__(self):
        return f"{self.user_id} - {self.context_result} - {self.detected_at}"


class ConfusionEvent(models.Model):
    CONFUSION_TYPE_CHOICES = [
        ("person", "Person"),
        ("place", "Place"),
        ("time", "Time"),
        ("task", "Task"),
        ("meal", "Meal"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="confusion_events",
    )
    confusion_type = models.CharField(
        max_length=30,
        choices=CONFUSION_TYPE_CHOICES,
    )
    occurred_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-occurred_at", "-created_at"]

    def __str__(self):
        return f"{self.user_id} - {self.confusion_type} - {self.occurred_at}"