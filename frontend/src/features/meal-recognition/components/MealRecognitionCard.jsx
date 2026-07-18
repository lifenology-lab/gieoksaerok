export default function MealRecognitionCard({
  title,
  message,
  suggestion,
  primaryActionLabel = "식사 기록 보기",
  secondaryActionLabel = "안내 닫기",
  onPrimaryAction,
  onSecondaryAction,
}) {
  return (
    <article className="meal-recognition-card">
      <h3>{title}</h3>

      <p>{message}</p>

      {suggestion && <p>{suggestion}</p>}

      <div className="meal-recognition-card__actions">
        <button type="button" onClick={onPrimaryAction}>
          {primaryActionLabel}
        </button>
        <button type="button" onClick={onSecondaryAction}>
          {secondaryActionLabel}
        </button>
      </div>
    </article>
  );
}
