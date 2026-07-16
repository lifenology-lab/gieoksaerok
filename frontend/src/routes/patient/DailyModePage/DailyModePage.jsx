import { useNavigate } from "react-router-dom";

import CameraPreview from "../../../features/camera/components/CameraPreview.jsx";
import RecognitionToggleGroup from "../../../features/daily-mode/components/RecognitionToggleGroup";
import DailyModeBottomActions from "../../../features/daily-mode/components/DailyModeBottomActions";
import RecognitionStatusToast from "../../../features/daily-mode/components/RecognitionStatusToast.jsx";
import useRecognitionState from "../../../features/daily-mode/hooks/useRecognitionState.js";

import "./DailyModePage.css";

export default function DailyModePage() {
  const nav = useNavigate();

  const {
    activeRecognitionType,
    statusMessage,
    startPersonRecognition,
    startMealRecognition,
  } = useRecognitionState();

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

      <DailyModeBottomActions
        onGoConfusion={handleGoConfusion}
        onGoHome={handleGoHome}
      />
    </main>
  );
}
