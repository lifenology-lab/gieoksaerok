import { useState } from "react";

export default function useRecognitionState() {
  const [activeRecognitionType, setActiveRecognitionType] = useState(null);
  const [statusMessage, setStatusMessage] = useState("");

  const startPersonRecognition = () => {
    setActiveRecognitionType("person");
    setStatusMessage("앞에 있는 사람을 확인하고 있어요.");
  };

  const startMealRecognition = () => {
    setActiveRecognitionType("meal");
    setStatusMessage("식사 인식 중입니다.");
  };

  const clearRecognition = () => {
    setActiveRecognitionType(null);
    setStatusMessage("");
  };

  return {
    activeRecognitionType,
    statusMessage,
    startPersonRecognition,
    startMealRecognition,
    clearRecognition,
  };
}
