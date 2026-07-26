from django.urls import path

from .views import (
    ConversationListCreateView,
    ConversationTranscriptionCreateView,
    MemoryListCreateView,
    PersonListCreateView,
)


urlpatterns = [
    path(
        'conversations/',
        ConversationListCreateView.as_view(),
        name='conversation-list-create',
    ),
    path(
        'conversations/transcribe/',
        ConversationTranscriptionCreateView.as_view(),
        name='conversation-transcription-create',
    ),
    path('memories/', MemoryListCreateView.as_view(), name='memory-list-create'),
    path('people/', PersonListCreateView.as_view(), name='person-list-create'),
]
