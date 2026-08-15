from io import StringIO
import json
import os
import shutil
import subprocess
import tempfile
import uuid
from datetime import date, datetime, timedelta, timezone
from unittest import mock

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone as django_timezone
from rest_framework_simplejwt.tokens import AccessToken

from .models import (
    Conversation,
    LongTermMemory,
    Memory,
    MemoryAlbumItem,
    PatientVoiceProfile,
    Person,
    PersonSummary,
    Promise,
)
from .promise_cleanup import cleanup_expired_promises
from .services import (
    OpenAIMemorySummaryError,
    TranscriptionResult,
    generate_memory_recap,
    generate_person_display_summary,
    prune_conversation_and_memory_history,
    transcribe_audio_file,
)
from .views import create_promise_record, normalize_long_term_memory_category


def face_descriptor():
    return [0.01] * 128


def create_patient_user(username=None):
    User = get_user_model()
    return User.objects.create_user(
        username=username or f'patient-{uuid.uuid4()}',
        password='test-password',
        name='테스트 환자',
    )


def create_person(user=None, name='지훈', relationship='아들'):
    return Person.objects.create(
        user=user or create_patient_user(),
        name=name,
        relationship=relationship,
        face_descriptor=face_descriptor(),
    )


def authenticate_client(client, user):
    client.defaults['HTTP_AUTHORIZATION'] = f'Bearer {AccessToken.for_user(user)}'


def is_openai_audio_eval_enabled():
    return os.environ.get('RUN_OPENAI_AUDIO_EVAL_TESTS') == '1'


def get_korean_say_voice():
    if not shutil.which('say'):
        return None

    try:
        voices = subprocess.run(
            ['say', '-v', '?'],
            capture_output=True,
            check=True,
            text=True,
            timeout=10,
        ).stdout
    except (subprocess.SubprocessError, OSError):
        return None

    if 'Yuna' in voices:
        return 'Yuna'

    for line in voices.splitlines():
        if 'ko_KR' in line:
            return line.split()[0]

    return None


def create_korean_tts_wav_bytes(text):
    voice = get_korean_say_voice()

    if not voice or not shutil.which('afconvert'):
        return None

    with tempfile.TemporaryDirectory() as temp_dir:
        aiff_path = os.path.join(temp_dir, 'conversation.aiff')
        wav_path = os.path.join(temp_dir, 'conversation.wav')

        subprocess.run(
            ['say', '-v', voice, '-r', '155', '-o', aiff_path, text],
            check=True,
            timeout=90,
        )
        subprocess.run(
            [
                'afconvert',
                '-f',
                'WAVE',
                '-d',
                'LEI16@16000',
                aiff_path,
                wav_path,
            ],
            check=True,
            timeout=30,
        )

        with open(wav_path, 'rb') as wav_file:
            return wav_file.read()


