from django.contrib import admin

from .models import Conversation, Memory, Person


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ('name', 'relationship', 'updated_at')
    search_fields = ('name', 'relationship')


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
