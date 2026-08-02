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
    list_display = ('name', 'relationship', 'updated_at')
    search_fields = ('name', 'relationship')
    fields = ('name', 'relationship', 'face_descriptor')


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('person', 'status', 'recorded_at', 'updated_at')
    list_filter = ('status', 'recorded_at')
    search_fields = ('person__name', 'person__relationship', 'transcript')


@admin.register(Memory)
class MemoryAdmin(admin.ModelAdmin):
    list_display = ('person', 'conversation', 'memory_at', 'verified_at')
    list_filter = ('memory_at', 'verified_at')
    search_fields = ('person__name', 'person__relationship')


@admin.register(MemoryAlbumItem)
class MemoryAlbumItemAdmin(admin.ModelAdmin):
    list_display = ('person', 'description', 'created_at')
    search_fields = ('person__name', 'person__relationship', 'description')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(LongTermMemory)
class LongTermMemoryAdmin(admin.ModelAdmin):
    list_display = ('person', 'category', 'title', 'status', 'confidence', 'updated_at')
    list_filter = ('category', 'status', 'verified_at')
    search_fields = ('person__name', 'person__relationship', 'title', 'description')


@admin.register(PersonSummary)
class PersonSummaryAdmin(admin.ModelAdmin):
    list_display = ('person', 'status', 'generated_at', 'updated_at')
    list_filter = ('status', 'generated_at')
    search_fields = ('person__name', 'person__relationship')


@admin.register(Promise)
class PromiseAdmin(admin.ModelAdmin):
    list_display = ('person', 'title', 'status', 'scheduled_at', 'scheduled_date')
    list_filter = ('status', 'scheduled_at', 'scheduled_date')
    search_fields = ('person__name', 'person__relationship', 'title', 'description')


@admin.register(PatientVoiceProfile)
class PatientVoiceProfileAdmin(admin.ModelAdmin):
    list_display = ('speaker_name', 'audio_content_type', 'updated_at')
    readonly_fields = ('created_at', 'updated_at')
