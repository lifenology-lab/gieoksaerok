export default function CameraPermissionNotice({ message, onRetry }) {
  return (
    <section className="camera-permission-notice">
      <h2>카메라를 사용할 수 없어요</h2>

      <p>
        일상 모드를 체험하려면 카메라 권한이 필요합니다. 브라우저에서 카메라
        접근을 허용했는지 확인해주세요.
      </p>

      {message && <p>{message}</p>}

      <button type="button" onClick={onRetry}>
        다시 시도하기
      </button>
    </section>
  );
}
