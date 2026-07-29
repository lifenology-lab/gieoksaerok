export default function RecognitionToggleGroup({
  activeRecognitionType,
  onPersonRecognition,
  onMealRecognition,
}) {
  return (
    <section className="daily-mode-page__top-actions">
      <p>인식 활성화 영역</p>
      <button type="button" onClick={onPersonRecognition}>
        {activeRecognitionType === "person" ? "인물 인식 활성화" : "인물 인식"}
      </button>
      <button type="button" onClick={onMealRecognition}>
        {activeRecognitionType === "meal" ? "식사 인식 끄기" : "식사 인식 켜기"}
      </button>
    </section>
  );
}
