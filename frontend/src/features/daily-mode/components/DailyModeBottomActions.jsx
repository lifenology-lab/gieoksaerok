export default function DailyModeBottomActions({ onGoConfusion, onGoHome }) {
  return (
    <section className="daily-mode-page__bottom-actions">
      <p>하단 버튼 영역</p>
      <button type="button" onClick={onGoConfusion}>
        잘 모르겠어요
      </button>
      <button type="button" onClick={onGoHome}>
        홈으로 돌아가기
      </button>
    </section>
  );
}