def count_korean_display_sentences(text):
    return len([part for part in text.replace('\n', ' ').split('.') if part.strip()])


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
        user = create_patient_user()
        person = create_person(user=user)
        voice_profile = PatientVoiceProfile.objects.create(
            user=user,
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
            prompt='이 프롬프트는 diarize 모델에는 전달하지 않는다.',
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
        self.assertEqual(request_kwargs['known_speaker_names'], ['환자'])
        self.assertIn(
            'data:audio/webm;base64,',
            request_kwargs['known_speaker_references'][0],
        )
        self.assertNotIn('prompt', request_kwargs)


class GenerateMemoryRecapTests(TestCase):
    @mock.patch('people.services._get_openai_client')
    def test_promise_description_excludes_date_time_and_person(self, mock_get_client):
        user = create_patient_user()
        person = create_person(user=user, name='지민', relationship='딸')
        parsed_recap = mock.Mock()
        parsed_recap.model_dump.return_value = {
            'title': '저녁 식사',
            'summary': '딸 지민과 식사 약속을 정했습니다.',
            'upcoming_promise': '내일 저녁 7시 어버이날 기념 저녁 식사',
            'promise': {
                'title': '저녁 식사',
                'description': '딸 지민과 내일 저녁 7시에 어버이날 기념으로 식사합니다.',
                'scheduled_at': None,
                'scheduled_date': '2026-08-07',
                'time_label': '저녁 7시',
                'timezone': 'Asia/Seoul',
                'raw_text': '내일 저녁 7시에 어버이날 기념으로 밥 먹자.',
                'confidence': 0.93,
            },
            'key_points': ['어버이날 기념 식사 약속'],
        }
        fake_client = mock.Mock()
        fake_client.responses.parse.return_value = mock.Mock(
            output_parsed=parsed_recap,
        )
        mock_get_client.return_value = fake_client

        result = generate_memory_recap(
            person=person,
            transcript='내일 저녁 7시에 어버이날 기념으로 밥 먹자.',
            recorded_at=datetime(2026, 8, 6, tzinfo=timezone.utc),
            promise_timezone='Asia/Seoul',
        )

        self.assertEqual(
            result['promise']['description'],
            '어버이날 기념 저녁 식사',
        )

        request_kwargs = fake_client.responses.parse.call_args.kwargs
        self.assertIn('promise.description', request_kwargs['instructions'])
        self.assertIn('Do not include dates', request_kwargs['instructions'])
        self.assertIn('어버이날 기념 저녁 식사', request_kwargs['instructions'])

    @mock.patch('people.services._get_openai_client')
    def test_broad_evening_does_not_become_specific_clock_time(
        self,
        mock_get_client,
    ):
        user = create_patient_user()
        person = create_person(user=user, name='지민', relationship='딸')
        parsed_recap = mock.Mock()
        parsed_recap.model_dump.return_value = {
            'title': '치킨 약속',
            'summary': '딸 지민과 가족 식사 약속을 정했습니다.',
            'upcoming_promise': '이번 주 일요일 저녁 가족과 치킨',
            'promise': {
                'title': '치킨 식사',
                'description': '가족과 치킨집 저녁',
                'scheduled_at': '2026-08-09T19:00:00+09:00',
                'scheduled_date': None,
                'time_label': '저녁 7시',
                'timezone': 'Asia/Seoul',
                'raw_text': '이번 주 일요일 저녁에 가족들이랑 치킨을 먹을거야.',
                'confidence': 0.91,
            },
            'key_points': ['가족과 치킨을 먹기로 했습니다.'],
        }
        fake_client = mock.Mock()
        fake_client.responses.parse.return_value = mock.Mock(
            output_parsed=parsed_recap,
        )
        mock_get_client.return_value = fake_client

        result = generate_memory_recap(
            person=person,
            transcript='이번 주 일요일 저녁에 가족들이랑 치킨을 먹을거야.',
            recorded_at=datetime(2026, 8, 6, tzinfo=timezone.utc),
            promise_timezone='Asia/Seoul',
        )

        self.assertIsNone(result['promise']['scheduled_at'])
        self.assertEqual(result['promise']['scheduled_date'], '2026-08-09')
        self.assertEqual(result['promise']['time_label'], '저녁')
        self.assertNotIn('7시', result['promise']['time_label'])
        self.assertEqual(result['promise']['description'], '가족과 치킨집 저녁')

        instructions = fake_client.responses.parse.call_args.kwargs['instructions']
        self.assertIn('Do not convert broad time', instructions)
        self.assertNotIn('do not rewrite it as "치킨집"', instructions)


class ConversationTranscriptionCreateViewTests(TestCase):
    def setUp(self):
        self.user = create_patient_user()
        self.person = create_person(user=self.user)
        authenticate_client(self.client, self.user)
        LongTermMemory.objects.create(
            user=self.user,
            person=self.person,
            category=LongTermMemory.CATEGORY_CAREER,
            title='삼성전자 근무',
            description='아들 지훈이 삼성전자에 다닙니다.',
            status=LongTermMemory.STATUS_CONFIRMED,
            confidence=0.95,
            source_text='삼성전자에 다니며 최근 딸을 낳았음',
        )

    @mock.patch('people.views.generate_person_display_summary')
    @mock.patch('people.views.merge_long_term_memory_candidate')
    @mock.patch('people.views.extract_long_term_memories')
    @mock.patch('people.views.generate_memory_recap')
    @mock.patch('people.views.transcribe_audio_file')
    def test_transcription_creates_conversation_and_memory(
        self,
        mock_transcribe_audio_file,
        mock_generate_memory_recap,
        mock_extract_long_term_memories,
        mock_merge_long_term_memory_candidate,
        mock_generate_person_display_summary,
    ):
        mock_transcribe_audio_file.return_value = '오늘 병원 예약에 대해 이야기했다.'
        mock_generate_memory_recap.return_value = {
            'title': '병원 예약',
            'summary': '아들 지훈과 병원 예약 시간을 확인했습니다.',
            'upcoming_promise': '내일 오전 병원에 가기',
            'promise': {
                'title': '병원 방문',
                'description': '아들 지훈과 병원에 갑니다.',
                'scheduled_at': None,
                'scheduled_date': '2099-01-01',
                'time_label': '오전',
                'timezone': 'Asia/Seoul',
                'raw_text': '내일 오전 병원에 같이 가요.',
                'confidence': 0.92,
            },
            'key_points': ['내일 오전 병원에 가기로 함'],
        }
        mock_extract_long_term_memories.return_value = [
            {
                'category': 'career',
                'title': '삼성전자 근무',
                'description': '아들 지훈이 삼성전자에 다닙니다.',
                'event_date': None,
                'confidence': 0.91,
                'source_text': '삼성전자에 다녀요.',
            },
            {
                'category': 'other',
                'title': '점심 식사',
                'description': '아들 지훈과 점심을 먹었습니다.',
                'event_date': None,
                'confidence': 0.79,
                'source_text': '오늘 같이 점심 먹었어요.',
            },
        ]
        mock_merge_long_term_memory_candidate.return_value = {
            'should_update': True,
            'title': '삼성전자와 출산',
            'description': '아들 지훈이 삼성전자에 다니며 최근 딸을 낳았습니다.',
            'event_date': None,
            'confidence': 0.96,
            'source_text': '삼성전자에 다녀요. 최근 딸을 낳았어요.',
            'reason': '기존 직장 정보와 새 출산 정보를 같은 career 기억으로 병합',
        }
        mock_generate_person_display_summary.return_value = {
            'display_name': '아들 지훈',
            'title': '병원 예약',
            'body': '아들 지훈과 병원 예약 시간을 확인했습니다.',
            'upcoming_promise': '내일 오전 병원에 가기',
            'long_term_hint': '삼성전자에 다닙니다.',
        }
        previous_conversation = Conversation.objects.create(
            user=self.user,
            person=self.person,
            transcript='어제 단호박죽을 같이 먹었다.',
        )
        previous_memory = Memory.objects.create(
            user=self.user,
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
        self.assertEqual(LongTermMemory.objects.count(), 1)
        self.assertEqual(
            response.json()['long_term_memories'][0]['title'],
            '삼성전자와 출산',
        )
        self.assertEqual(
            LongTermMemory.objects.get().description,
            '아들 지훈이 삼성전자에 다니며 최근 딸을 낳았습니다.',
        )
        self.assertFalse(
            LongTermMemory.objects.filter(title='점심 식사').exists(),
        )
        self.assertEqual(mock_merge_long_term_memory_candidate.call_count, 1)
        self.assertEqual(Promise.objects.count(), 1)
        self.assertEqual(
            response.json()['promises'][0]['title'],
            '병원 방문',
        )
        self.assertEqual(PersonSummary.objects.count(), 1)
        self.assertEqual(
            response.json()['summary']['card']['title'],
            '병원 예약',
        )

        prompt = mock_transcribe_audio_file.call_args.kwargs['prompt']
        self.assertIn(self.person.name, prompt)
        self.assertIn(self.person.relationship, prompt)
        self.assertNotIn('삼성전자', prompt)
        self.assertNotIn('단호박죽', prompt)
        self.assertEqual(mock_transcribe_audio_file.call_args.kwargs['person'], self.person)
        self.assertIsNone(
            mock_transcribe_audio_file.call_args.kwargs['patient_voice_profile'],
        )

        recent_memories = mock_generate_memory_recap.call_args.kwargs[
            'recent_memories'
        ]
        self.assertEqual(recent_memories, [previous_memory])
        self.assertEqual(
            mock_generate_person_display_summary.call_args.kwargs['person'],
            self.person,
        )
        self.assertEqual(
            mock_extract_long_term_memories.call_args.kwargs['recent_memories'],
            [previous_memory],
        )
        self.assertEqual(
            len(
                mock_generate_person_display_summary.call_args.kwargs[
                    'recent_memories'
                ],
            ),
            2,
        )
        self.assertEqual(
            len(
                mock_generate_person_display_summary.call_args.kwargs[
                    'active_promises'
                ],
            ),
            1,
        )

    @mock.patch('people.views.generate_person_display_summary')
    @mock.patch('people.views.extract_long_term_memories')
    @mock.patch('people.views.generate_memory_recap')
    @mock.patch('people.views.transcribe_audio_file')
    def test_transcription_saves_speaker_segments(
        self,
        mock_transcribe_audio_file,
        mock_generate_memory_recap,
        mock_extract_long_term_memories,
        mock_generate_person_display_summary,
    ):
        voice_profile = PatientVoiceProfile.objects.create(
            user=self.user,
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
        mock_extract_long_term_memories.return_value = []
        mock_generate_person_display_summary.return_value = {
            'display_name': '아들 지훈',
            'title': '병원 약속',
            'body': '아들 지훈과 병원 약속을 확인했습니다.',
            'upcoming_promise': '내일 오전 병원에 같이 가기',
            'long_term_hint': None,
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
        self.assertEqual(PersonSummary.objects.count(), 1)

    @mock.patch('people.views.extract_long_term_memories')
    @mock.patch('people.views.generate_memory_recap')
    @mock.patch('people.views.transcribe_audio_file')
    def test_transcription_generates_face_recognition_display_card(
        self,
        mock_transcribe_audio_file,
        mock_generate_memory_recap,
        mock_extract_long_term_memories,
    ):
        mock_transcribe_audio_file.return_value = TranscriptionResult(
            transcript='환자: 오늘 병원 어땠니?\n아들 지훈: 검사 결과가 좋대요.',
            speaker_segments=[
                {
                    'id': 'seg_1',
                    'speaker': '환자',
                    'speaker_label': '환자',
                    'speaker_role': 'patient',
                    'start': 0,
                    'end': 2,
                    'text': '오늘 병원 어땠니?',
                },
                {
                    'id': 'seg_2',
                    'speaker': 'A',
                    'speaker_label': '아들 지훈',
                    'speaker_role': 'counterpart',
                    'start': 2,
                    'end': 5,
                    'text': '검사 결과가 좋대요.',
                },
            ],
        )
        mock_generate_memory_recap.return_value = {
            'title': '병원 이야기',
            'summary': '아들 지훈과 병원 검사 결과가 좋다는 이야기를 나눴습니다.',
            'upcoming_promise': '2099년 1월 1일 오전 병원 방문',
            'promise': {
                'title': '병원 방문',
                'description': '병원 방문',
                'scheduled_at': None,
                'scheduled_date': '2099-01-01',
                'time_label': '오전',
                'timezone': 'Asia/Seoul',
                'raw_text': '2099년 1월 1일 오전에 병원에 같이 가요.',
                'confidence': 0.94,
            },
            'key_points': ['병원 검사 결과가 좋았습니다.'],
        }
        mock_extract_long_term_memories.return_value = []
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
                'recorded_at': '2026-08-15T09:00:00Z',
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(Memory.objects.count(), 1)
        self.assertEqual(Promise.objects.count(), 1)
        self.assertEqual(PersonSummary.objects.count(), 1)

        memory = Memory.objects.get()
        person_summary = PersonSummary.objects.get()
        card = person_summary.card

        self.assertEqual(memory.recap['title'], '병원 이야기')
        self.assertEqual(
            memory.recap['summary'],
            '아들 지훈과 병원 검사 결과가 좋다는 이야기를 나눴습니다.',
        )
        self.assertEqual(card['display_name'], '아들 지훈')
        self.assertEqual(card['title'], '병원 이야기')
        self.assertEqual(
            card['body'],
            '아들 지훈과 병원 검사 결과가 좋다는 이야기를 나눴습니다.',
        )
        self.assertEqual(
            card['upcoming_promise'],
            '1월 1일 오전 병원 방문 예정',
        )
        self.assertNotIn('suggested_question', card)
        self.assertEqual(
            response.json()['summary']['card']['title'],
            '병원 이야기',
        )
        self.assertEqual(
            response.json()['summary']['card']['upcoming_promise'],
            '1월 1일 오전 병원 방문 예정',
        )

        people_response = self.client.get(reverse('person-list-create'))

        self.assertEqual(people_response.status_code, 200)
        latest_summary_card = people_response.json()[0]['latest_summary']['card']
        self.assertEqual(latest_summary_card['display_name'], '아들 지훈')
        self.assertEqual(latest_summary_card['title'], '병원 이야기')
        self.assertEqual(
            latest_summary_card['body'],
            '아들 지훈과 병원 검사 결과가 좋다는 이야기를 나눴습니다.',
        )
        self.assertEqual(
            latest_summary_card['upcoming_promise'],
            '1월 1일 오전 병원 방문 예정',
        )
        self.assertNotIn('suggested_question', latest_summary_card)

    @mock.patch('people.views.generate_person_display_summary')
    @mock.patch('people.views.extract_long_term_memories')
    @mock.patch('people.views.generate_memory_recap')
    @mock.patch('people.views.transcribe_audio_file')
    def test_transcription_prunes_conversations_and_memories_to_recent_five(
        self,
        mock_transcribe_audio_file,
        mock_generate_memory_recap,
        mock_extract_long_term_memories,
        mock_generate_person_display_summary,
    ):
        base_time = datetime(2026, 1, 1, tzinfo=timezone.utc)
        old_records = []

        for index in range(5):
            recorded_at = base_time + timedelta(days=index)
            conversation = Conversation.objects.create(
                user=self.user,
                person=self.person,
                transcript=f'{index + 1}번째 기존 대화',
                recorded_at=recorded_at,
            )
            memory = Memory.objects.create(
                user=self.user,
                person=self.person,
                conversation=conversation,
                recap={
                    'title': f'{index + 1}번째 기억',
                    'summary': f'{index + 1}번째 요약',
                    'upcoming_promise': None,
                    'key_points': [],
                },
                memory_at=recorded_at,
            )
            old_records.append((conversation, memory))

        mock_transcribe_audio_file.return_value = '새로운 대화'
        mock_generate_memory_recap.return_value = {
            'title': '새 대화',
            'summary': '아들 지훈과 새 대화를 나눴습니다.',
            'upcoming_promise': None,
            'key_points': ['새 대화'],
        }
        mock_extract_long_term_memories.return_value = []
        mock_generate_person_display_summary.return_value = {
            'display_name': '아들 지훈',
            'title': '새 대화',
            'body': '아들 지훈과 새 대화를 나눴습니다.',
            'upcoming_promise': None,
            'long_term_hint': None,
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
        self.assertEqual(
            Conversation.objects.filter(user=self.user, person=self.person).count(),
            5,
        )
        self.assertEqual(
            Memory.objects.filter(user=self.user, person=self.person).count(),
            5,
        )
        self.assertFalse(Conversation.objects.filter(id=old_records[0][0].id).exists())
        self.assertFalse(Memory.objects.filter(id=old_records[0][1].id).exists())
        self.assertTrue(
            Conversation.objects.filter(
                id=response.json()['id'],
                transcript='새로운 대화',
            ).exists(),
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


class OpenAIAudioConversationQualityEvalTests(TestCase):
    maxDiff = None

    def setUp(self):
        if not is_openai_audio_eval_enabled():
            self.skipTest(
                'RUN_OPENAI_AUDIO_EVAL_TESTS=1일 때만 실제 OpenAI 음성 평가를 실행합니다.',
            )

        if not settings.OPENAI_API_KEY or settings.OPENAI_API_KEY == 'sk-your-api-key':
            self.skipTest('OPENAI_API_KEY가 설정되어 있지 않습니다.')

        if not get_korean_say_voice() or not shutil.which('afconvert'):
            self.skipTest('macOS 한국어 TTS(say)와 afconvert가 필요합니다.')

        self.user = create_patient_user()
        self.person = create_person(
            user=self.user,
            name='지민',
            relationship='딸',
        )
        authenticate_client(self.client, self.user)
        LongTermMemory.objects.create(
            user=self.user,
            person=self.person,
            category=LongTermMemory.CATEGORY_FAMILY,
            title='가족 관계',
            description='딸 지민은 환자의 병원 방문을 자주 도와줍니다.',
            status=LongTermMemory.STATUS_CONFIRMED,
            confidence=0.95,
            source_text='딸 지민은 병원 방문을 자주 도와줌',
        )

    @override_settings(
        OPENAI_TRANSCRIPTION_DIARIZATION_ENABLED=False,
        OPENAI_TRANSCRIPTION_LANGUAGE='ko',
    )
    @mock.patch('people.views.extract_long_term_memories', return_value=[])
    def test_generated_audio_conversation_produces_patient_friendly_face_card(
        self,
        mock_extract_long_term_memories,
    ):
        script = (
            '환자: 지민아, 오늘 병원 검사 결과가 어땠니? '
            '딸 지민: 엄마, 오늘 저와 병원에 함께 다녀왔어요. '
            '의사 선생님이 혈압 수치가 아주 좋다고 했어요. '
            '내일 저녁 일곱시에 집에서 저녁 식사를 같이 하기로 했어요.'
        )
        audio_bytes = create_korean_tts_wav_bytes(script)

        if not audio_bytes:
            self.skipTest('테스트용 한국어 음성 파일을 만들지 못했습니다.')

        audio = SimpleUploadedFile(
            'patient-daughter-conversation.wav',
            audio_bytes,
            content_type='audio/wav',
        )

        response = self.client.post(
            reverse('conversation-transcription-create'),
            {
                'person': str(self.person.id),
                'audio': audio,
                'recorded_at': '2026-08-15T09:00:00Z',
            },
        )

        self.assertEqual(response.status_code, 201, response.content.decode())

        data = response.json()
        self.assertIsNone(data.get('memory_error'), data)
        self.assertIsNotNone(data.get('memory'), data)
        self.assertIsNotNone(data.get('summary'), data)

        conversation = Conversation.objects.get(person=self.person)
        memory = Memory.objects.get(conversation=conversation)
        card = data['summary']['card']
        body = card.get('body') or ''
        upcoming_promise = card.get('upcoming_promise') or ''

        evaluation_result = {
            'transcript': conversation.transcript,
            'memory_recap': memory.recap,
            'face_card': card,
        }
        print(
            '\n[OpenAI audio conversation quality eval]\n'
            f'{json.dumps(evaluation_result, ensure_ascii=False, indent=2)}',
        )

        self.assertEqual(card.get('display_name'), '딸 지민')
        self.assertTrue(card.get('title'), card)
        self.assertLessEqual(len(card['title'].replace(' ', '')), 12, card)
        self.assertIn('딸 지민', body)
        self.assertLessEqual(count_korean_display_sentences(body), 2, body)
        self.assertLessEqual(len(body), 100, body)

        for disallowed_word in ['그녀', '그분', '상대방']:
            self.assertNotIn(disallowed_word, body)

        self.assertTrue(
            any(keyword in body for keyword in ['병원', '검사', '혈압']),
            body,
        )
        self.assertTrue(any(keyword in body for keyword in ['좋', '양호']), body)
        self.assertTrue(upcoming_promise, card)
        self.assertTrue(
            any(keyword in upcoming_promise for keyword in ['저녁', '식사', '밥']),
            upcoming_promise,
        )
        self.assertNotIn('suggested_question', card)
        mock_extract_long_term_memories.assert_called_once()


class ConversationMemoryRetentionTests(TestCase):
    def create_conversation_memory_pair(self, user, person, index):
        recorded_at = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(
            days=index,
        )
        conversation = Conversation.objects.create(
            user=user,
            person=person,
            transcript=f'{index}번째 대화',
            recorded_at=recorded_at,
        )
        memory = Memory.objects.create(
            user=user,
            person=person,
            conversation=conversation,
            recap={
                'title': f'{index}번째 기억',
                'summary': f'{index}번째 요약',
                'upcoming_promise': None,
                'key_points': [],
            },
            memory_at=recorded_at,
        )
        return conversation, memory

    def test_prune_keeps_recent_five_for_each_user_person_pair(self):
        user = create_patient_user()
        person = create_person(user=user, name='지민', relationship='딸')
        other_person = create_person(user=user, name='민서', relationship='손녀')
        other_user = create_patient_user()
        other_user_person = create_person(
            user=other_user,
            name='지훈',
            relationship='아들',
        )

        target_records = [
            self.create_conversation_memory_pair(user, person, index)
            for index in range(6)
        ]

        for index in range(6):
            self.create_conversation_memory_pair(user, other_person, index)
            self.create_conversation_memory_pair(
                other_user,
                other_user_person,
                index,
            )

        prune_conversation_and_memory_history(user=user, person=person)

        self.assertEqual(
            Conversation.objects.filter(user=user, person=person).count(),
            5,
        )
        self.assertEqual(Memory.objects.filter(user=user, person=person).count(), 5)
        self.assertFalse(
            Conversation.objects.filter(id=target_records[0][0].id).exists(),
        )
        self.assertFalse(Memory.objects.filter(id=target_records[0][1].id).exists())
        self.assertEqual(
            Conversation.objects.filter(user=user, person=other_person).count(),
            6,
        )
        self.assertEqual(
            Memory.objects.filter(user=user, person=other_person).count(),
            6,
        )
        self.assertEqual(
            Conversation.objects.filter(
                user=other_user,
                person=other_user_person,
            ).count(),
            6,
        )
        self.assertEqual(
            Memory.objects.filter(user=other_user, person=other_user_person).count(),
            6,
        )


class PromiseDateInferenceTests(TestCase):
    def setUp(self):
        self.user = create_patient_user()
        self.person = create_person(user=self.user, name='지민', relationship='딸')
        self.recorded_at = datetime(2099, 8, 6, 11, tzinfo=timezone.utc)
        self.conversation = Conversation.objects.create(
            user=self.user,
            person=self.person,
            transcript='약속 날짜를 이야기했다.',
            recorded_at=self.recorded_at,
        )
        self.memory = Memory.objects.create(
            user=self.user,
            person=self.person,
            conversation=self.conversation,
            recap={
                'title': '약속',
                'summary': '딸 지민과 약속을 정했습니다.',
                'upcoming_promise': None,
                'key_points': [],
            },
            memory_at=self.recorded_at,
        )

    def create_promise(self, raw_text):
        return create_promise_record(
            person=self.person,
            conversation=self.conversation,
            memory=self.memory,
            promise_data={
                'title': '병원 방문',
                'description': '딸 지민과 병원에 갑니다.',
                'scheduled_at': None,
                'scheduled_date': None,
                'time_label': '오전',
                'timezone': 'Asia/Seoul',
                'raw_text': raw_text,
                'confidence': 0.92,
            },
        )

    def test_infers_tomorrow_from_raw_text(self):
        promise = self.create_promise('내일 오전 병원에 같이 가요.')

        self.assertIsNotNone(promise)
        self.assertEqual(promise.scheduled_date, date(2099, 8, 7))

    def test_infers_this_week_friday_from_raw_text(self):
        promise = self.create_promise('이번 주 금요일 오전 병원에 같이 가요.')

        self.assertIsNotNone(promise)
        self.assertEqual(promise.scheduled_date, date(2099, 8, 7))

    def test_infers_next_week_friday_from_raw_text(self):
        promise = self.create_promise('다음 주 금요일 오전 병원에 같이 가요.')

        self.assertIsNotNone(promise)
        self.assertEqual(promise.scheduled_date, date(2099, 8, 14))

    def test_create_promise_drops_inferred_clock_time(self):
        conversation = Conversation.objects.create(
            user=self.user,
            person=self.person,
            transcript='이번 주 일요일 저녁에 가족들이랑 치킨을 먹을거야.',
            recorded_at=datetime(2099, 8, 6, tzinfo=timezone.utc),
        )
        memory = Memory.objects.create(
            user=self.user,
            person=self.person,
            conversation=conversation,
            recap={
                'title': '치킨 약속',
                'summary': '딸 지민과 가족 식사 약속을 정했습니다.',
                'upcoming_promise': None,
                'key_points': [],
            },
            memory_at=conversation.recorded_at,
        )

        promise = create_promise_record(
            person=self.person,
            conversation=conversation,
            memory=memory,
            promise_data={
                'title': '치킨 식사',
                'description': '가족과 치킨집 저녁',
                'scheduled_at': '2099-08-09T19:00:00+09:00',
                'scheduled_date': None,
                'time_label': '저녁 7시',
                'timezone': 'Asia/Seoul',
                'raw_text': '이번 주 일요일 저녁에 가족들이랑 치킨을 먹을거야.',
                'confidence': 0.91,
            },
        )

        self.assertIsNotNone(promise)
        self.assertIsNone(promise.scheduled_at)
        self.assertEqual(promise.scheduled_date, date(2099, 8, 9))
        self.assertEqual(promise.time_label, '저녁')
        self.assertEqual(promise.description, '가족과 치킨집 저녁')

    def test_create_promise_builds_scheduled_at_from_explicit_clock_time(self):
        promise = create_promise_record(
            person=self.person,
            conversation=self.conversation,
            memory=self.memory,
            promise_data={
                'title': '저녁 식사',
                'description': '집에서 저녁 식사',
                'scheduled_at': None,
                'scheduled_date': '2099-08-07',
                'time_label': '저녁 7시',
                'timezone': 'Asia/Seoul',
                'raw_text': '내일 저녁 7시에 집에서 저녁 식사를 같이 해요.',
                'confidence': 0.92,
            },
        )

        self.assertIsNotNone(promise)
        self.assertEqual(promise.scheduled_date, date(2099, 8, 7))
        self.assertIsNotNone(promise.scheduled_at)
        self.assertEqual(promise.scheduled_at.hour, 19)
        self.assertEqual(promise.scheduled_at.minute, 0)


class ExpiredPromiseCleanupTests(TestCase):
    def setUp(self):
        self.user = create_patient_user()
        self.person = create_person(user=self.user, name='지민', relationship='딸')

    def create_promise(self, status, scheduled_date, title):
        return Promise.objects.create(
            user=self.user,
            person=self.person,
            title=title,
            description=f'{title} 약속입니다.',
            scheduled_date=scheduled_date,
            time_label='오전',
            timezone='Asia/Seoul',
            status=status,
            confidence=0.9,
        )

    def test_cleanup_deletes_only_old_expired_promises(self):
        now = datetime(2099, 1, 31, 12, tzinfo=timezone.utc)
        old_expired = self.create_promise(
            Promise.STATUS_EXPIRED,
            date(2098, 12, 1),
            '오래된 만료 약속',
        )
        recent_expired = self.create_promise(
            Promise.STATUS_EXPIRED,
            date(2099, 1, 1),
            '최근 만료 약속',
        )
        stale_active = self.create_promise(
            Promise.STATUS_ACTIVE,
            date(2099, 1, 1),
            '지난 활성 약속',
        )
        future_active = self.create_promise(
            Promise.STATUS_ACTIVE,
            date(2099, 2, 10),
            '다가오는 약속',
        )

        Promise.objects.filter(id=old_expired.id).update(
            updated_at=now - timedelta(days=31),
        )
        Promise.objects.filter(id=recent_expired.id).update(
            updated_at=now - timedelta(days=5),
        )

        result = cleanup_expired_promises(retention_days=30, now=now)

        self.assertEqual(result['expired_count'], 1)
        self.assertEqual(result['deleted_count'], 1)
        self.assertFalse(Promise.objects.filter(id=old_expired.id).exists())
        self.assertTrue(Promise.objects.filter(id=recent_expired.id).exists())
        stale_active.refresh_from_db()
        future_active.refresh_from_db()
        self.assertEqual(stale_active.status, Promise.STATUS_EXPIRED)
        self.assertEqual(future_active.status, Promise.STATUS_ACTIVE)

    def test_cleanup_expired_promises_command(self):
        old_expired = self.create_promise(
            Promise.STATUS_EXPIRED,
            date(2020, 1, 1),
            '삭제할 만료 약속',
        )
        Promise.objects.filter(id=old_expired.id).update(
            updated_at=django_timezone.now() - timedelta(days=31),
        )
        output = StringIO()

        call_command(
            'cleanup_expired_promises',
            '--retention-days',
            '30',
            stdout=output,
        )

        self.assertIn('deleted 1 expired promises', output.getvalue())
        self.assertFalse(Promise.objects.filter(id=old_expired.id).exists())


class LongTermMemoryCategoryTests(TestCase):
    def test_long_term_memory_choices_are_simplified(self):
        self.assertEqual(
            [choice[0] for choice in LongTermMemory.CATEGORY_CHOICES],
            ['family', 'health', 'career', 'relationship', 'other'],
        )

    def test_legacy_categories_are_mapped_to_simplified_categories(self):
        self.assertEqual(
            normalize_long_term_memory_category('birth'),
            LongTermMemory.CATEGORY_FAMILY,
        )
        self.assertEqual(
            normalize_long_term_memory_category('marriage'),
            LongTermMemory.CATEGORY_FAMILY,
        )
        self.assertEqual(
            normalize_long_term_memory_category('death'),
            LongTermMemory.CATEGORY_FAMILY,
        )
        self.assertEqual(
            normalize_long_term_memory_category('education'),
            LongTermMemory.CATEGORY_CAREER,
        )


class GeneratePersonDisplaySummaryTests(TestCase):
    def test_card_uses_latest_memory_and_nearest_active_promise(self):
        user = create_patient_user()
        person = create_person(user=user, name='지민', relationship='딸')
        older_conversation = Conversation.objects.create(
            user=user,
            person=person,
            transcript='오래된 대화',
        )
        newer_conversation = Conversation.objects.create(
            user=user,
            person=person,
            transcript='최근 대화',
        )
        older_memory = Memory.objects.create(
            user=user,
            person=person,
            conversation=older_conversation,
            recap={
                'title': '오래된 기억',
                'description': '오래된 대화 요약입니다.',
                'upcoming_promise': None,
                'key_points': [],
            },
            memory_at=datetime(2026, 8, 1, tzinfo=timezone.utc),
        )
        newer_memory = Memory.objects.create(
            user=user,
            person=person,
            conversation=newer_conversation,
            recap={
                'title': '병원 이야기',
                'description': '딸 지민과 병원에 다녀왔습니다.',
                'upcoming_promise': None,
                'key_points': [],
            },
            memory_at=datetime(2026, 8, 5, tzinfo=timezone.utc),
        )
        long_term_memory = LongTermMemory.objects.create(
            user=user,
            person=person,
            category=LongTermMemory.CATEGORY_FAMILY,
            title='가족 관계',
            description='딸 지민은 환자의 딸입니다.',
            status=LongTermMemory.STATUS_CONFIRMED,
            confidence=0.95,
        )
        farther_promise = Promise.objects.create(
            user=user,
            person=person,
            title='주말 산책',
            description='딸 지민과 주말 산책',
            scheduled_date=date(2026, 8, 9),
            timezone='Asia/Seoul',
            confidence=0.9,
        )
        nearest_promise = Promise.objects.create(
            user=user,
            person=person,
            title='저녁 식사',
            description='딸 지민과 어버이날 기념 저녁 식사',
            scheduled_date=date(2026, 8, 7),
            time_label='저녁 7시',
            timezone='Asia/Seoul',
            confidence=0.9,
        )

        result = generate_person_display_summary(
            person=person,
            recent_memories=[newer_memory, older_memory],
            long_term_memories=[long_term_memory],
            active_promises=[farther_promise, nearest_promise],
            now=datetime(2026, 8, 6, 12, tzinfo=timezone.utc),
        )

        self.assertEqual(result['display_name'], '딸 지민')
        self.assertEqual(
            result['title'],
            '병원 이야기',
        )
        self.assertEqual(
            result['body'],
            '딸 지민과 병원에 다녀왔습니다.',
        )
        self.assertEqual(
            result['upcoming_promise'],
            '내일 저녁 7시 어버이날 기념 저녁 식사 예정',
        )
        self.assertNotIn('suggested_question', result)

    def test_card_body_prefers_non_promise_key_points_when_summary_repeats_promise(self):
        user = create_patient_user()
        person = create_person(user=user, name='지민', relationship='딸')
        conversation = Conversation.objects.create(
            user=user,
            person=person,
            transcript='병원 결과와 저녁 약속을 이야기했다.',
            recorded_at=datetime(2026, 8, 15, tzinfo=timezone.utc),
        )
        memory = Memory.objects.create(
            user=user,
            person=person,
            conversation=conversation,
            recap={
                'title': '딸과 저녁식사',
                'summary': '딸 지민과 내일 저녁 7시에 집에서 저녁 식사를 합니다.',
                'upcoming_promise': '내일 저녁 7시 집에서 저녁 식사',
                'key_points': [
                    '딸 지민과 병원에 함께 다녀왔습니다.',
                    '혈압 수치가 좋다고 들었습니다.',
                    '내일 저녁 7시에 집에서 식사합니다.',
                ],
            },
            memory_at=datetime(2026, 8, 15, tzinfo=timezone.utc),
        )
        promise = Promise.objects.create(
            user=user,
            person=person,
            conversation=conversation,
            memory=memory,
            title='저녁 식사',
            description='집에서 저녁 식사',
            scheduled_date=date(2026, 8, 16),
            time_label='저녁 7시',
            timezone='Asia/Seoul',
            confidence=0.95,
        )

        result = generate_person_display_summary(
            person=person,
            recent_memories=[memory],
            long_term_memories=[],
            active_promises=[promise],
            now=datetime(2026, 8, 15, 12, tzinfo=timezone.utc),
        )

        self.assertEqual(
            result['body'],
            '딸 지민과 병원에 함께 다녀왔습니다. 혈압 수치가 좋다고 들었습니다.',
        )
        self.assertEqual(
            result['upcoming_promise'],
            '내일 저녁 7시 집에서 저녁 식사 예정',
        )


class PersonListCreateViewTests(TestCase):
    @mock.patch('people.views.extract_initial_long_term_memories')
    def test_create_person_converts_initial_memory_to_long_term_memory(
        self,
        mock_extract_initial_long_term_memories,
    ):
        user = create_patient_user()
        authenticate_client(self.client, user)
        mock_extract_initial_long_term_memories.return_value = [
            {
                'category': 'career',
                'title': '삼성전자 근무',
                'description': '딸 지민이 삼성전자에 다닙니다.',
                'event_date': None,
                'confidence': 0.92,
                'source_text': '삼성전자에 다님',
            },
        ]

        response = self.client.post(
            reverse('person-list-create'),
            data=json.dumps(
                {
                    'name': '지민',
                    'relationship': '딸',
                    'initial_memory': '삼성전자에 다니며 최근 딸을 낳았음',
                    'face_descriptor': face_descriptor(),
                },
            ),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 201)
        self.assertNotIn('core_memory', response.json())
        self.assertEqual(
            response.json()['initial_long_term_memories'][0]['title'],
            '삼성전자 근무',
        )

        person = Person.objects.get(name='지민')
        long_term_memory = LongTermMemory.objects.get(person=person)

        self.assertEqual(
            long_term_memory.status,
            LongTermMemory.STATUS_CONFIRMED,
        )
        self.assertEqual(
            mock_extract_initial_long_term_memories.call_args.kwargs[
                'initial_memory'
            ],
            '삼성전자에 다니며 최근 딸을 낳았음',
        )

    def test_people_response_includes_latest_memory(self):
        user = create_patient_user()
        authenticate_client(self.client, user)
        person = create_person(user=user, name='민서', relationship='손녀')
        older_conversation = Conversation.objects.create(
            user=user,
            person=person,
            transcript='오래된 대화',
        )
        newer_conversation = Conversation.objects.create(
            user=user,
            person=person,
            transcript='최근 대화',
        )
        Memory.objects.create(
            user=user,
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
        newer_memory = Memory.objects.create(
            user=user,
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
        Promise.objects.create(
            user=user,
            person=person,
            conversation=newer_conversation,
            memory=newer_memory,
            title='저녁 식사',
            description='손녀 민서와 저녁 식사를 합니다.',
            scheduled_date=date(2099, 1, 2),
            time_label='저녁 7시',
            timezone='Asia/Seoul',
            confidence=0.9,
        )
        PersonSummary.objects.create(
            user=user,
            person=person,
            conversation=newer_conversation,
            card={
                'display_name': '손녀 민서',
                'title': '최근 기억',
                'body': '손녀 민서와 최근 이야기를 나눴습니다.',
                'upcoming_promise': '오늘 저녁 식사',
                'long_term_hint': '부산에 살고 바이올린을 배웁니다.',
                'suggested_question': '바이올린 연습을 물어보세요.',
            },
            source_memory_ids=[],
            source_long_term_memory_ids=[],
            generated_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        )

        response = self.client.get(reverse('person-list-create'))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()[0]['latest_memory']['recap']['title'],
            '최근 기억',
        )
        self.assertNotIn('core_memory', response.json()[0])
        self.assertEqual(
            response.json()[0]['latest_summary']['card']['title'],
            '최근 기억',
        )
        self.assertEqual(
            response.json()[0]['latest_summary']['card']['body'],
            '손녀 민서와 최근 요약',
        )
        self.assertEqual(
            response.json()[0]['latest_summary']['card']['upcoming_promise'],
            '1월 2일 저녁 7시 저녁 식사 예정',
        )
        self.assertNotIn(
            'suggested_question',
            response.json()[0]['latest_summary']['card'],
        )
        self.assertEqual(
            response.json()[0]['latest_promise']['title'],
            '저녁 식사',
        )

    def test_people_response_card_body_avoids_repeating_upcoming_promise(self):
        user = create_patient_user()
        authenticate_client(self.client, user)
        person = create_person(user=user, name='지민', relationship='딸')
        conversation = Conversation.objects.create(
            user=user,
            person=person,
            transcript='병원 결과와 저녁 약속을 이야기했다.',
            recorded_at=datetime(2026, 8, 15, tzinfo=timezone.utc),
        )
        memory = Memory.objects.create(
            user=user,
            person=person,
            conversation=conversation,
            recap={
                'title': '딸과 저녁식사',
                'summary': '딸 지민과 내일 저녁 7시에 집에서 저녁 식사를 합니다.',
                'upcoming_promise': '내일 저녁 7시 집에서 저녁 식사',
                'key_points': [
                    '딸 지민과 병원에 함께 다녀왔습니다.',
                    '혈압 수치가 좋다고 들었습니다.',
                    '내일 저녁 7시에 집에서 식사합니다.',
                ],
            },
            memory_at=datetime(2026, 8, 15, tzinfo=timezone.utc),
        )
        Promise.objects.create(
            user=user,
            person=person,
            conversation=conversation,
            memory=memory,
            title='저녁 식사',
            description='집에서 저녁 식사',
            scheduled_date=date(2099, 1, 1),
            time_label='저녁 7시',
            timezone='Asia/Seoul',
            confidence=0.95,
        )
        PersonSummary.objects.create(
            user=user,
            person=person,
            conversation=conversation,
            card={
                'display_name': '딸 지민',
                'title': '딸과 저녁식사',
                'body': '딸 지민과 내일 저녁 7시에 집에서 저녁 식사를 합니다.',
                'upcoming_promise': '내일 저녁 7시 집에서 저녁 식사',
                'long_term_hint': None,
            },
            source_memory_ids=[],
            source_long_term_memory_ids=[],
            generated_at=datetime(2026, 8, 15, tzinfo=timezone.utc),
        )

        response = self.client.get(reverse('person-list-create'))

        self.assertEqual(response.status_code, 200)
        card = response.json()[0]['latest_summary']['card']
        self.assertEqual(
            card['body'],
            '딸 지민과 병원에 함께 다녀왔습니다. 혈압 수치가 좋다고 들었습니다.',
        )
        self.assertIn('저녁 식사 예정', card['upcoming_promise'])

    def test_people_response_expires_past_promises(self):
        user = create_patient_user()
        authenticate_client(self.client, user)
        person = create_person(user=user, name='민서', relationship='손녀')
        conversation = Conversation.objects.create(
            user=user,
            person=person,
            transcript='지난 약속을 이야기했다.',
        )
        PersonSummary.objects.create(
            user=user,
            person=person,
            conversation=conversation,
            card={
                'display_name': '손녀 민서',
                'title': '지난 약속',
                'body': '손녀 민서와 약속 이야기를 나눴습니다.',
                'upcoming_promise': '2020년 1월 1일 점심 식사',
                'long_term_hint': None,
                'suggested_question': None,
            },
            source_memory_ids=[],
            source_long_term_memory_ids=[],
            generated_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        )
        promise = Promise.objects.create(
            user=user,
            person=person,
            conversation=conversation,
            title='점심 식사',
            description='손녀 민서와 점심 식사를 합니다.',
            scheduled_date=date(2020, 1, 1),
            time_label='점심',
            timezone='Asia/Seoul',
            confidence=0.9,
        )

        response = self.client.get(reverse('person-list-create'))

        self.assertEqual(response.status_code, 200)
        promise.refresh_from_db()
        self.assertEqual(promise.status, Promise.STATUS_EXPIRED)
        self.assertIsNone(response.json()[0]['latest_promise'])
        self.assertIsNone(
            response.json()[0]['latest_summary']['card']['upcoming_promise'],
        )

    def test_people_response_is_scoped_to_authenticated_user(self):
        first_user = create_patient_user()
        second_user = create_patient_user()
        authenticate_client(self.client, first_user)
        create_person(user=first_user, name='지민', relationship='딸')
        create_person(user=second_user, name='민서', relationship='손녀')

        response = self.client.get(
            reverse('person-list-create'),
            {'user': str(second_user.id)},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]['name'], '지민')


class MemoryAlbumItemListCreateViewTests(TestCase):
    def setUp(self):
        self.user = create_patient_user()
        self.person = create_person(user=self.user, name='지민', relationship='딸')
        authenticate_client(self.client, self.user)

    def test_create_and_list_memory_album_items(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                photo = SimpleUploadedFile(
                    'picnic.png',
                    b'fake-image-bytes',
                    content_type='image/png',
                )

                create_response = self.client.post(
                    reverse(
                        'memory-album-item-list-create',
                        kwargs={'person_id': self.person.id},
                    ),
                    {
                        'photo': photo,
                        'description': '봄날 공원에서 함께 찍은 사진',
                        'crop_x': '24.5',
                        'crop_y': '71',
                    },
                )

                self.assertEqual(create_response.status_code, 201)
                self.assertEqual(MemoryAlbumItem.objects.count(), 1)

                item = MemoryAlbumItem.objects.get()

                self.assertEqual(item.person, self.person)
                self.assertEqual(item.description, '봄날 공원에서 함께 찍은 사진')
                self.assertEqual(item.crop_x, 24.5)
                self.assertEqual(item.crop_y, 71)
                self.assertTrue(
                    create_response.json()['photo_url'].startswith(
                        '/media/memory_album_photos/',
                    ),
                )

                list_response = self.client.get(
                    reverse(
                        'memory-album-item-list-create',
                        kwargs={'person_id': self.person.id},
                    ),
                )

                self.assertEqual(list_response.status_code, 200)
                self.assertEqual(list_response.json()[0]['id'], str(item.id))
                self.assertEqual(list_response.json()[0]['crop_x'], 24.5)

    @mock.patch('people.views.generate_patient_memory_album_description')
    def test_caregiver_memory_album_description_is_rewritten_for_patient(
        self,
        mock_generate_description,
    ):
        rewritten_description = (
            '딸 지민과 제주도 억새밭을 걸으며 사진도 찍고 활짝 웃었던 즐거운 날입니다.'
        )
        mock_generate_description.return_value = rewritten_description
        caregiver_description = (
            '작년 가을에 엄마 모시고 제주도 갔을 때, 억새밭 보면서 엄마가 '
            '소녀처럼 엄청 좋아하셨어. 바람이 많이 불었는데도 계속 사진 '
            '찍어달라고 하시면서 활짝 웃으셨던 게 제일 기억에 남아. '
            '그날 사진을 볼 때마다 엄마 웃는 모습이 떠올라서 마음이 따뜻해져.'
        )

        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                photo = SimpleUploadedFile(
                    'jeju.png',
                    b'fake-image-bytes',
                    content_type='image/png',
                )

                response = self.client.post(
                    reverse(
                        'memory-album-item-list-create',
                        kwargs={'person_id': self.person.id},
                    ),
                    {
                        'photo': photo,
                        'description': caregiver_description,
                        'crop_x': '50',
                        'crop_y': '50',
                        'source': 'caregiver',
                    },
                )

        self.assertEqual(response.status_code, 201)
        item = MemoryAlbumItem.objects.get()
        self.assertEqual(item.description, rewritten_description)
        self.assertEqual(response.json()['description'], rewritten_description)
        self.assertNotEqual(item.description, caregiver_description)

        mock_generate_description.assert_called_once()
        call_kwargs = mock_generate_description.call_args.kwargs
        self.assertEqual(call_kwargs['person'], self.person)
        self.assertEqual(call_kwargs['caregiver_description'], caregiver_description)
        self.assertEqual(call_kwargs['patient_name'], '테스트 환자')

    @mock.patch('people.views.generate_patient_memory_album_description')
    def test_caregiver_memory_album_openai_error_returns_503(
        self,
        mock_generate_description,
    ):
        mock_generate_description.side_effect = OpenAIMemorySummaryError(
            'OpenAI 추억 글귀 변환 요청에 실패했습니다.',
        )

        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                photo = SimpleUploadedFile(
                    'jeju.png',
                    b'fake-image-bytes',
                    content_type='image/png',
                )

                response = self.client.post(
                    reverse(
                        'memory-album-item-list-create',
                        kwargs={'person_id': self.person.id},
                    ),
                    {
                        'photo': photo,
                        'description': '제주도에서 함께한 즐거운 추억',
                        'crop_x': '50',
                        'crop_y': '50',
                        'source': 'caregiver',
                    },
                )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(MemoryAlbumItem.objects.count(), 0)

    def test_delete_memory_album_item(self):
        with tempfile.TemporaryDirectory() as media_root:
            with override_settings(MEDIA_ROOT=media_root):
                photo = SimpleUploadedFile(
                    'birthday.png',
                    b'fake-image-bytes',
                    content_type='image/png',
                )
                item = MemoryAlbumItem.objects.create(
                    user=self.user,
                    person=self.person,
                    photo=photo,
                    description='생일에 함께 찍은 사진',
                )

                response = self.client.delete(
                    reverse(
                        'memory-album-item-detail',
                        kwargs={
                            'person_id': self.person.id,
                            'item_id': item.id,
                        },
                    ),
                )

                self.assertEqual(response.status_code, 204)
                self.assertEqual(MemoryAlbumItem.objects.count(), 0)


class PatientVoiceProfileViewTests(TestCase):
    def test_patient_voice_profile_status_and_upload(self):
        user = create_patient_user()
        authenticate_client(self.client, user)
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
