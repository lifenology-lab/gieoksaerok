from django.urls import path

from .views import PersonListCreateView


urlpatterns = [
    path('people/', PersonListCreateView.as_view(), name='person-list-create'),
]
