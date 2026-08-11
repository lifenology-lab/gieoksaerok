import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import ConversationRecorderControls from "@/features/conversation/components/ConversationRecorderControls.jsx";
import PatientQuestionAssistant from "@/features/patient-questions/components/PatientQuestionAssistant.jsx";
import useWakeWordMicrophone from "@/features/patient-questions/hooks/useWakeWordMicrophone.js";
import useConversationRecorder from "@/features/conversation/hooks/useConversationRecorder.js";
import usePatientVoiceRecorder from "@/features/conversation/hooks/usePatientVoiceRecorder.js";
import { CameraPreview } from "@/features/camera/components";
import useCamera from "@/features/camera/hooks/useCamera.js";
import {
  DailyModeBottomActions,
  RecognitionStatusToast,
  RecognitionToggleGroup,
} from "@/features/daily-mode/components";
import {
  DAILY_MODE_RECOGNITION_TYPES,
  DAILY_MODE_RETURN_RECOGNITION_KEY,
} from "@/features/daily-mode/constants/returnRecognition.js";
import useRecognitionState from "@/features/daily-mode/hooks/useRecognitionState";
import FaceLabelsOverlay from "@/features/face-recognition/components/FaceLabelsOverlay.jsx";
import UnknownPersonDialog from "@/features/face-recognition/components/UnknownPersonDialog.jsx";
import usePersonRecognition from "@/features/face-recognition/hooks/usePersonRecognition.js";
import {
  createMealRecord,
  detectMealScene,
  fetchRecentMealRecords,
} from "@/features/meal-recognition/api/mealRecognitionApi";
import {
  MealRecognitionCard,
  MealRecognitionOverlay,
} from "@/features/meal-recognition/components";
import {
  getMealContextResult,
  getSuggestedMealType,
  MEAL_CONTEXT_RESULT_TYPES,
} from "@/features/meal-recognition/utils/mealRecordUtils";

import "./DailyModePage.css";

const MEAL_RECOGNITION_INTERVAL_MS = 5000;

const WEEKDAY_LABELS = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
];

