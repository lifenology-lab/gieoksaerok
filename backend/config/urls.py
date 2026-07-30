from django.contrib import admin
from django.urls import path, include

app_name = 'account'
urlpatterns = [
    path('admin/', admin.site.urls),
    path("api/auth/", include("accounts.urls")),
]
