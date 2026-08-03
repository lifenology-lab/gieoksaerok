from django.contrib import admin

from .models import (
    Conversation,
    LongTermMemory,
    Memory,
    MemoryAlbumItem,
    PatientVoiceProfile,
    Person,
    PersonSummary,
    Promise,
)


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ('user', 'name', 'relationship', 'updated_at')
    list_filter = ('user',)
    search_fields = ('user__username', 'user__name', 'name', 'relationship')
    fields = ('user', 'name', 'relationship', 'face_descriptor')


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('user', 'person', 'status', 'recorded_at', 'updated_at')
    list_filter = ('user', 'status', 'recorded_at')
    search_fields = (
        'user__username',
        'user__name',
        'person__name',
        'person__relationship',
        'transcript',
    )


@admin.register(Memory)
class MemoryAdmin(admin.ModelAdmin):
    list_display = ('user', 'person', 'conversation', 'memory_at', 'verified_at')
    list_filter = ('user', 'memory_at', 'verified_at')
    search_fields = ('user__username', 'user__name', 'person__name', 'person__relationship')


@admin.register(MemoryAlbumItem)
class MemoryAlbumItemAdmin(admin.ModelAdmin):
    list_display = ('user', 'person', 'description', 'created_at')
    list_filter = ('user',)
    search_fields = ('user__username', 'user__name', 'person__name', 'person__relationship', 'description')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(LongTermMemory)
class LongTermMemoryAdmin(admin.ModelAdmin):
    list_display = ('user', 'person', 'category', 'title', 'status', 'confidence', 'updated_at')
    list_filter = ('user', 'category', 'status', 'verified_at')
    search_fields = ('user__username', 'user__name', 'person__name', 'person__relationship', 'title', 'description')


@admin.register(PersonSummary)
class PersonSummaryAdmin(admin.ModelAdmin):
    list_display = ('user', 'person', 'status', 'generated_at', 'updated_at')
    list_filter = ('user', 'status', 'generated_at')
    search_fields = ('user__username', 'user__name', 'person__name', 'person__relationship')


@admin.register(Promise)
class PromiseAdmin(admin.ModelAdmin):
    list_display = ('user', 'person', 'title', 'status', 'scheduled_at', 'scheduled_date')
    list_filter = ('user', 'status', 'scheduled_at', 'scheduled_date')
    search_fields = ('user__username', 'user__name', 'person__name', 'person__relationship', 'title', 'description')


@admin.register(PatientVoiceProfile)
class PatientVoiceProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'speaker_name', 'audio_content_type', 'updated_at')
    list_filter = ('user',)
    readonly_fields = ('created_at', 'updated_at')
