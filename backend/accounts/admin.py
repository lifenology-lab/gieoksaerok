from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User

@admin.register(User)
class CustomUserAdmin(UserAdmin):
  fieldsets = UserAdmin.fieldsets + (
    ("Additional info", {"fields": ("name",)}),
  )
  add_fieldsets = UserAdmin.fieldsets + (
    ("Additional Info:", {"fields": ("name",)}),
  )

# dbadmin
# 1234