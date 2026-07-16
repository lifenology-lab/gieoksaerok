import CameraPermissionNotice from "./CameraPermissionNotice";
import useCamera from "../hooks/useCamera";

export default function CameraPreview() {
  const { videoRef, isCameraReady, cameraError, startCamera } = useCamera();

  if (cameraError) {
    return (
      <section className="daily-mode-page__camera-area">
        <CameraPermissionNotice message={cameraError} onRetry={startCamera} />
      </section>
    );
  }

  return (
    <section className="daily-mode-page__camera-area">
      {!isCameraReady && <p>카메라를 준비하고 있어요.</p>}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="daily-mode-page__camera-video"
      />
    </section>
  );
}
