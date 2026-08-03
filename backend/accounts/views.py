from drf_spectacular.utils import extend_schema
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
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
