from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from patient_assistant.models import PatientQuestionEvent
from people.models import Person
from records.models import ConfusionEvent, MealRecord

from .demo_services import delete_expired_demo_sessions
from .models import DemoExperienceSession


User = get_user_model()


class DemoExperienceViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="demo-patient",
            password="not-used-by-demo-endpoint",
            name="데모 환자",
        )
        Person.objects.create(
            user=self.user,
            name="김민수",
            relationship="아들",
            face_descriptor=[0.1, 0.2, 0.3],
        )
        MealRecord.objects.create(
            user=self.user,
            meal_type="breakfast",
            eaten_at=timezone.now(),
            menu="죽",
            source="caregiver_recorded",
        )
        ConfusionEvent.objects.create(
            user=self.user,
            confusion_type="place",
            occurred_at=timezone.now(),
        )
        PatientQuestionEvent.objects.create(
            user=self.user,
            transcript="여기가 어디지?",
            input_method="text",
            intent_type="place",
            response_summary="현재 위치를 함께 확인해 볼까요?",
            occurred_at=timezone.now(),
        )

    @override_settings(DEMO_EXPERIENCE_ENABLED=False)
    def test_returns_not_found_when_demo_is_disabled(self):
        response = self.client.post("/api/auth/demo/")

        self.assertEqual(response.status_code, 404)

    @override_settings(
        DEMO_EXPERIENCE_ENABLED=True,
        DEMO_EXPERIENCE_USERNAME="demo-patient",
    )
    def test_returns_tokens_for_configured_demo_user(self):
        response = self.client.post(
            "/api/auth/demo/",
            {"mode": "example-scenes"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        demo_user = User.objects.get(id=response.data["user"]["id"])
        demo_session = DemoExperienceSession.objects.get(session_user=demo_user)

        self.assertNotEqual(demo_user.id, self.user.id)
        self.assertNotEqual(demo_user.username, self.user.username)
        self.assertEqual(demo_user.name, self.user.name)
        self.assertEqual(demo_session.template_user, self.user)
        self.assertEqual(demo_session.mode, "example-scenes")
        self.assertEqual(Person.objects.filter(user=demo_user).count(), 1)
        self.assertEqual(MealRecord.objects.filter(user=demo_user).count(), 1)
        self.assertEqual(ConfusionEvent.objects.filter(user=demo_user).count(), 1)
        self.assertEqual(PatientQuestionEvent.objects.filter(user=demo_user).count(), 1)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    @override_settings(
        DEMO_EXPERIENCE_ENABLED=True,
        DEMO_EXPERIENCE_USERNAME="demo-patient",
        DEMO_EXPERIENCE_SESSION_HOURS=168,
    )
    def test_demo_session_expires_after_7_days(self):
        response = self.client.post("/api/auth/demo/", format="json")
        demo_session = DemoExperienceSession.objects.get(
            session_user_id=response.data["user"]["id"],
        )

        self.assertLessEqual(
            abs((demo_session.expires_at - demo_session.created_at).total_seconds() - 7 * 24 * 60 * 60),
            1,
        )

    @override_settings(
        DEMO_EXPERIENCE_ENABLED=True,
        DEMO_EXPERIENCE_USERNAME="demo-patient",
    )
    def test_demo_record_changes_do_not_modify_template_records(self):
        response = self.client.post("/api/auth/demo/", format="json")
        demo_user = User.objects.get(id=response.data["user"]["id"])
        demo_meal_record = MealRecord.objects.get(user=demo_user)

        demo_meal_record.delete()

        self.assertEqual(MealRecord.objects.filter(user=demo_user).count(), 0)
        self.assertEqual(MealRecord.objects.filter(user=self.user).count(), 1)

    @override_settings(
        DEMO_EXPERIENCE_ENABLED=True,
        DEMO_EXPERIENCE_USERNAME="demo-patient",
    )
    def test_returns_the_current_demo_session(self):
        start_response = self.client.post(
            "/api/auth/demo/",
            {"mode": "example-scenes"},
            format="json",
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {start_response.data['access']}",
        )

        response = self.client.get("/api/auth/demo/session/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["session"]["mode"], "example-scenes")
        self.assertIn("expires_at", response.data["session"])

    @override_settings(
        DEMO_EXPERIENCE_ENABLED=True,
        DEMO_EXPERIENCE_USERNAME="demo-patient",
    )
    def test_expired_demo_session_requires_a_new_experience(self):
        start_response = self.client.post("/api/auth/demo/", format="json")
        demo_user = User.objects.get(id=start_response.data["user"]["id"])
        DemoExperienceSession.objects.filter(session_user=demo_user).update(
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Bearer {start_response.data['access']}",
        )

        response = self.client.get("/api/auth/demo/session/")

        self.assertEqual(response.status_code, 401)
        self.assertFalse(User.objects.filter(id=demo_user.id).exists())

    @override_settings(
        DEMO_EXPERIENCE_ENABLED=True,
        DEMO_EXPERIENCE_USERNAME="demo-patient",
    )
    def test_expired_demo_session_cleanup_deletes_cloned_data(self):
        response = self.client.post("/api/auth/demo/", format="json")
        demo_user_id = response.data["user"]["id"]
        DemoExperienceSession.objects.filter(session_user_id=demo_user_id).update(
            expires_at=timezone.now() - timedelta(seconds=1),
        )

        deleted_count = delete_expired_demo_sessions()

        self.assertEqual(deleted_count, 1)
        self.assertFalse(User.objects.filter(id=demo_user_id).exists())
        self.assertEqual(MealRecord.objects.filter(user_id=demo_user_id).count(), 0)
        self.assertEqual(MealRecord.objects.filter(user=self.user).count(), 1)

    @override_settings(
        DEMO_EXPERIENCE_ENABLED=True,
        DEMO_EXPERIENCE_USERNAME="missing-demo-user",
    )
    def test_returns_unavailable_when_configured_user_is_missing(self):
        response = self.client.post("/api/auth/demo/")

        self.assertEqual(response.status_code, 503)
