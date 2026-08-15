import "./VoiceAssistantCard.css";

export default function VoiceAssistantCard({
  children,
  onClose,
  ariaLabelledBy,
  closeLabel = "도우미 닫기",
  className = "",
  cardClassName = "",
  closeClassName = "",
  isEmbedded = false,
}) {
  return (
    <section
      className={`voice-assistant-card${isEmbedded ? " is-embedded" : ""} ${className}`.trim()}
      role="dialog"
      aria-modal={isEmbedded ? undefined : "true"}
      aria-labelledby={ariaLabelledBy}
    >
      <article className={`voice-assistant-card__content ${cardClassName}`.trim()}>
        <button
          className={`voice-assistant-card__close ${closeClassName}`.trim()}
          type="button"
          aria-label={closeLabel}
          onClick={onClose}
        >
          ×
        </button>
        {children}
      </article>
    </section>
  );
}
