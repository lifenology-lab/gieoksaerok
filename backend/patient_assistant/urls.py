from django.urls import path

from .views import (
    PatientQuestionClassificationView,
    PatientQuestionEventView,
    PatientQuestionScheduleContextView,
    PatientQuestionTranscriptionView,
    PatientMemoryScheduleView,
    MemoryReflectionAudioView,
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
    path(
        'patient-memory/reflections/audio/',
        MemoryReflectionAudioView.as_view(),
        name='memory-reflection-audio',
    ),
]
