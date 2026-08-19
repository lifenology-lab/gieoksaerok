from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient


User = get_user_model()


class DemoExperienceViewTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="demo-patient",
            password="not-used-by-demo-endpoint",
            name="데모 환자",
        )

    @override_settings(DEMO_EXPERIENCE_ENABLED=False)
    def test_returns_not_found_when_demo_is_disabled(self):
        response = self.client.post("/api/auth/demo/")

        self.assertEqual(response.status_code, 404)

    @override_settings(
        DEMO_EXPERIENCE_ENABLED=True,
        DEMO_EXPERIENCE_USERNAME="gieoksaerok",
    )
    def test_returns_tokens_for_configured_demo_user(self):
        response = self.client.post("/api/auth/demo/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["id"], self.user.id)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)

    @override_settings(
        DEMO_EXPERIENCE_ENABLED=True,
        DEMO_EXPERIENCE_USERNAME="missing-demo-user",
    )
    def test_returns_unavailable_when_configured_user_is_missing(self):
        response = self.client.post("/api/auth/demo/")

        self.assertEqual(response.status_code, 503)
