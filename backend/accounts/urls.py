from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import SignInView, SignOutView, SignUpView, MeView

urlpatterns = [
  path("signup/", SignUpView.as_view()),
  path("login/", SignInView.as_view()),
  path("token/refresh/", TokenRefreshView.as_view()),
  path("me/", MeView.as_view()),
  path("logout/", SignOutView.as_view()),
]
