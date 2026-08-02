from django.urls import path

from .views import (
    ConversationListCreateView,
    ConversationTranscriptionCreateView,
    MemoryAlbumItemDetailView,
    MemoryAlbumItemListCreateView,
    MemoryListCreateView,
    PatientVoiceProfileView,
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
    path(
        'people/<uuid:person_id>/memory-album/',
        MemoryAlbumItemListCreateView.as_view(),
        name='memory-album-item-list-create',
    ),
    path(
        'people/<uuid:person_id>/memory-album/<uuid:item_id>/',
        MemoryAlbumItemDetailView.as_view(),
        name='memory-album-item-detail',
    ),
    path(
        'patient-voice/',
        PatientVoiceProfileView.as_view(),
        name='patient-voice-profile',
    ),
    path('people/', PersonListCreateView.as_view(), name='person-list-create'),
]
