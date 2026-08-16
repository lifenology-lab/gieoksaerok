from django.urls import path

from .views import (
    PatientQuestionClassificationView,
    PatientAnswerSpeechView,
    PatientQuestionEventView,
    PatientQuestionScheduleContextView,
    PatientQuestionTranscriptionView,
    PatientMemoryScheduleView,
    MemoryReflectionAudioView,
    MemoryReflectionTextView,
)


urlpatterns = [
    path(
        'patient-answers/speech/',
        PatientAnswerSpeechView.as_view(),
        name='patient-answer-speech',
    ),
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
    path(
        'patient-memory/reflections/text/',
        MemoryReflectionTextView.as_view(),
        name='memory-reflection-text',
    ),
]
