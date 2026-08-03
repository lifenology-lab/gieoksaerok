import json
import tempfile
import uuid
from datetime import date, datetime, timezone
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import reverse
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
from .services import (
    OpenAIMemorySummaryError,
    TranscriptionResult,
    generate_person_display_summary,
    transcribe_audio_file,
)


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
            'suggested_question': '병원 예약 시간을 다시 물어보세요.',
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
            'suggested_question': None,
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


class GeneratePersonDisplaySummaryTests(TestCase):
    @mock.patch('people.services._get_openai_client')
    def test_body_uses_only_three_recent_memories(self, mock_get_openai_client):
        user = create_patient_user()
        person = create_person(user=user, name='지민', relationship='딸')
        memories = []

        for index in range(4):
            conversation = Conversation.objects.create(
                user=user,
                person=person,
                transcript=f'{index}번째 대화',
            )
            memories.append(
                Memory.objects.create(
                    user=user,
                    person=person,
                    conversation=conversation,
                    recap={
                        'title': f'{index}번째 기억',
                        'summary': f'{index}번째 대화 요약',
                        'upcoming_promise': None,
                        'key_points': [f'{index}번째 핵심'],
                    },
                    memory_at=datetime(2026, 1, index + 1, tzinfo=timezone.utc),
                ),
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
        promise = Promise.objects.create(
            user=user,
            person=person,
            title='저녁 식사',
            description='딸 지민과 저녁 식사를 합니다.',
            scheduled_date=date(2099, 1, 2),
            time_label='저녁 7시',
            timezone='Asia/Seoul',
            confidence=0.9,
        )
        parsed_card = mock.Mock()
        parsed_card.model_dump.return_value = {
            'display_name': '딸 지민',
            'title': '최근 대화',
            'body': '딸 지민과 중요한 이야기를 나눴습니다.',
            'upcoming_promise': '1월 2일 저녁 7시 저녁 식사',
            'long_term_hint': '딸 지민은 환자의 딸입니다.',
            'suggested_question': None,
        }
        fake_client = mock.Mock()
        fake_client.responses.parse.return_value = mock.Mock(
            output_parsed=parsed_card,
        )
        mock_get_openai_client.return_value = fake_client

        result = generate_person_display_summary(
            person=person,
            recent_memories=memories,
            long_term_memories=[long_term_memory],
            active_promises=[promise],
        )

        self.assertEqual(result['display_name'], '딸 지민')
        self.assertEqual(result['upcoming_promise'], '1월 2일 저녁 7시 저녁 식사')

        request_kwargs = fake_client.responses.parse.call_args.kwargs
        input_payload = json.loads(
            request_kwargs['input'].split('\n', maxsplit=1)[1],
        )

        self.assertIn('3 most recent conversation summaries', request_kwargs['instructions'])
        self.assertIn('active_promises', request_kwargs['instructions'])
        self.assertEqual(len(input_payload['recent_memories']), 3)
        self.assertEqual(
            input_payload['active_promises'][0]['display_text'],
            '1월 2일 저녁 7시 저녁 식사',
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
            response.json()[0]['latest_summary']['card']['upcoming_promise'],
            '1월 2일 저녁 7시 저녁 식사',
        )
        self.assertEqual(
            response.json()[0]['latest_promise']['title'],
            '저녁 식사',
        )

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
