from django.urls import path

from .views import (
    ConfusionEventView, 
    MealContextEventView, 
    MealRecordSceneImageView,
    MealRecordView,
    RecentMealRecordView,
)

urlpatterns = [
    path("meal-records/", MealRecordView.as_view(), name="meal-records"),
    path(
        "meal-records/<int:meal_record_id>/scene-image/",
        MealRecordSceneImageView.as_view(),
        name="meal-record-scene-image",
    ),
    path(
        "meal-records/recent/", 
        RecentMealRecordView.as_view(),
        name="recent-meal-records",
    ),
    path(
        "meal-context-events/",
        MealContextEventView.as_view(),
        name="meal-context-events",
    ),
    path("confusion-events/", ConfusionEventView.as_view(), name="confusion-events"),
]
