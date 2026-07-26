import uuid

from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Person(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=80)
    relationship = models.CharField(max_length=80)
    face_descriptor = models.JSONField()

    class Meta:
        db_table = 'people'
        ordering = ['name', 'id']

    def __str__(self):
        return f'{self.name} ({self.relationship})'


class Conversation(TimeStampedModel):
    STATUS_RECORDED = 'recorded'
    STATUS_SUMMARIZED = 'summarized'
    STATUS_FAILED = 'failed'

    STATUS_CHOICES = [
        (STATUS_RECORDED, 'Recorded'),
        (STATUS_SUMMARIZED, 'Summarized'),
        (STATUS_FAILED, 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name='conversations',
    )
    transcript = models.TextField()
    status = models.CharField(
        max_length=32,
        choices=STATUS_CHOICES,
        default=STATUS_RECORDED,
    )
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'conversations'
        ordering = ['-recorded_at', '-created_at']

    def __str__(self):
        return f'{self.person.name} conversation at {self.recorded_at:%Y-%m-%d %H:%M}'


class Memory(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name='memories',
    )
    conversation = models.OneToOneField(
        Conversation,
        on_delete=models.CASCADE,
        related_name='memory',
    )
    recap = models.JSONField()
    memory_at = models.DateTimeField(default=timezone.now)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'memories'
        ordering = ['-memory_at', '-created_at']

    def __str__(self):
        return f'{self.person.name} memory at {self.memory_at:%Y-%m-%d %H:%M}'
