from django.contrib import admin

from .models import PatientQuestionEvent


@admin.register(PatientQuestionEvent)
class PatientQuestionEventAdmin(admin.ModelAdmin):
    list_display = ('user', 'intent_type', 'input_method', 'occurred_at')
    list_filter = ('intent_type', 'input_method')
    search_fields = ('user__username', 'transcript')
