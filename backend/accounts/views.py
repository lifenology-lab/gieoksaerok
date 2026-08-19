from drf_spectacular.utils import extend_schema
from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from .request_serializers import SignUpRequestSerializer, TokenRefreshRequestSerializer
from .serializers import UserSerializer, SignInSerializer

User = get_user_model()


class SignUpView(APIView):
    @extend_schema(
        operation_id="회원가입",
        description="회원가입을 진행합니다.",
        request=SignUpRequestSerializer,
        responses={201: UserSerializer, 400: "Bad Request"},
    )
    def post(self, request):
        request_serializer = SignUpRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        username = request_serializer.validated_data["username"]
        password = request_serializer.validated_data["password"]
        name = request_serializer.validated_data.get("name", "")
        email = request_serializer.validated_data.get("email", "")

        if User.objects.filter(username=username).exists():
            return Response(
                {"detail": "이미 사용 중인 username입니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if email and User.objects.filter(email=email).exists():
            return Response(
                {"detail": "이미 사용 중인 email입니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.create_user(
            username=username,
            password=password,
            email=email,
            name=name,
        )

        response_serializer = UserSerializer(user)

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

# Simple JWT 기본 view와 바로 연결됨
class SignInView(TokenObtainPairView):
    serializer_class = SignInSerializer


class DemoExperienceView(APIView):
    """온라인 전시에서 사용할 사전 구성 데모 계정의 토큰을 발급합니다."""

    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        operation_id="데모 체험 시작",
        description="활성화된 전시용 데모 계정으로 체험 세션을 시작합니다.",
        responses={200: SignInSerializer, 404: "Not Found", 503: "Demo account unavailable"},
    )
    def post(self, request):
        if not settings.DEMO_EXPERIENCE_ENABLED:
            return Response(status=status.HTTP_404_NOT_FOUND)

        username = settings.DEMO_EXPERIENCE_USERNAME.strip()
        user = User.objects.filter(username=username, is_active=True).first()

        if not username or user is None:
            return Response(
                {"detail": "데모 계정이 아직 준비되지 않았어요."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "refresh": str(refresh),
                "access": str(refresh.access_token),
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_200_OK,
        )

class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="사용자 정보 조회",
        description="현재 로그인한 사용자의 정보를 조회합니다.",
        responses={200: UserSerializer, 401: "Unauthorized"},
    )
    def get(self, request):
        serializer = UserSerializer(request.user)

        return Response(serializer.data)

class SignOutView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="로그아웃",
        description="refresh token을 blacklist에 등록해 로그아웃을 처리합니다.",
        request=TokenRefreshRequestSerializer,
        responses={204: None, 400: "Bad Request", 401: "Unauthorized"},
    )
    def post(self, request):
        request_serializer = TokenRefreshRequestSerializer(data=request.data)
        request_serializer.is_valid(raise_exception=True)

        refresh_token = request_serializer.validated_data["refresh"]

        try:
            token = RefreshToken(refresh_token)
            token.blacklist()
        except TokenError:
            return Response(
                {"detail": "유효하지 않은 refresh token입니다."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(status=status.HTTP_204_NO_CONTENT)
