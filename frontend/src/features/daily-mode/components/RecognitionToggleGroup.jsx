function UserIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M12 12.2a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Z" />
      <path d="M4.8 20.2c.8-3.5 3.4-5.4 7.2-5.4s6.4 1.9 7.2 5.4" />
    </svg>
  );
}

function MealIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M7 3v18" />
      <path d="M4.8 3v5.4a2.2 2.2 0 1 0 4.4 0V3" />
      <path d="M15.2 3v18" />
      <path d="M15.2 3c2.6 1.4 4 3.4 4 6.2 0 2.3-1.3 3.8-4 4.4" />
    </svg>
  );
}

export default function RecognitionToggleGroup({
  activeRecognitionType,
  onPersonRecognition,
  onMealRecognition,
}) {
  return (
    <section className="daily-mode-page__top-actions">
      <button
        className={`daily-mode-page__glass-button ${
          activeRecognitionType === "person"
            ? "daily-mode-page__glass-button--active daily-mode-page__glass-button--person-active"
            : ""
        }`}
        type="button"
        aria-pressed={activeRecognitionType === "person"}
        onClick={onPersonRecognition}
      >
        <span className="daily-mode-page__glass-icon">
          <UserIcon />
        </span>
        <span>인물 인식</span>
      </button>
      <button
        className={`daily-mode-page__glass-button ${
          activeRecognitionType === "meal"
            ? "daily-mode-page__glass-button--active daily-mode-page__glass-button--meal-active"
            : ""
        }`}
        type="button"
        aria-pressed={activeRecognitionType === "meal"}
        onClick={onMealRecognition}
      >
        <span className="daily-mode-page__glass-icon daily-mode-page__glass-icon--meal">
          <MealIcon />
        </span>
        <span>식사 인식</span>
      </button>
    </section>
  );
}
