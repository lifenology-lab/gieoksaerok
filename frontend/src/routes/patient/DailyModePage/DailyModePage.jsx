import { useState, useRef, useEffect } from "react";
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

import { mockMealRecordsEmpty } from "@/features/meal-recognition/data/mockMealRecords";

import {
  getMealContextResult,
  MEAL_CONTEXT_RESULT_TYPES,
} from "@/features/meal-recognition/utils/mealRecordUtils";

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

const MEAL_RECOGNITION_INTERVAL_MS = 3000;

export default function DailyModePage() {
  const nav = useNavigate();

  // CameraPreview 내부의 video 요소를 저장
  // 식사 인식 버튼 클릭 시 현재 카메라 화면을 MobileNet에 전달하기 위해 사용
  const cameraVideoElementRef = useRef(null);

  // 테스트용 이미지
  const testImageElementRef = useRef(null);

  const [mealRecognitionResult, setMealRecognitionResult] = useState(null);
  const [mealRecords, setMealRecords] = useState(mockMealRecordsEmpty);

  const mealRecordsRef = useRef(mealRecords);
  const mealRecognitionResultRef = useRef(mealRecognitionResult);
  const isMealRecognitionRunningRef = useRef(false);

  const {
    activeRecognitionType,
    statusMessage,
    startPersonRecognition,
    startMealRecognition,
    clearRecognition,
  } = useRecognitionState();

  const isMealRecognitionActive = activeRecognitionType === "meal";
  console.log("렌더링 확인:", {
    activeRecognitionType,
    isMealRecognitionActive,
  });

  useEffect(() => {
    mealRecordsRef.current = mealRecords;
  }, [mealRecords]);

  useEffect(() => {
    mealRecognitionResultRef.current = mealRecognitionResult;
  }, [mealRecognitionResult]);

  // 식사 인식이 활성화된 경우 즉시 1회 분석, 이후 정해진 간격마다 분석
  // 식사 인식이 비활성화된 경우 interval을 종료하고 식사 인식 중단
  useEffect(() => {
    console.log("interval useEffect 진입:", isMealRecognitionActive);
    if (!isMealRecognitionActive) {
      return;
    }

    console.log("주기적 식사 인식을 시작합니다.");

    runMealRecognitionCheck();

    const intervalId = window.setInterval(() => {
      console.log("식사 인식 interval tick");
      runMealRecognitionCheck();
    }, MEAL_RECOGNITION_INTERVAL_MS);

    return () => {
      console.log("주기적 식사 인식을 중단합니다.");
      window.clearInterval(intervalId);
    };
  }, [isMealRecognitionActive]);

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
      const response = await detectMealScene(imageElement, mealRecords);

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

  // 식사 인식 활성화/비활성화 토글
  const handleMealRecognitionToggle = () => {
    if (isMealRecognitionActive) {
      clearRecognition();
      setMealRecognitionResult(null);
      console.log("식사 인식 비활성화");
      return;
    }

    startMealRecognition();
    setMealRecognitionResult(null);
    console.log("식사 인식 활성화");
  };

  // 식사 인식 수행, 결과에 따라 반복 식사 안내 / 식사 기록 카드 보여주기
  const runMealRecognitionCheck = async () => {
    console.log("식사 인식 확인 시작");

    if (isMealRecognitionRunningRef.current) {
      console.log(
        "식사 인식이 이미 진행 중이에요. 추가 식사 확인은 진행하지 않을게요.",
      );
      return;
    }

    if (mealRecognitionResultRef.current) {
      console.log(
        "식사 안내 카드가 표시 중이에요. 추가 식사 확인은 진행하지 않을게요.",
      );
      return;
    }

    // 식사 기록 기반 식사 맥락 가져오기
    const mealContextResult = getMealContextResult(mealRecordsRef.current);

    // 최근 1시간 이내 식사 기록이 있는 경우 식사 장면 추론을 하지 않음
    if (
      mealContextResult.type ===
      MEAL_CONTEXT_RESULT_TYPES.MEAL_NOTICE_SUPPRESSED
    ) {
      console.log(
        `최근 식사 기록이 ${mealContextResult.elapsedMinutes}분 전에 있어 식사 인식을 건너 뜁니다.`,
      );
      return;
    }

    if (!cameraVideoElementRef.current) {
      console.log("카메라 video 요소가 아직 준비되지 않았어요.");
      return;
    }

    isMealRecognitionRunningRef.current = true;

    try {
      const response = await detectMealScene(
        cameraVideoElementRef.current,
        mealRecordsRef.current,
      );

      console.log("식사 인식 결과:", response);

      // 보여줄 카드가 없는 경우 종료
      if (!response.card) {
        setMealRecognitionResult(null);
        return;
      }

      // 식사 인식 결과에 따른 안내 (반복 식사 / 식사 기록)
      setMealRecognitionResult(response.card);
    } catch (error) {
      console.error("식사 인식 중 문제가 발생했어요:", error);
    } finally {
      isMealRecognitionRunningRef.current = false;
    }
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
        id: crypto.randomUUID(),
        mealType: "unknown",
        mealLabel: "식사",
        eatenAt: new Date().toISOString(),
        source: "patient_confirmed",
        detectionSource: "teachable_machine",
        menu: null,
        memo: "환자가 기록한 식사",
      };

      setMealRecords((prevMealRecords) => [newMealRecord, ...prevMealRecords]);

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
        onMealRecognition={handleMealRecognitionToggle}
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
