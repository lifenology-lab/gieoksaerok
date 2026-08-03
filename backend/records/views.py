from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import ConfusionEvent, MealContextEvent, MealRecord
from .serializers import (
    ConfusionEventSerializer,
    MealContextEventSerializer,
    MealRecordSerializer,
)


class MealRecordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="식사 기록 목록 조회",
        description="현재 로그인한 사용자의 식사 기록 목록을 최신순으로 조회합니다.",
        responses={200: MealRecordSerializer(many=True), 401: "Unauthorized"},
    )
    def get(self, request):
        meal_records = MealRecord.objects.filter(user=request.user).order_by(
            "-eaten_at",
            "-created_at",
        )

        serializer = MealRecordSerializer(meal_records, many=True)

        return Response(serializer.data, status=status.HTTP_200_OK)

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

class RecentMealRecordView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="최근 식사 기록 조회",
        description="현재 로그인한 사용자의 최근 식사 기록을 최신순으로 최대 5개 조회합니다.",
        responses={200: MealRecordSerializer(many=True), 401: "Unauthorized"},
    )
    def get(self, request):
        meal_records = MealRecord.objects.filter(user=request.user).order_by(
            "-eaten_at",
            "-created_at",
        )[:5]

        serializer = MealRecordSerializer(meal_records, many=True)

        return Response(serializer.data, status=status.HTTP_200_OK)

class MealContextEventView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        operation_id="식사 맥락 이벤트 목록 조회",
        description="현재 로그인한 사용자의 식사 인식 및 식사 맥락 이벤트 목록을 최신순으로 조회합니다.",
        responses={200: MealContextEventSerializer(many=True), 401: "Unauthorized"},
    )
    def get(self, request):
        meal_context_events = MealContextEvent.objects.filter(
            user=request.user,
        ).order_by(
            "-detected_at",
            "-created_at",
        )

        serializer = MealContextEventSerializer(meal_context_events, many=True)

        return Response(serializer.data, status=status.HTTP_200_OK)

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
        operation_id="혼동 이벤트 목록 조회",
        description="현재 로그인한 사용자의 혼동 영역 선택 이벤트 목록을 최신순으로 조회합니다.",
        responses={200: ConfusionEventSerializer(many=True), 401: "Unauthorized"},
    )
    def get(self, request):
        confusion_events = ConfusionEvent.objects.filter(user=request.user).order_by(
            "-occurred_at",
            "-created_at",
        )

        serializer = ConfusionEventSerializer(confusion_events, many=True)

        return Response(serializer.data, status=status.HTTP_200_OK)

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