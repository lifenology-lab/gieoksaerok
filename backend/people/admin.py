from django.contrib import admin

from .models import Person


@admin.register(Person)
class PersonAdmin(admin.ModelAdmin):
    list_display = ('name', 'relationship', 'updated_at')
    search_fields = ('name', 'relationship')
