export default function CameraPermissionNotice({ message, onRetry }) {
  return (
    <section className="camera-permission-notice">
      <div className="camera-permission-notice__card">
        <span className="camera-permission-notice__icon" aria-hidden="true">
          ◉
        </span>
        <p className="camera-permission-notice__eyebrow">카메라 권한 확인</p>
        <h2>카메라를 사용할 수 없어요</h2>

        <p>
          일상 모드를 사용하려면 카메라 권한이 필요해요. 브라우저 설정에서
          카메라 접근을 허용한 뒤 다시 시도해 주세요.
        </p>

        {message && <p className="camera-permission-notice__detail">{message}</p>}

        <button type="button" onClick={onRetry}>
          다시 시도하기
        </button>
      </div>
    </section>
  );
}
