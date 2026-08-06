export default function MealRecognitionCard({
  title,
  message,
  suggestion,
  primaryActionLabel = "식사 기록 보기",
  secondaryActionLabel = "안내 닫기",
  errorMessage = "",
  isActionDisabled = false,
  onPrimaryAction,
  onSecondaryAction,
}) {
  return (
    <article className="meal-recognition-card">
      <h3>{title}</h3>

      <p>{message}</p>

      {suggestion && <p>{suggestion}</p>}

      {errorMessage && <p className="meal-recognition-card__error">{errorMessage}</p>}

      <div className="meal-recognition-card__actions">
        <button type="button" disabled={isActionDisabled} onClick={onPrimaryAction}>
          {primaryActionLabel}
        </button>
        <button type="button" disabled={isActionDisabled} onClick={onSecondaryAction}>
          {secondaryActionLabel}
        </button>
      </div>

    </article>
  );
}
