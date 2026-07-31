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
  const isRecording = recordingStatus === "recording";
  const isTranscribing = recordingStatus === "transcribing";
  const isPatientVoiceLoading = patientVoiceRecordingStatus === "loading";
  const isPatientVoiceRecording = patientVoiceRecordingStatus === "recording";
  const isPatientVoiceSaving = patientVoiceRecordingStatus === "saving";
  const isPatientVoiceBusy =
    isPatientVoiceLoading || isPatientVoiceRecording || isPatientVoiceSaving;
  const activePerson = isRecording || isTranscribing ? recordingPerson : person;
  const shouldShowPatientVoiceRegistration =
    Boolean(person) && !patientVoiceIsRegistered;
  const canStart =
    Boolean(person) &&
    patientVoiceIsRegistered &&
    recordingStatus !== "recording" &&
    !isPatientVoiceBusy;
  const shouldShowTranscript =
    lastConversation?.transcript &&
    (!person || lastConversation.person === person.id);
  const patientVoiceMessage =
    patientVoiceErrorMessage ||
    patientVoiceStatusMessage ||
    (isPatientVoiceLoading
      ? "환자 목소리 상태를 확인하고 있어요."
      : "환자 목소리를 등록해야 대화를 구분할 수 있어요.");

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

      {shouldShowPatientVoiceRegistration && (
        <div className="daily-mode-page__patient-voice">
          <p>
            <strong>환자 목소리</strong>
            <span className={patientVoiceErrorMessage ? "is-error" : ""}>
              {patientVoiceMessage}
            </span>
          </p>

          {isPatientVoiceRecording ? (
            <button type="button" onClick={onStopPatientVoiceRecording}>
              등록 종료
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartPatientVoiceRecording}
              disabled={isPatientVoiceLoading || isPatientVoiceSaving}
            >
              {isPatientVoiceSaving ? "저장 중" : "환자 목소리 등록"}
            </button>
          )}
        </div>
      )}

      {isRecording ? (
        <button type="button" onClick={onStopRecording}>
          대화 종료
        </button>
      ) : (
        <button
          type="button"
          onClick={onStartRecording}
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
    </section>
  );
}
