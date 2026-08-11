from django.conf import settings
from django.db import models


class PatientQuestionEvent(models.Model):
    INPUT_METHOD_TEXT = 'text'
    INPUT_METHOD_VOICE = 'voice'
    INPUT_METHOD_CHOICES = [
        (INPUT_METHOD_TEXT, 'Text'),
        (INPUT_METHOD_VOICE, 'Voice'),
    ]

    INTENT_MEAL = 'meal'
    INTENT_PERSON = 'person'
    INTENT_TIME = 'time'
    INTENT_WAY_HOME = 'way_home'
    INTENT_SCHEDULE = 'schedule'
    INTENT_PLACE = 'place'
    INTENT_UNKNOWN = 'unknown'
    INTENT_TYPE_CHOICES = [
        (INTENT_MEAL, 'Meal'),
        (INTENT_PERSON, 'Person'),
        (INTENT_TIME, 'Time'),
        (INTENT_WAY_HOME, 'Way Home'),
        (INTENT_SCHEDULE, 'Schedule'),
        (INTENT_PLACE, 'Place'),
        (INTENT_UNKNOWN, 'Unknown'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='patient_question_events',
    )
    transcript = models.TextField()
    input_method = models.CharField(max_length=10, choices=INPUT_METHOD_CHOICES)
    intent_type = models.CharField(max_length=30, choices=INTENT_TYPE_CHOICES)
    response_summary = models.TextField()
    occurred_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-occurred_at', '-created_at']

    def __str__(self):
        return f'{self.user_id} - {self.intent_type} - {self.occurred_at}'