function formatDailyModeDate(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAY_LABELS[date.getDay()]})`;
}

function formatDailyModeTime(date) {
  const hours = date.getHours();
  const period = hours < 12 ? "오전" : "오후";
  const displayHours = hours % 12 || 12;
  const minutes = String(date.getMinutes()).padStart(2, "0");

  return `${period} ${String(displayHours).padStart(2, "0")}:${minutes}`;
}

export default function DailyModePage() {
  const nav = useNavigate();
  const camera = useCamera();

  // CameraPreview 내부의 video 요소를 저장
  // 식사 인식 버튼 클릭 시 현재 카메라 화면을 MobileNet에 전달하기 위해 사용
  const cameraVideoElementRef = useRef(null);

  const [mealRecognitionResult, setMealRecognitionResult] = useState(null);
  const [mealRecords, setMealRecords] = useState([]);
  const [isMealRecordSaving, setIsMealRecordSaving] = useState(false);
  const [mealRecordError, setMealRecordError] = useState("");
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [isQuestionAssistantOpen, setIsQuestionAssistantOpen] = useState(false);
  const [questionRecordingRequestId, setQuestionRecordingRequestId] = useState(0);
  const [isWakeWordModeEnabled, setIsWakeWordModeEnabled] = useState(false);
  const wakeWordMicrophone = useWakeWordMicrophone(isWakeWordModeEnabled);

  const mealRecordsRef = useRef(mealRecords);
  const mealRecognitionResultRef = useRef(mealRecognitionResult);
  const isMealRecognitionRunningRef = useRef(false);
  const isMealRecordsReadyRef = useRef(false);

  const {
    activeRecognitionType,
    statusMessage,
    startPersonRecognition,
    startMealRecognition,
    clearRecognition,
  } = useRecognitionState();

  const {
    recognizedFaces,
    statusMessage: personRecognitionStatusMessage,
    isRegisterDialogOpen,
    isSavingPerson,
    registrationError,
    refreshPeople,
    closeUnknownPersonDialog,
    saveUnknownPerson,
  } = usePersonRecognition({
    enabled: activeRecognitionType === "person",
    videoRef: camera.videoRef,
    isCameraReady: camera.isCameraReady,
  });

  const activeConversationPerson = recognizedFaces[0]?.person || null;
  const patientVoiceRecorder = usePatientVoiceRecorder();
  const conversationRecorder = useConversationRecorder({
    person: activeConversationPerson,
    onConversationSaved: refreshPeople,
  });

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentDateTime(new Date());
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const returnRecognitionType = window.sessionStorage.getItem(
      DAILY_MODE_RETURN_RECOGNITION_KEY,
    );

    if (returnRecognitionType !== DAILY_MODE_RECOGNITION_TYPES.PERSON) {
      return;
    }

    window.sessionStorage.removeItem(DAILY_MODE_RETURN_RECOGNITION_KEY);
    startPersonRecognition();
  }, [startPersonRecognition]);
  const isMealRecognitionActive = activeRecognitionType === "meal";

  useEffect(() => {
    mealRecordsRef.current = mealRecords;
  }, [mealRecords]);

  useEffect(() => {
    let isMounted = true;

    const loadRecentMealRecords = async () => {
      try {
        const recentMealRecords = await fetchRecentMealRecords();

        if (!isMounted) {
          return;
        }

        mealRecordsRef.current = recentMealRecords;
        setMealRecords(recentMealRecords);
      } catch {
        if (!isMounted) {
          return;
        }

        mealRecordsRef.current = [];
        setMealRecords([]);
      } finally {
        if (isMounted) {
          isMealRecordsReadyRef.current = true;
        }
      }
    };

    loadRecentMealRecords();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    mealRecognitionResultRef.current = mealRecognitionResult;
  }, [mealRecognitionResult]);

  // 식사 인식이 활성화된 경우 즉시 1회 분석, 이후 정해진 간격마다 분석
  // 식사 인식이 비활성화된 경우 interval을 종료하고 식사 인식 중단
  useEffect(() => {
    if (!isMealRecognitionActive) {
      return;
    }

    runMealRecognitionCheck();

    const intervalId = window.setInterval(() => {
      runMealRecognitionCheck();
    }, MEAL_RECOGNITION_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [isMealRecognitionActive]);

  // CameraPreview에서 준비된 video 요소를 받아 ref에 저장
  const handleVideoElementReady = (videoElement) => {
    cameraVideoElementRef.current = videoElement;
  };

  const handlePersonRecognitionToggle = () => {
    if (activeRecognitionType === DAILY_MODE_RECOGNITION_TYPES.PERSON) {
      clearRecognition();
      return;
    }

    startPersonRecognition();
  };

  const handleMealRecognitionToggle = () => {
    if (isMealRecognitionActive) {
      clearRecognition();
      setMealRecognitionResult(null);
      return;
    }

    startMealRecognition();
    setMealRecognitionResult(null);
  };

  // 식사 인식 수행, 결과에 따라 반복 식사 안내 / 식사 기록 카드 보여주기
  const runMealRecognitionCheck = async () => {
    if (!isMealRecordsReadyRef.current) {
      return;
    }

    if (isMealRecognitionRunningRef.current) {
      return;
    }

    if (mealRecognitionResultRef.current) {
      return;
    }

    const mealContextResult = getMealContextResult(mealRecordsRef.current);

    // 최근 1시간 이내 식사 기록이 있는 경우 모델 추론을 하지 않음
    if (
      mealContextResult.type ===
      MEAL_CONTEXT_RESULT_TYPES.MEAL_NOTICE_SUPPRESSED
    ) {
      return;
    }

    if (!cameraVideoElementRef.current) {
      return;
    }

    isMealRecognitionRunningRef.current = true;

    try {
      const response = await detectMealScene(
        cameraVideoElementRef.current,
        mealRecordsRef.current,
      );

      // 보여줄 카드가 없는 경우 종료
      if (!response.card) {
        setMealRecognitionResult(null);
        return;
      }

      // 식사 인식 결과에 따른 안내 (반복 식사 / 식사 기록)
      setMealRecognitionResult(response.card);
    } catch {
      setMealRecognitionResult(null);
    } finally {
      isMealRecognitionRunningRef.current = false;
    }
  };

  const handleCloseMealRecognition = () => {
    setMealRecognitionResult(null);
    setMealRecordError("");
  };

  const saveQuickMealRecord = async () => {
    if (
      !mealRecognitionResult ||
      mealRecognitionResult.type !== "meal_detected_without_record" ||
      isMealRecordSaving
    ) {
      return;
    }

    try {
      setIsMealRecordSaving(true);
      setMealRecordError("");

      const eatenAt = new Date().toISOString();
      const createdMealRecord = await createMealRecord({
        mealType: getSuggestedMealType(eatenAt),
        eatenAt,
        source: "patient_confirmed",
      });

      mealRecordsRef.current = [createdMealRecord, ...mealRecordsRef.current];
      setMealRecords((prevMealRecords) => [
        createdMealRecord,
        ...prevMealRecords,
      ]);

      const message =
        createdMealRecord.mealType === "unknown"
          ? "지금 시간으로 식사 기록을 남겨둘게요."
          : `${createdMealRecord.mealLabel}으로 기록했어요.`;

      setMealRecognitionResult({
        type: "meal_record_completed",
        title: "식사 기록이 완료되었어요",
        message,
        suggestion: "",
        primaryActionLabel: "확인",
        secondaryActionLabel: "닫기",
      });
    } catch {
      setMealRecordError("식사 기록을 저장하지 못했어요. 다시 시도해주세요.");
    } finally {
      setIsMealRecordSaving(false);
    }
  };

  const handleMealRecordPrimaryAction = () => {
    if (!mealRecognitionResult || isMealRecordSaving) {
      return;
    }

    if (mealRecognitionResult.type === "recent_meal_found") {
      nav("/patient/meal-records");
      return;
    }

    if (mealRecognitionResult.type === "meal_detected_without_record") {
      saveQuickMealRecord();
      return;
    }

    if (mealRecognitionResult.type === "meal_record_completed") {
      handleCloseMealRecognition();
    }
  };

  const handleOpenQuestionAssistant = () => {
    setIsQuestionAssistantOpen(true);
    setQuestionRecordingRequestId((requestId) => requestId + 1);
  };

  const handleToggleWakeWordMode = () => {
    setIsWakeWordModeEnabled((isEnabled) => !isEnabled);
  };

  const handleGoHome = () => {
    nav("/patient");
  };

  const handleOpenMemoryAlbum = (person) => {
    if (!person?.id) {
      return;
    }

    window.sessionStorage.setItem(
      DAILY_MODE_RETURN_RECOGNITION_KEY,
      DAILY_MODE_RECOGNITION_TYPES.PERSON,
    );

    nav(`/patient/memory-album/${person.id}`, {
      state: { person },
    });
  };

  const renderFaceConversationControls = (person) => {
    const activePersonId = activeConversationPerson?.id || null;
    const recordingPersonId = conversationRecorder.recordingPerson?.id || null;

    if (person.id !== activePersonId && person.id !== recordingPersonId) {
      return null;
    }

    return (
      <ConversationRecorderControls
        person={person}
        recordingStatus={conversationRecorder.recordingStatus}
        statusMessage={conversationRecorder.statusMessage}
        errorMessage={conversationRecorder.errorMessage}
        recordingPerson={conversationRecorder.recordingPerson}
        patientVoiceIsRegistered={patientVoiceRecorder.isRegistered}
        patientVoiceRecordingStatus={patientVoiceRecorder.recordingStatus}
        patientVoiceStatusMessage={patientVoiceRecorder.statusMessage}
        patientVoiceErrorMessage={patientVoiceRecorder.errorMessage}
        onStartPatientVoiceRecording={patientVoiceRecorder.startRecording}
        onStopPatientVoiceRecording={patientVoiceRecorder.stopRecording}
        onStartRecording={conversationRecorder.startRecording}
        onStopRecording={conversationRecorder.stopRecording}
      />
    );
  };

  const recognitionStatusMessage =
    activeRecognitionType === "person"
      ? personRecognitionStatusMessage
      : statusMessage;

  return (
    <main className="daily-mode-page">
      <CameraPreview {...camera} onVideoElementReady={handleVideoElementReady}>
        <FaceLabelsOverlay
          faces={recognizedFaces}
          onOpenMemoryAlbum={handleOpenMemoryAlbum}
          renderFaceActions={renderFaceConversationControls}
        />
      </CameraPreview>

      <section className="daily-mode-page__date-time" aria-live="polite">
        <p>{formatDailyModeDate(currentDateTime)}</p>
        <strong>{formatDailyModeTime(currentDateTime)}</strong>
        <span aria-hidden="true" />
      </section>

      <RecognitionToggleGroup
        activeRecognitionType={activeRecognitionType}
        onPersonRecognition={handlePersonRecognitionToggle}
        onMealRecognition={handleMealRecognitionToggle}
      />

      <RecognitionStatusToast message={recognitionStatusMessage} />

      <UnknownPersonDialog
        open={isRegisterDialogOpen && !isQuestionAssistantOpen}
        isSaving={isSavingPerson}
        errorMessage={registrationError}
        onClose={closeUnknownPersonDialog}
        onSubmit={saveUnknownPerson}
      />

      <MealRecognitionOverlay isOpen={Boolean(mealRecognitionResult)}>
        {mealRecognitionResult && (
          <MealRecognitionCard
            title={mealRecognitionResult.title}
            message={mealRecognitionResult.message}
            suggestion={mealRecognitionResult.suggestion}
            primaryActionLabel={mealRecognitionResult.primaryActionLabel}
            secondaryActionLabel={mealRecognitionResult.secondaryActionLabel}
            errorMessage={mealRecordError}
            isActionDisabled={isMealRecordSaving}
            onPrimaryAction={handleMealRecordPrimaryAction}
            onSecondaryAction={handleCloseMealRecognition}
          />
        )}
      </MealRecognitionOverlay>

      <PatientQuestionAssistant
        open={isQuestionAssistantOpen}
        onClose={() => setIsQuestionAssistantOpen(false)}
        recordingRequestId={questionRecordingRequestId}
        recognizedPerson={activeConversationPerson}
        isUnknownPersonDetected={isRegisterDialogOpen}
        onRequestPersonRecognition={startPersonRecognition}
        onRegisterUnknownPerson={() => setIsQuestionAssistantOpen(false)}
        onDismissUnknownPersonRegistration={() => {
          closeUnknownPersonDialog();
          clearRecognition();
        }}
      />

      <DailyModeBottomActions
        isWakeWordModeEnabled={isWakeWordModeEnabled}
        wakeWordErrorMessage={wakeWordMicrophone.errorMessage}
        wakeWordMicrophoneStatus={wakeWordMicrophone.status}
        isWakeWordVoiceDetected={wakeWordMicrophone.isVoiceDetected}
        onOpenQuestionAssistant={handleOpenQuestionAssistant}
        onGoHome={handleGoHome}
        onToggleWakeWordMode={handleToggleWakeWordMode}
      />
    </main>
  );
}
