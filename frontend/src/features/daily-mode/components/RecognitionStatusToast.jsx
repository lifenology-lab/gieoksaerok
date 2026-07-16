export default function RecognitionStatusToast({ message }) {
  if (!message) {
    return null;
  }

  return (
    <section className="daily-mode-page__status">
      <p>{message}</p>
    </section>
  );
}
