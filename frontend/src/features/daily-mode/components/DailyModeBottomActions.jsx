function HomeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M4 11.2 12 4l8 7.2" />
      <path d="M6.5 10.4V20h11v-9.6" />
      <path d="M9.5 20v-5.8h5V20" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M9.4 9.1a3 3 0 1 1 4.9 2.3c-1.1.9-2.1 1.5-2.1 3.1" />
      <path d="M12 18.2h.01" />
    </svg>
  );
}

function MicrophoneIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <rect x="8.5" y="3" width="7" height="12" rx="3.5" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
      <path d="M8.5 21h7" />
    </svg>
  );
}

export default function DailyModeBottomActions({
  isWakeWordModeEnabled,
  isWakeWordVoiceDetected,
  onOpenQuestionAssistant,
  onGoHome,
  onToggleWakeWordMode,
  wakeWordErrorMessage,
  wakeWordMicrophoneStatus,
}) {
  const wakeWordStatusTitle = wakeWordErrorMessage
    ? "마이크를 사용할 수 없어요"
    : wakeWordMicrophoneStatus === "connecting"
      ? "마이크를 켜고 있어요"
      : isWakeWordVoiceDetected
        ? "말씀을 감지했어요"
        : "새록아 모드가 켜졌어요";
  const wakeWordStatusMessage = wakeWordErrorMessage
    || (wakeWordMicrophoneStatus === "connecting"
      ? "마이크 연결을 확인하고 있어요."
      : isWakeWordVoiceDetected
        ? "호출어를 감지할 준비를 하고 있어요."
        : "마이크가 켜져 있어요. 새록아라고 불러 주세요.");

  return (
    <>
      <section className="daily-mode-page__home-actions">
        <button
          className="daily-mode-page__glass-button"
          type="button"
          onClick={onGoHome}
        >
          <span className="daily-mode-page__glass-icon">
            <HomeIcon />
          </span>
          <span>홈으로 돌아가기</span>
        </button>
      </section>

      <section className="daily-mode-page__bottom-actions">
        {isWakeWordModeEnabled && (
          <div
            className={`daily-mode-page__wake-word-status ${wakeWordErrorMessage ? "is-error" : ""}`}
            role={wakeWordErrorMessage ? "alert" : "status"}
          >
            <span aria-hidden="true" />
            <div>
              <strong>{wakeWordStatusTitle}</strong>
              <p>{wakeWordStatusMessage}</p>
            </div>
          </div>
        )}

        <button
          className={`daily-mode-page__glass-button daily-mode-page__glass-button--wake-word ${isWakeWordModeEnabled ? "daily-mode-page__glass-button--active" : ""}`}
          type="button"
          aria-pressed={isWakeWordModeEnabled}
          onClick={onToggleWakeWordMode}
        >
          <span className="daily-mode-page__glass-icon daily-mode-page__glass-icon--wake-word">
            <MicrophoneIcon />
          </span>
          <span>
            {isWakeWordModeEnabled ? "새록아 모드 끄기" : "새록아 모드 켜기"}
          </span>
        </button>

        <button
          className="daily-mode-page__glass-button daily-mode-page__glass-button--help"
          type="button"
          onClick={onOpenQuestionAssistant}
        >
          <span className="daily-mode-page__glass-icon daily-mode-page__glass-icon--help">
            <HelpIcon />
          </span>
          <span>기억새록에게 물어보기</span>
        </button>
      </section>
    </>
  );
}
