from django.urls import path

from .views import (
    PatientQuestionClassificationView,
    PatientQuestionEventView,
    PatientQuestionScheduleContextView,
    PatientQuestionTranscriptionView,
    PatientMemoryScheduleView,
)


urlpatterns = [
    path(
        'patient-questions/classify/',
        PatientQuestionClassificationView.as_view(),
        name='patient-question-classification',
    ),
    path(
        'patient-questions/',
        PatientQuestionEventView.as_view(),
        name='patient-question-events',
    ),
    path(
        'patient-questions/transcribe/',
        PatientQuestionTranscriptionView.as_view(),
        name='patient-question-transcription',
    ),
    path(
        'patient-questions/schedules/',
        PatientQuestionScheduleContextView.as_view(),
        name='patient-question-schedule-context',
    ),
    path(
        'patient-memory/schedules/',
        PatientMemoryScheduleView.as_view(),
        name='patient-memory-schedules',
    ),
]
