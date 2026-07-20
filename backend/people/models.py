from django.db import models


class Person(models.Model):
    name = models.CharField(max_length=80)
    relationship = models.CharField(max_length=80)
    face_descriptor = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name', 'id']

    def __str__(self):
        return f'{self.name} ({self.relationship})'
