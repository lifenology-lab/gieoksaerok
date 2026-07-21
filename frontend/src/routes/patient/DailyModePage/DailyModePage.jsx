import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

import { CameraPreview } from "@/features/camera/components";
import {
  DailyModeBottomActions,
  RecognitionStatusToast,
  RecognitionToggleGroup,
} from "@/features/daily-mode/components";
import useRecognitionState from "@/features/daily-mode/hooks/useRecognitionState";
import {
  MealRecognitionCard,
  MealRecognitionOverlay,
} from "@/features/meal-recognition/components";
import { detectMealScene } from "@/features/meal-recognition/api/mealRecognitionApi";

import "./DailyModePage.css";
const TEST_IMAGE_GROUPS = [
  {
    id: "meal",
    title: "식사 상황 이미지",
    images: [
      {
        id: "meal-1",
        label: "식사 이미지 1",
        src: "/meal-test-images/meal-1.jpg",
      },
      {
        id: "meal-2",
        label: "식사 이미지 2",
        src: "/meal-test-images/meal-2.jpg",
      },
      {
        id: "my-meal-1",
        label: "직접 촬영 식사 이미지",
        src: "/meal-test-images/my-meal-1.jpg",
      },
    ],
  },
  {
    id: "non-meal",
    title: "비식사 상황 이미지",
    images: [
      {
        id: "non-meal-1",
        label: "비식사 이미지 1",
        src: "/meal-test-images/non-meal-1.jpg",
      },
      {
        id: "non-meal-2",
        label: "비식사 이미지 2",
        src: "/meal-test-images/non-meal-2.jpg",
      },
      {
        id: "my-non-meal-1",
        label: "직접 촬영 비식사 이미지",
        src: "/meal-test-images/my-non-meal-1.jpg",
      },
    ],
  },
];

export default function DailyModePage() {
  const nav = useNavigate();

  // CameraPreview 내부의 video 요소를 저장
  // 식사 인식 버튼 클릭 시 현재 카메라 화면을 MobileNet에 전달하기 위해 사용
  const cameraVideoElementRef = useRef(null);

  // 테스트용 이미지
  const testImageElementRef = useRef(null);

  const [mealRecognitionResult, setMealRecognitionResult] = useState(null);

  const {
    activeRecognitionType,
    statusMessage,
    startPersonRecognition,
    startMealRecognition,
  } = useRecognitionState();

  // 테스트용 식사 인식 이미지 분류 함수
  const handleTestImageMealRecognition = (imageSrc) => {
    startMealRecognition();
    setMealRecognitionResult(null);

    const imageElement = testImageElementRef.current;

    if (!imageElement) {
      console.log("테스트 이미지 요소가 준비되지 않았어요.");
      return;
    }

    imageElement.onload = async () => {
      const response = await detectMealScene(imageElement);

      if (!response.isMealScene) {
        console.log("식사 상황으로 인식되지 않았어요.", response.predictions);
        setMealRecognitionResult(null);
        return;
      }

      setMealRecognitionResult(response.card);
    };

    imageElement.src = imageSrc;
  };

  // CameraPreview에서 준비된 video 요소를 받아 ref에 저장
  const handleVideoElementReady = (videoElement) => {
    cameraVideoElementRef.current = videoElement;
  };

  const handleMealRecognition = async () => {
    startMealRecognition();
    setMealRecognitionResult(null);

    if (!cameraVideoElementRef.current) {
      console.log("카메라 요소가 아직 준비되지 않았어요.");
      return;
    }

    // 현재 카메라 화면을 MobileNet 기반 식사 인식 API에 전달
    const response = await detectMealScene(cameraVideoElementRef.current);

    // 식사 상황이 아닌 경우 별도 안내 없이 종료
    if (!response.isMealScene) {
      setMealRecognitionResult(null);
      return;
    }

    // 식사 상황인 경우 최근 식사 기록 여부에 따라 카드 표시
    setMealRecognitionResult(response.card);
  };

  const handleCloseMealRecognition = () => {
    setMealRecognitionResult(null);
  };

  const handleMealRecordPrimaryAction = () => {
    // 현재 처리할 식사 인식 결과가 없는 경우
    if (!mealRecognitionResult) {
      return;
    }

    // 최근 식사 기록이 있는데 식사가 인식된 경우
    if (mealRecognitionResult.type === "recent_meal_found") {
      // TODO: DB 연결 후 DB 기록 보여주기
      console.log("식사 기록 보기");
      return;
    }

    // 최근 식사 기록 없이 식사가 인식된 경우
    if (mealRecognitionResult.type === "meal_detected_without_record") {
      const newMealRecord = {
        mealType: "unknown",
        mealLabel: "식사",
        eatenAt: new Date().toISOString(),
        createdBy: "patient",
        detectionSource: "mobilenet_rule", // TODO: fine-tuning 모델 연결 후 source 정리
        menu: null,
        memo: "환자가 기록한 식사",
      };

      console.log("환자 식사 기록 생성:", newMealRecord);

      setMealRecognitionResult({
        type: "meal_record_completed",
        title: "식사 기록이 완료되었어요",
        message: "오늘 식사 기록에 남겨둘게요.",
        suggestion: "",
        primaryActionLabel: "확인",
        secondaryActionLabel: "닫기",
      });

      return;
    }

    // 식사 기록이 완료된 경우
    if (mealRecognitionResult.type === "meal_record_completed") {
      setMealRecognitionResult(null);
    }
  };

  const handleGoConfusion = () => {
    nav("/patient/confusion");
  };

  const handleGoHome = () => {
    nav("/patient");
  };

  return (
    <main className="daily-mode-page">
      <CameraPreview onVideoElementReady={handleVideoElementReady} />

      <RecognitionToggleGroup
        activeRecognitionType={activeRecognitionType}
        onPersonRecognition={startPersonRecognition}
        onMealRecognition={handleMealRecognition}
      />

      <section className="daily-mode-page__test-panel">
        <p>개발용 이미지 테스트</p>

        {TEST_IMAGE_GROUPS.map((group) => (
          <div key={group.id} className="daily-mode-page__test-group">
            <p>{group.title}</p>

            {group.images.map((image) => (
              <button
                key={image.id}
                type="button"
                onClick={() => handleTestImageMealRecognition(image.src)}
              >
                {image.label}
              </button>
            ))}
          </div>
        ))}
      </section>

      <img ref={testImageElementRef} alt="" style={{ display: "none" }} />

      <RecognitionStatusToast message={statusMessage} />

      <MealRecognitionOverlay isOpen={Boolean(mealRecognitionResult)}>
        {mealRecognitionResult && (
          <MealRecognitionCard
            title={mealRecognitionResult.title}
            message={mealRecognitionResult.message}
            suggestion={mealRecognitionResult.suggestion}
            primaryActionLabel={mealRecognitionResult.primaryActionLabel}
            secondaryActionLabel={mealRecognitionResult.secondaryActionLabel}
            onPrimaryAction={handleMealRecordPrimaryAction}
            onSecondaryAction={handleCloseMealRecognition}
          />
        )}
      </MealRecognitionOverlay>

      <DailyModeBottomActions
        onGoConfusion={handleGoConfusion}
        onGoHome={handleGoHome}
      />
    </main>
  );
}
