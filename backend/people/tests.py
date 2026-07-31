import json
from datetime import datetime, timezone
from unittest import mock

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse

from .models import Conversation, Memory, PatientVoiceProfile, Person
from .services import (
    OpenAIMemorySummaryError,
    TranscriptionResult,
    transcribe_audio_file,
)


def face_descriptor():
    return [0.01] * 128


class TranscribeAudioFileTests(TestCase):
    @override_settings(
        OPENAI_TRANSCRIPTION_DIARIZATION_ENABLED=True,
        OPENAI_TRANSCRIPTION_DIARIZATION_MODEL='gpt-4o-transcribe-diarize',
        OPENAI_TRANSCRIPTION_LANGUAGE='ko',
    )
    @mock.patch('people.services._get_openai_client')
    def test_transcribe_audio_file_uses_patient_voice_diarization(
        self,
        mock_get_openai_client,
    ):
        person = Person.objects.create(
            name='지훈',
            relationship='아들',
            face_descriptor=face_descriptor(),
        )
        voice_profile = PatientVoiceProfile.objects.create(
            audio_data=b'patient-voice',
            audio_content_type='audio/webm',
        )
        fake_client = mock.Mock()
        fake_client.audio.transcriptions.create.return_value = {
            'text': '환자: 오늘 병원 가니?\nA: 내일 같이 가요.',
            'segments': [
                {
                    'id': 'seg_1',
                    'speaker': '환자',
                    'start': 0,
                    'end': 2,
                    'text': '오늘 병원 가니?',
                },
                {
                    'id': 'seg_2',
                    'speaker': 'A',
                    'start': 2,
                    'end': 5,
                    'text': '내일 같이 가요.',
                },
            ],
        }
        mock_get_openai_client.return_value = fake_client
        audio = SimpleUploadedFile(
            'conversation.webm',
            b'audio-bytes',
            content_type='audio/webm',
        )

        result = transcribe_audio_file(
            audio,
            person=person,
            patient_voice_profile=voice_profile,
        )

        self.assertEqual(
            result.transcript,
            '환자: 오늘 병원 가니?\n아들 지훈: 내일 같이 가요.',
        )
        self.assertEqual(result.speaker_segments[0]['speaker_role'], 'patient')
        self.assertEqual(
            result.speaker_segments[1]['speaker_label'],
            '아들 지훈',
        )

        request_kwargs = fake_client.audio.transcriptions.create.call_args.kwargs

        self.assertEqual(request_kwargs['model'], 'gpt-4o-transcribe-diarize')
        self.assertEqual(request_kwargs['response_format'], 'diarized_json')
        self.assertEqual(request_kwargs['chunking_strategy'], 'auto')
        self.assertEqual(
            request_kwargs['extra_body']['known_speaker_names'],
            ['환자'],
        )
        self.assertIn(
            'data:audio/webm;base64,',
            request_kwargs['extra_body']['known_speaker_references'][0],
        )


