import { useState } from "react";
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

export default function DailyModePage() {
  const nav = useNavigate();
  const [mealRecognitionResult, setMealRecognitionResult] = useState(null);

  const {
    activeRecognitionType,
    statusMessage,
    startPersonRecognition,
    startMealRecognition,
  } = useRecognitionState();

  const handleMealRecognition = async () => {
    startMealRecognition();
    setMealRecognitionResult(null);

    const response = await detectMealScene();

    if (!response.isMealScene) {
      setMealRecognitionResult(null);
      return;
    }

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
        detectionSource: "camera_mock", // TODO: AI 연결 후 수정
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
      <CameraPreview />

      <RecognitionToggleGroup
        activeRecognitionType={activeRecognitionType}
        onPersonRecognition={startPersonRecognition}
        onMealRecognition={handleMealRecognition}
      />

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
