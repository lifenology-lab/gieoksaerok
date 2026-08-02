from django.urls import path

from .views import ConfusionEventView, MealContextEventView, MealRecordView

urlpatterns = [
    path("meal-records/", MealRecordView.as_view(), name="meal-records"),
    path(
        "meal-context-events/",
        MealContextEventView.as_view(),
        name="meal-context-events",
    ),
    path("confusion-events/", ConfusionEventView.as_view(), name="confusion-events"),
]