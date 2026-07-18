export default function MealRecognitionOverlay({ isOpen, children }) {
  if (!isOpen) {
    return null;
  }

  return (
    <section className="meal-recognition-overlay">
      <div className="meal-recognition-overlay__content">{children}</div>
    </section>
  );
}
