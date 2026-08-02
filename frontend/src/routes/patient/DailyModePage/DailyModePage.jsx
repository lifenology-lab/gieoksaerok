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

import "./DailyModePage.css";

export default function DailyModePage() {
  const nav = useNavigate();
  const camera = useCamera();

  const {
    activeRecognitionType,
    statusMessage,
    startPersonRecognition,
    startMealRecognition,
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

      <RecognitionToggleGroup
        activeRecognitionType={activeRecognitionType}
        onPersonRecognition={startPersonRecognition}
        onMealRecognition={startMealRecognition}
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

      <DailyModeBottomActions
        onGoConfusion={handleGoConfusion}
        onGoHome={handleGoHome}
      />
    </main>
  );
}
