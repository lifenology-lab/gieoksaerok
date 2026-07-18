import { useState } from "react";
import { useNavigate } from "react-router-dom";

import CameraPreview from "../../../features/camera/components/CameraPreview.jsx";
import RecognitionToggleGroup from "../../../features/daily-mode/components/RecognitionToggleGroup";
import DailyModeBottomActions from "../../../features/daily-mode/components/DailyModeBottomActions";
import RecognitionStatusToast from "../../../features/daily-mode/components/RecognitionStatusToast.jsx";
import useRecognitionState from "../../../features/daily-mode/hooks/useRecognitionState.js";
import MealRecognitionCard from "../../../features/meal-recognition/components/MealRecognitionCard.jsx";
import MealRecognitionOverlay from "../../../features/meal-recognition/components/MealRecognitionOverlay.jsx";

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

  const handleMealRecognition = () => {
    startMealRecognition();

    setMealRecognitionResult({
      type: "recent_meal_found",
      title: "최근 식사 기록이 있어요",
      message: "2시간 전 식사 기록이 확인되었어요.",
      suggestion: "지금은 따뜻한 차를 마시며 쉬어볼까요?",
      primaryActionLabel: "식사 기록 보기",
      secondaryActionLabel: "안내 닫기",
    });
  };

  const handleViewMealRecord = () => {
    // TODO: 식사 기록 화면 구현
    console.log("식사 기록 보기");
  };

  const handleCloseMealRecognition = () => {
    setMealRecognitionResult(null);
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
        onMealRecognition={startMealRecognition}
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
            onPrimaryAction={handleViewMealRecord}
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
