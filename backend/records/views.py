from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import (
    ConfusionEventSerializer,
    MealContextEventSerializer,
    MealRecordSerializer,
)


class MealRecordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="식사 기록 생성",
        description="현재 로그인한 사용자의 식사 기록을 생성합니다.",
        request=MealRecordSerializer,
        responses={201: MealRecordSerializer, 400: "Bad Request", 401: "Unauthorized"},
    )
    def post(self, request):
        serializer = MealRecordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        meal_record = serializer.save(user=request.user)

        response_serializer = MealRecordSerializer(meal_record)

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class MealContextEventView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="식사 맥락 이벤트 생성",
        description="현재 로그인한 사용자의 식사 인식 및 식사 맥락 이벤트를 생성합니다.",
        request=MealContextEventSerializer,
        responses={
            201: MealContextEventSerializer,
            400: "Bad Request",
            401: "Unauthorized",
        },
    )
    def post(self, request):
        serializer = MealContextEventSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)

        meal_context_event = serializer.save(user=request.user)

        response_serializer = MealContextEventSerializer(meal_context_event)

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


class ConfusionEventView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="혼동 이벤트 생성",
        description="현재 로그인한 사용자의 혼동 영역 선택 이벤트를 생성합니다.",
        request=ConfusionEventSerializer,
        responses={
            201: ConfusionEventSerializer,
            400: "Bad Request",
            401: "Unauthorized",
        },
    )
    def post(self, request):
        serializer = ConfusionEventSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        confusion_event = serializer.save(user=request.user)

        response_serializer = ConfusionEventSerializer(confusion_event)

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)