class ConversationTranscriptionCreateViewTests(TestCase):
    def setUp(self):
        self.person = Person.objects.create(
            name='지훈',
            relationship='아들',
            core_memory={
                'summary': '삼성전자에 다니며 최근 딸을 낳았음',
            },
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
        previous_conversation = Conversation.objects.create(
            person=self.person,
            transcript='어제 단호박죽을 같이 먹었다.',
        )
        previous_memory = Memory.objects.create(
            person=self.person,
            conversation=previous_conversation,
            recap={
                'title': '저녁 식사',
                'summary': '아들 지훈과 단호박죽을 먹었습니다.',
                'upcoming_promise': None,
                'key_points': ['단호박죽을 함께 먹음'],
            },
            memory_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
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

        conversation = Conversation.objects.get(
            transcript=mock_transcribe_audio_file.return_value,
        )
        memory = Memory.objects.get(conversation=conversation)

        self.assertEqual(conversation.status, Conversation.STATUS_SUMMARIZED)
        self.assertEqual(conversation.transcript, mock_transcribe_audio_file.return_value)
        self.assertEqual(memory.recap['title'], '병원 예약')
        self.assertEqual(response.json()['memory']['recap']['title'], '병원 예약')

        prompt = mock_transcribe_audio_file.call_args.kwargs['prompt']
        self.assertIn(self.person.name, prompt)
        self.assertIn(self.person.relationship, prompt)
        self.assertIn('삼성전자', prompt)
        self.assertIn('단호박죽', prompt)
        self.assertEqual(mock_transcribe_audio_file.call_args.kwargs['person'], self.person)
        self.assertIsNone(
            mock_transcribe_audio_file.call_args.kwargs['patient_voice_profile'],
        )

        recent_memories = mock_generate_memory_recap.call_args.kwargs[
            'recent_memories'
        ]
        self.assertEqual(recent_memories, [previous_memory])

    @mock.patch('people.views.generate_memory_recap')
    @mock.patch('people.views.transcribe_audio_file')
    def test_transcription_saves_speaker_segments(
        self,
        mock_transcribe_audio_file,
        mock_generate_memory_recap,
    ):
        voice_profile = PatientVoiceProfile.objects.create(
            audio_data=b'patient-voice',
            audio_content_type='audio/webm',
            audio_filename='patient.webm',
        )
        mock_transcribe_audio_file.return_value = TranscriptionResult(
            transcript='환자: 오늘 병원 가니?\n아들 지훈: 내일 오전에 같이 가요.',
            speaker_segments=[
                {
                    'id': 'seg_1',
                    'speaker': '환자',
                    'speaker_label': '환자',
                    'speaker_role': 'patient',
                    'start': 0,
                    'end': 2,
                    'text': '오늘 병원 가니?',
                },
                {
                    'id': 'seg_2',
                    'speaker': 'A',
                    'speaker_label': '아들 지훈',
                    'speaker_role': 'counterpart',
                    'start': 2,
                    'end': 5,
                    'text': '내일 오전에 같이 가요.',
                },
            ],
        )
        mock_generate_memory_recap.return_value = {
            'title': '병원 약속',
            'summary': '아들 지훈과 병원 약속을 확인했습니다.',
            'upcoming_promise': '내일 오전 병원에 같이 가기',
            'key_points': ['내일 오전 병원 동행'],
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

        self.assertEqual(
            conversation.transcript,
            '환자: 오늘 병원 가니?\n아들 지훈: 내일 오전에 같이 가요.',
        )
        self.assertEqual(conversation.speaker_segments[0]['speaker_role'], 'patient')
        self.assertEqual(
            response.json()['speaker_segments'][1]['speaker_label'],
            '아들 지훈',
        )
        self.assertEqual(
            mock_transcribe_audio_file.call_args.kwargs['patient_voice_profile'],
            voice_profile,
        )

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
    def test_create_person_accepts_core_memory(self):
        response = self.client.post(
            reverse('person-list-create'),
            data=json.dumps(
                {
                    'name': '지민',
                    'relationship': '딸',
                    'core_memory': {
                        'summary': '삼성전자에 다니며 최근 딸을 낳았음',
                    },
                    'face_descriptor': face_descriptor(),
                },
            ),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            response.json()['core_memory']['summary'],
            '삼성전자에 다니며 최근 딸을 낳았음',
        )

        person = Person.objects.get(name='지민')
        self.assertEqual(
            person.core_memory['summary'],
            '삼성전자에 다니며 최근 딸을 낳았음',
        )

    def test_people_response_includes_latest_memory(self):
        person = Person.objects.create(
            name='민서',
            relationship='손녀',
            core_memory={
                'summary': '부산에 살고 바이올린을 배움',
            },
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
        self.assertEqual(
            response.json()[0]['core_memory']['summary'],
            '부산에 살고 바이올린을 배움',
        )


class PatientVoiceProfileViewTests(TestCase):
    def test_patient_voice_profile_status_and_upload(self):
        initial_response = self.client.get(reverse('patient-voice-profile'))

        self.assertEqual(initial_response.status_code, 200)
        self.assertEqual(initial_response.json()['is_registered'], False)

        audio = SimpleUploadedFile(
            'patient.webm',
            b'patient-voice-bytes',
            content_type='audio/webm',
        )

        upload_response = self.client.post(
            reverse('patient-voice-profile'),
            {'audio': audio},
        )

        self.assertEqual(upload_response.status_code, 201)
        self.assertEqual(upload_response.json()['is_registered'], True)

        profile = PatientVoiceProfile.objects.get()

        self.assertEqual(bytes(profile.audio_data), b'patient-voice-bytes')
        self.assertEqual(profile.audio_content_type, 'audio/webm')
