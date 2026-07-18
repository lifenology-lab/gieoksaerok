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

  const handleViewMealRecord = () => {
    // TODO: 식사 기록 화면 구현
    console.log("식사 기록 보기");
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
