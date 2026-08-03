import { useEffect } from "react";

import CameraPermissionNotice from "./CameraPermissionNotice";

export default function CameraPreview({
  videoRef,
  isCameraReady,
  cameraError,
  startCamera,
  onVideoElementReady,
  children,
}) {
  useEffect(() => {
    if (!videoRef?.current || !onVideoElementReady) {
      return;
    }

    onVideoElementReady(videoRef.current);
  }, [isCameraReady, onVideoElementReady, videoRef]);

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

      {children}
    </section>
  );
}
