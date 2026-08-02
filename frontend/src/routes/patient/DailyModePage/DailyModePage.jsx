import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import CameraPreview from "../../../features/camera/components/CameraPreview.jsx";
import useCamera from "../../../features/camera/hooks/useCamera.js";
import ConversationRecorderControls from "../../../features/conversation/components/ConversationRecorderControls.jsx";
import useConversationRecorder from "../../../features/conversation/hooks/useConversationRecorder.js";
import usePatientVoiceRecorder from "../../../features/conversation/hooks/usePatientVoiceRecorder.js";
import FaceLabelsOverlay from "../../../features/face-recognition/components/FaceLabelsOverlay.jsx";
import UnknownPersonDialog from "../../../features/face-recognition/components/UnknownPersonDialog.jsx";
import usePersonRecognition from "../../../features/face-recognition/hooks/usePersonRecognition.js";
import RecognitionToggleGroup from "../../../features/daily-mode/components/RecognitionToggleGroup";
import DailyModeBottomActions from "../../../features/daily-mode/components/DailyModeBottomActions";
import RecognitionStatusToast from "../../../features/daily-mode/components/RecognitionStatusToast.jsx";
import {
  DAILY_MODE_RECOGNITION_TYPES,
  DAILY_MODE_RETURN_RECOGNITION_KEY,
} from "../../../features/daily-mode/constants/returnRecognition.js";
import useRecognitionState from "../../../features/daily-mode/hooks/useRecognitionState.js";
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

const MEAL_RECOGNITION_INTERVAL_MS = 5000;

const MOCK_PATIENT_ID = "mock-patient-1"; // 임시 아이디

const MEAL_CONTEXT_USER_ACTIONS = {
  NONE: "none",
  VIEW_RECORD: "view_record",
  CREATE_RECORD: "create_record",
  DISMISS: "dismiss",
  CONFIRM: "confirm",
};

