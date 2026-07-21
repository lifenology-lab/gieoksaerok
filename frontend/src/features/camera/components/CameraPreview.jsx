import { useEffect } from "react";

import CameraPermissionNotice from "./CameraPermissionNotice";
import useCamera from "../hooks/useCamera";

export default function CameraPreview({ onVideoElementReady }) {
  const { videoRef, isCameraReady, cameraError, startCamera } = useCamera();

  // 현재 카메라 video 요소를 부모 컴포넌트에 전달
  // 필요하지 않은 화면에서는 onVideoElementReady를 넘기지 않아도 됨
  useEffect(() => {
    if (!videoRef.current) {
      return;
    }

    if (!onVideoElementReady) {
      return;
    }

    onVideoElementReady(videoRef.current);
  }, [onVideoElementReady, videoRef]);

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
