from django.urls import path

from .views import PatientQuestionEventView, PatientQuestionTranscriptionView


urlpatterns = [
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
]