export default function DailyModePage() {
  const nav = useNavigate();
  const camera = useCamera();

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

  // 식사 맥락 이벤트 payload를 만드는 함수
  const buildMealContextEventPayload = ({
    response = null,
    contextResult = null,
    userAction = MEAL_CONTEXT_USER_ACTIONS.NONE,
  }) => {
    const recentMealRecord =
      response?.recentMealRecord || contextResult?.mealRecord || null;

    const contextResultType =
      response?.type || contextResult?.type || "unknown";

    const didRunModel = Boolean(response);

    return {
      patient_id: MOCK_PATIENT_ID,
      recent_meal_record_id: recentMealRecord?.id || null,
      detected_at: new Date().toISOString(),

      // 모델 추론을 실행한 경우에만 true/false 값을 저장
      // 최근 식사 기록 때문에 추론을 건너뛴 경우에는 null
      is_meal_scene: didRunModel ? response.isMealScene : null,

      // 모델 추론을 실행한 경우에만 확률 값을 저장
      // 추론을 건너뛴 경우에는 null
      meal_scene_probability: didRunModel
        ? (response.mealSceneProbability ?? null)
        : null,

      context_result: contextResultType,
      user_action: userAction,
    };
  };

  // 식사 맥락 관련 유저의 행동 payload를 만드는 함수
  const buildMealContextActionPayload = ({
    contextResult,
    recentMealRecordId = null,
    userAction,
  }) => {
    return {
      patient_id: MOCK_PATIENT_ID,
      recent_meal_record_id: recentMealRecordId,
      detected_at: new Date().toISOString(),
      is_meal_scene: null,
      meal_scene_probability: null,
      context_result: contextResult,
      user_action: userAction,
    };
  };

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

    const mealContextResult = getMealContextResult(mealRecordsRef.current);

    console.log("식사 기록 기반 맥락 판단:", mealContextResult);

    // 최근 1시간 이내 식사 기록이 있는 경우 모델 추론을 하지 않음
    if (
      mealContextResult.type ===
      MEAL_CONTEXT_RESULT_TYPES.MEAL_NOTICE_SUPPRESSED
    ) {
      const payload = buildMealContextEventPayload({
        response: null,
        contextResult: mealContextResult,
        userAction: MEAL_CONTEXT_USER_ACTIONS.NONE,
      });

      console.log("MealContextEvent payload:", payload);
      console.log(
        `최근 식사 기록이 ${mealContextResult.elapsedMinutes}분 전에 있어 식사 인식을 건너뜁니다.`,
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

      const payload = buildMealContextEventPayload({
        response,
        contextResult: null,
        userAction: MEAL_CONTEXT_USER_ACTIONS.NONE,
      });

      console.log("MealContextEvent payload:", payload);

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
    if (mealRecognitionResult) {
      const userAction =
        mealRecognitionResult.type === "meal_record_completed"
          ? MEAL_CONTEXT_USER_ACTIONS.CONFIRM
          : MEAL_CONTEXT_USER_ACTIONS.DISMISS;

      const actionPayload = buildMealContextActionPayload({
        contextResult: mealRecognitionResult.type,
        userAction,
      });

      console.log("MealContextEvent action payload:", actionPayload);
    }

    setMealRecognitionResult(null);
  };

  const handleMealRecordPrimaryAction = () => {
    // 현재 처리할 식사 인식 결과가 없는 경우
    if (!mealRecognitionResult) {
      return;
    }

    // 최근 식사 기록이 있는데 식사가 인식된 경우
    if (mealRecognitionResult.type === "recent_meal_found") {
      const actionPayload = buildMealContextActionPayload({
        contextResult: mealRecognitionResult.type,
        userAction: MEAL_CONTEXT_USER_ACTIONS.VIEW_RECORD,
      });

      console.log("MealContextEvent action payload:", actionPayload);
      console.log("식사 기록 보기");
      return;
    }

    // 최근 식사 기록 없이 식사가 인식된 경우
    if (mealRecognitionResult.type === "meal_detected_without_record") {
      const now = new Date().toISOString();

      const newMealRecord = {
        id: crypto.randomUUID(),
        mealType: "unknown",
        mealLabel: "식사",
        eatenAt: now,
        source: "patient_confirmed",
        detectionSource: "teachable_machine",
        menu: null,
        memo: "환자가 기록한 식사",
      };

      const actionPayload = buildMealContextActionPayload({
        contextResult: mealRecognitionResult.type,
        userAction: MEAL_CONTEXT_USER_ACTIONS.CREATE_RECORD,
      });

      console.log("MealContextEvent action payload:", actionPayload);

      // BE용 객체
      const mealRecordPayload = {
        patient_id: MOCK_PATIENT_ID,
        meal_type: "unknown",
        eaten_at: now,
        source: "patient_confirmed",
        menu: null,
        memo: "환자가 기록한 식사",
      };

      console.log("MealRecord payload:", mealRecordPayload);

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
      const actionPayload = buildMealContextActionPayload({
        contextResult: mealRecognitionResult.type,
        userAction: MEAL_CONTEXT_USER_ACTIONS.CONFIRM,
      });

      console.log("MealContextEvent action payload:", actionPayload);

      setMealRecognitionResult(null);
    }
  };

  const handleGoConfusion = () => {
    nav("/patient/confusion");
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

  const recognitionStatusMessage =
    activeRecognitionType === "person"
      ? personRecognitionStatusMessage
      : statusMessage;

  return (
    <main className="daily-mode-page">
      <CameraPreview {...camera}>
        <FaceLabelsOverlay
          faces={recognizedFaces}
          onOpenMemoryAlbum={handleOpenMemoryAlbum}
        />
      </CameraPreview>
      <CameraPreview onVideoElementReady={handleVideoElementReady} />

      <RecognitionToggleGroup
        activeRecognitionType={activeRecognitionType}
        onPersonRecognition={startPersonRecognition}
        onMealRecognition={handleMealRecognitionToggle}
      />

      <RecognitionStatusToast message={recognitionStatusMessage} />

      <ConversationRecorderControls
        person={activeConversationPerson}
        recordingStatus={conversationRecorder.recordingStatus}
        statusMessage={conversationRecorder.statusMessage}
        errorMessage={conversationRecorder.errorMessage}
        lastConversation={conversationRecorder.lastConversation}
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

      <UnknownPersonDialog
        open={isRegisterDialogOpen}
        isSaving={isSavingPerson}
        errorMessage={registrationError}
        onClose={closeUnknownPersonDialog}
        onSubmit={saveUnknownPerson}
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
