export default function RecognitionStatusToast({ message, isLoading = false }) {
  if (!message) {
    return null;
  }

  return (
    <section className="daily-mode-page__status" role="status" aria-live="polite">
      {isLoading && <span className="daily-mode-page__status-loader" aria-hidden="true" />}
      <p>{message}</p>
    </section>
  );
}
