from datetime import datetime, timezone
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse

from .models import Conversation, Memory, Person
from .services import OpenAIMemorySummaryError


def face_descriptor():
    return [0.01] * 128


class ConversationTranscriptionCreateViewTests(TestCase):
    def setUp(self):
        self.person = Person.objects.create(
            name='지훈',
            relationship='아들',
            face_descriptor=face_descriptor(),
        )

    @mock.patch('people.views.generate_memory_recap')
    @mock.patch('people.views.transcribe_audio_file')
    def test_transcription_creates_conversation_and_memory(
        self,
        mock_transcribe_audio_file,
        mock_generate_memory_recap,
    ):
        mock_transcribe_audio_file.return_value = '오늘 병원 예약에 대해 이야기했다.'
        mock_generate_memory_recap.return_value = {
            'title': '병원 예약',
            'summary': '아들 지훈과 병원 예약 시간을 확인했습니다.',
            'upcoming_promise': '내일 오전 병원에 가기',
            'key_points': ['내일 오전 병원에 가기로 함'],
        }
        audio = SimpleUploadedFile(
            'conversation.webm',
            b'audio-bytes',
            content_type='audio/webm',
        )

        response = self.client.post(
            reverse('conversation-transcription-create'),
            {
                'person': str(self.person.id),
                'audio': audio,
            },
        )

        self.assertEqual(response.status_code, 201)

        conversation = Conversation.objects.get(person=self.person)
        memory = Memory.objects.get(conversation=conversation)

        self.assertEqual(conversation.status, Conversation.STATUS_SUMMARIZED)
        self.assertEqual(conversation.transcript, mock_transcribe_audio_file.return_value)
        self.assertEqual(memory.recap['title'], '병원 예약')
        self.assertEqual(response.json()['memory']['recap']['title'], '병원 예약')

        prompt = mock_transcribe_audio_file.call_args.kwargs['prompt']
        self.assertIn(self.person.name, prompt)
        self.assertIn(self.person.relationship, prompt)

    @mock.patch('people.views.generate_memory_recap')
    @mock.patch('people.views.transcribe_audio_file')
    def test_transcription_keeps_conversation_when_summary_fails(
        self,
        mock_transcribe_audio_file,
        mock_generate_memory_recap,
    ):
        mock_transcribe_audio_file.return_value = '요약 실패 상황에서도 전사는 저장된다.'
        mock_generate_memory_recap.side_effect = OpenAIMemorySummaryError(
            '요약에 실패했습니다.',
        )
        audio = SimpleUploadedFile(
            'conversation.webm',
            b'audio-bytes',
            content_type='audio/webm',
        )

        response = self.client.post(
            reverse('conversation-transcription-create'),
            {
                'person': str(self.person.id),
                'audio': audio,
            },
        )

        self.assertEqual(response.status_code, 201)

        conversation = Conversation.objects.get(person=self.person)

        self.assertEqual(conversation.status, Conversation.STATUS_FAILED)
        self.assertEqual(Memory.objects.count(), 0)
        self.assertEqual(response.json()['memory'], None)
        self.assertIn('memory_error', response.json())


class PersonListCreateViewTests(TestCase):
    def test_people_response_includes_latest_memory(self):
        person = Person.objects.create(
            name='민서',
            relationship='손녀',
            face_descriptor=face_descriptor(),
        )
        older_conversation = Conversation.objects.create(
            person=person,
            transcript='오래된 대화',
        )
        newer_conversation = Conversation.objects.create(
            person=person,
            transcript='최근 대화',
        )
        Memory.objects.create(
            person=person,
            conversation=older_conversation,
            recap={
                'title': '오래된 기억',
                'summary': '오래된 요약',
                'upcoming_promise': None,
                'key_points': [],
            },
            memory_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        Memory.objects.create(
            person=person,
            conversation=newer_conversation,
            recap={
                'title': '최근 기억',
                'summary': '최근 요약',
                'upcoming_promise': '오늘 저녁 식사',
                'key_points': ['최근 내용'],
            },
            memory_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        )

        response = self.client.get(reverse('person-list-create'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()[0]['latest_memory']['recap']['title'],
            '최근 기억',
        )
