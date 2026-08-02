import { useEffect, useState } from "react";

const PATIENT_VOICE_SAMPLE_SENTENCES = [
  "안녕하세요. 저는 오늘 기분이 좋고 편안합니다.",
  "지금은 가족과 함께 대화를 나누고 있습니다.",
  "내 목소리를 기억해서 대화를 잘 구분해주세요.",
];

export default function ConversationRecorderControls({
  person,
  recordingStatus,
  statusMessage,
  errorMessage,
  lastConversation,
  recordingPerson,
  patientVoiceIsRegistered,
  patientVoiceRecordingStatus,
  patientVoiceStatusMessage,
  patientVoiceErrorMessage,
  onStartPatientVoiceRecording,
  onStopPatientVoiceRecording,
  onStartRecording,
  onStopRecording,
}) {
  const [isPatientVoiceDialogOpen, setIsPatientVoiceDialogOpen] =
    useState(false);
  const isRecording = recordingStatus === "recording";
  const isTranscribing = recordingStatus === "transcribing";
  const isPatientVoiceLoading = patientVoiceRecordingStatus === "loading";
  const isPatientVoiceRecording = patientVoiceRecordingStatus === "recording";
  const isPatientVoiceSaving = patientVoiceRecordingStatus === "saving";
  const isPatientVoiceBusy =
    isPatientVoiceLoading || isPatientVoiceRecording || isPatientVoiceSaving;
  const activePerson = isRecording || isTranscribing ? recordingPerson : person;
  const needsPatientVoiceRegistration =
    !patientVoiceIsRegistered || Boolean(patientVoiceErrorMessage);
  const canStart =
    Boolean(person) &&
    recordingStatus !== "recording" &&
    !isPatientVoiceBusy;
  const canRecordPatientVoice =
    !isRecording &&
    !isTranscribing &&
    !isPatientVoiceLoading &&
    !isPatientVoiceSaving;
  const shouldShowTranscript =
    lastConversation?.transcript &&
    (!person || lastConversation.person === person.id);
  const patientVoiceMessage =
    patientVoiceErrorMessage ||
    patientVoiceStatusMessage ||
    (isPatientVoiceLoading
      ? "환자 목소리 상태를 확인하고 있어요."
      : patientVoiceIsRegistered
        ? "등록되어 있어요. 오류가 계속되면 2~10초로 다시 등록해주세요."
        : "환자 목소리를 2~10초로 등록해야 대화를 구분할 수 있어요.");

  useEffect(() => {
    if (!isPatientVoiceDialogOpen || needsPatientVoiceRegistration) {
      return;
    }

    setIsPatientVoiceDialogOpen(false);
  }, [isPatientVoiceDialogOpen, needsPatientVoiceRegistration]);

  const handleStartRecording = () => {
    if (needsPatientVoiceRegistration) {
      setIsPatientVoiceDialogOpen(true);
      return;
    }

    onStartRecording();
  };

  const handleClosePatientVoiceDialog = () => {
    if (isPatientVoiceRecording || isPatientVoiceSaving) {
      return;
    }

    setIsPatientVoiceDialogOpen(false);
  };

  if (
    !activePerson &&
    !statusMessage &&
    !errorMessage &&
    !shouldShowTranscript
  ) {
    return null;
  }

  return (
    <section className="daily-mode-page__conversation-actions">
      {activePerson && (
        <p>
          <strong>{activePerson.name}</strong>
          <span>{activePerson.relationship}</span>
        </p>
      )}

      {isRecording ? (
        <button type="button" onClick={onStopRecording}>
          대화 종료
        </button>
      ) : (
        <button
          type="button"
          onClick={handleStartRecording}
          disabled={!canStart || isTranscribing}
        >
          {isTranscribing ? "변환 중" : "대화 시작"}
        </button>
      )}

      {(statusMessage || errorMessage) && (
        <p className={errorMessage ? "is-error" : ""}>
          {errorMessage || statusMessage}
        </p>
      )}

      {shouldShowTranscript && (
        <p className="daily-mode-page__conversation-transcript">
          {lastConversation.transcript}
        </p>
      )}

      {isPatientVoiceDialogOpen && (
        <div
          className="daily-mode-page__voice-dialog-backdrop"
          role="presentation"
        >
          <section
            className="daily-mode-page__dialog daily-mode-page__voice-dialog"
            aria-modal="true"
            role="dialog"
          >
            <h2>목소리를 등록해주세요</h2>
            <p className="daily-mode-page__voice-dialog-message">
              환자와 상대방의 말을 구분하려면 환자 목소리 샘플이 필요합니다.
              아래 문장을 편안한 속도로 읽어주세요.
            </p>

            <div className="daily-mode-page__voice-sample">
              {PATIENT_VOICE_SAMPLE_SENTENCES.map((sentence) => (
                <p key={sentence}>{sentence}</p>
              ))}
            </div>

            <p
              className={`daily-mode-page__voice-dialog-status ${
                patientVoiceErrorMessage ? "is-error" : ""
              }`}
            >
              {patientVoiceMessage}
            </p>

            <div className="daily-mode-page__dialog-actions">
              <button
                type="button"
                onClick={handleClosePatientVoiceDialog}
                disabled={isPatientVoiceRecording || isPatientVoiceSaving}
              >
                닫기
              </button>

              {isPatientVoiceRecording ? (
                <button type="button" onClick={onStopPatientVoiceRecording}>
                  녹음 종료
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onStartPatientVoiceRecording}
                  disabled={!canRecordPatientVoice}
                >
                  {isPatientVoiceSaving ? "저장 중" : "목소리 등록 시작"}
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
