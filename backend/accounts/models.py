from django.contrib.auth.models import AbstractUser
from django.conf import settings
from django.db import models
from django.utils import timezone

class User(AbstractUser):
  name = models.CharField(max_length=100, blank=True)

  def __str__(self):
    return self.username


class DemoExperienceSession(models.Model):
  MODE_REAR_CAMERA = 'rear-camera'
  MODE_EXAMPLE_SCENES = 'example-scenes'
  MODE_CHOICES = [
    (MODE_REAR_CAMERA, 'Rear camera'),
    (MODE_EXAMPLE_SCENES, 'Example scenes'),
  ]

  template_user = models.ForeignKey(
    settings.AUTH_USER_MODEL,
    on_delete=models.PROTECT,
    related_name='demo_template_sessions',
  )
  session_user = models.OneToOneField(
    settings.AUTH_USER_MODEL,
    on_delete=models.CASCADE,
    related_name='demo_experience_session',
  )
  mode = models.CharField(
    max_length=32,
    choices=MODE_CHOICES,
    default=MODE_REAR_CAMERA,
  )
  created_at = models.DateTimeField(auto_now_add=True)
  expires_at = models.DateTimeField()
  last_accessed_at = models.DateTimeField(default=timezone.now)

  class Meta:
    indexes = [
      models.Index(fields=['expires_at'], name='demo_session_expiry_idx'),
      models.Index(fields=['template_user', 'created_at'], name='demo_template_created_idx'),
    ]

  @property
  def is_expired(self):
    return self.expires_at <= timezone.now()
