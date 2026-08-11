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

export default function DailyModeBottomActions({
  onOpenQuestionAssistant,
  onGoHome,
}) {
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
        <button
          className="daily-mode-page__glass-button daily-mode-page__glass-button--help"
          type="button"
          onClick={onOpenQuestionAssistant}
        >
          <span className="daily-mode-page__glass-icon daily-mode-page__glass-icon--help">
            <HelpIcon />
          </span>
          <span>새록이에게 말하기</span>
        </button>
      </section>
    </>
  );
}
