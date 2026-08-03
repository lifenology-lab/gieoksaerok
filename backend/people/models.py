import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Person(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='people',
    )
    name = models.CharField(max_length=80)
    relationship = models.CharField(max_length=80)
    face_descriptor = models.JSONField()

    class Meta:
        db_table = 'people'
        ordering = ['user', 'name', 'id']
        indexes = [
            models.Index(fields=['user', 'name'], name='person_user_name_idx'),
        ]

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
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='conversations',
    )
    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name='conversations',
    )
    transcript = models.TextField()
    speaker_segments = models.JSONField(default=list, blank=True)
    status = models.CharField(
        max_length=32,
        choices=STATUS_CHOICES,
        default=STATUS_RECORDED,
    )
    recorded_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'conversations'
        ordering = ['-recorded_at', '-created_at']
        indexes = [
            models.Index(
                fields=['user', '-recorded_at'],
                name='conversation_user_recent_idx',
            ),
        ]

    def __str__(self):
        return f'{self.person.name} conversation at {self.recorded_at:%Y-%m-%d %H:%M}'


class PatientVoiceProfile(TimeStampedModel):
    id = models.BigAutoField(primary_key=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='patient_voice_profile',
    )
    speaker_name = models.CharField(max_length=80, default='환자')
    audio_data = models.BinaryField()
    audio_content_type = models.CharField(max_length=100, default='audio/webm')
    audio_filename = models.CharField(max_length=160, blank=True, default='')

    class Meta:
        db_table = 'patient_voice_profiles'

    def __str__(self):
        return f'{self.speaker_name} voice profile'


class Memory(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='memories',
    )
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
        indexes = [
            models.Index(
                fields=['person', '-memory_at'],
                name='memory_person_recent_idx',
            ),
            models.Index(
                fields=['user', '-memory_at'],
                name='memory_user_recent_idx',
            ),
        ]

    def __str__(self):
        return f'{self.person.name} memory at {self.memory_at:%Y-%m-%d %H:%M}'


class Promise(TimeStampedModel):
    STATUS_ACTIVE = 'active'
    STATUS_EXPIRED = 'expired'
    STATUS_COMPLETED = 'completed'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_EXPIRED, 'Expired'),
        (STATUS_COMPLETED, 'Completed'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='promises',
    )
    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name='promises',
    )
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='promises',
    )
    memory = models.ForeignKey(
        Memory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='promises',
    )
    title = models.CharField(max_length=80)
    description = models.TextField()
    scheduled_at = models.DateTimeField(null=True, blank=True)
    scheduled_date = models.DateField(null=True, blank=True)
    time_label = models.CharField(max_length=80, blank=True, default='')
    timezone = models.CharField(max_length=64, default='Asia/Seoul')
    raw_text = models.TextField(blank=True, default='')
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
    )
    confidence = models.FloatField(default=0)

    class Meta:
        db_table = 'promises'
        ordering = ['scheduled_at', 'scheduled_date', 'created_at']
        indexes = [
            models.Index(
                fields=['person', 'status', 'scheduled_at'],
                name='promise_person_status_at_idx',
            ),
            models.Index(
                fields=['person', 'status', 'scheduled_date'],
                name='promise_person_status_date_idx',
            ),
            models.Index(
                fields=['user', 'status', 'scheduled_at'],
                name='promise_user_status_at_idx',
            ),
        ]

    def __str__(self):
        return f'{self.person.name} promise: {self.title}'


class MemoryAlbumItem(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='memory_album_items',
    )
    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name='memory_album_items',
    )
    photo = models.FileField(upload_to='memory_album_photos/')
    description = models.CharField(max_length=160)
    crop_x = models.FloatField(default=50)
    crop_y = models.FloatField(default=50)

    class Meta:
        db_table = 'memory_album_items'
        ordering = ['-created_at']
        indexes = [
            models.Index(
                fields=['person', '-created_at'],
                name='album_person_recent_idx',
            ),
            models.Index(
                fields=['user', '-created_at'],
                name='album_user_recent_idx',
            ),
        ]

    def __str__(self):
        return f'{self.person.name} album item: {self.description[:24]}'


class LongTermMemory(TimeStampedModel):
    CATEGORY_FAMILY = 'family'
    CATEGORY_BIRTH = 'birth'
    CATEGORY_MARRIAGE = 'marriage'
    CATEGORY_EDUCATION = 'education'
    CATEGORY_CAREER = 'career'
    CATEGORY_HEALTH = 'health'
    CATEGORY_DEATH = 'death'
    CATEGORY_RELATIONSHIP = 'relationship'
    CATEGORY_OTHER = 'other'

    CATEGORY_CHOICES = [
        (CATEGORY_FAMILY, 'Family'),
        (CATEGORY_BIRTH, 'Birth'),
        (CATEGORY_MARRIAGE, 'Marriage'),
        (CATEGORY_EDUCATION, 'Education'),
        (CATEGORY_CAREER, 'Career'),
        (CATEGORY_HEALTH, 'Health'),
        (CATEGORY_DEATH, 'Death'),
        (CATEGORY_RELATIONSHIP, 'Relationship'),
        (CATEGORY_OTHER, 'Other'),
    ]

    STATUS_SUGGESTED = 'suggested'
    STATUS_CONFIRMED = 'confirmed'
    STATUS_ARCHIVED = 'archived'

    STATUS_CHOICES = [
        (STATUS_SUGGESTED, 'Suggested'),
        (STATUS_CONFIRMED, 'Confirmed'),
        (STATUS_ARCHIVED, 'Archived'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='long_term_memories',
    )
    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name='long_term_memories',
    )
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='long_term_memories',
    )
    category = models.CharField(max_length=40, choices=CATEGORY_CHOICES)
    title = models.CharField(max_length=80)
    description = models.TextField()
    event_date = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_SUGGESTED,
    )
    confidence = models.FloatField(default=0)
    source_text = models.TextField(blank=True, default='')
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'long_term_memories'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['person', 'category'],
                name='unique_ltm_person_category',
            ),
        ]
        indexes = [
            models.Index(
                fields=['person', 'status', '-created_at'],
                name='ltm_person_status_recent_idx',
            ),
            models.Index(
                fields=['user', 'status', '-created_at'],
                name='ltm_user_status_recent_idx',
            ),
        ]

    def __str__(self):
        return f'{self.person.name} long-term memory: {self.title}'


class PersonSummary(TimeStampedModel):
    STATUS_ACTIVE = 'active'
    STATUS_STALE = 'stale'
    STATUS_FAILED = 'failed'

    STATUS_CHOICES = [
        (STATUS_ACTIVE, 'Active'),
        (STATUS_STALE, 'Stale'),
        (STATUS_FAILED, 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='summaries',
    )
    person = models.ForeignKey(
        Person,
        on_delete=models.CASCADE,
        related_name='summaries',
    )
    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='generated_summaries',
    )
    card = models.JSONField()
    source_memory_ids = models.JSONField(default=list, blank=True)
    source_long_term_memory_ids = models.JSONField(default=list, blank=True)
    source_promise_ids = models.JSONField(default=list, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
    )
    generated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'summaries'
        ordering = ['-generated_at', '-created_at']
        indexes = [
            models.Index(
                fields=['person', 'status', '-generated_at'],
                name='summary_person_status_idx',
            ),
            models.Index(
                fields=['user', 'status', '-generated_at'],
                name='summary_user_status_idx',
            ),
        ]

    def __str__(self):
        return f'{self.person.name} summary at {self.generated_at:%Y-%m-%d %H:%M}'
