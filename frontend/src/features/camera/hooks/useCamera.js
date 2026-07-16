import { useCallback, useEffect, useRef, useState } from "react";

export default function useCamera() {
  // video 태그에 접근하기 위한 ref
  const videoRef = useRef(null);

  // 현재 사용 중인 카메라 stream을 저장하는 ref
  const streamRef = useRef(null);

  // 카메라 시작 요청이 중복 실행되는 것을 방지하기 위한 ref
  const isStartingRef = useRef(false);

  // 컴포넌트가 unmount된 뒤 state가 변경되는 것을 방지하기 위한 ref
  const isMountedRef = useRef(false);

  const [isCameraReady, setIsCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const stopCamera = useCallback(() => {
    // 실행 중인 카메라 track을 모두 중지
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });

      streamRef.current = null;
    }

    // video 태그와 stream 연결 해제
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    // 이미 카메라 시작 중이면 중복 실행하지 않음
    if (isStartingRef.current) {
      return;
    }

    isStartingRef.current = true;

    try {
      setCameraError(null);
      setIsCameraReady(false);

      // 브라우저가 카메라 API를 지원하는지 확인
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("이 브라우저에서는 카메라를 사용할 수 없어요.");
      }

      // 새 stream을 열기 전에 기존 stream 정리
      stopCamera();

      // 후면 카메라를 우선적으로 요청
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      // 카메라 요청 중 컴포넌트가 unmount된 경우 stream 정리 후 종료
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      const videoElement = videoRef.current;

      // video 태그가 아직 준비되지 않은 경우 stream 정리 후 종료
      if (!videoElement) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      // 카메라 stream을 video 태그에 연결
      videoElement.srcObject = stream;

      try {
        await videoElement.play();
      } catch (error) {
        // React StrictMode나 화면 전환 중 발생하는 AbortError는 무시
        if (error.name !== "AbortError") {
          throw error;
        }
      }

      if (isMountedRef.current) {
        setIsCameraReady(true);
      }
    } catch (error) {
      console.error("Camera error:", error);

      if (isMountedRef.current) {
        setCameraError(
          error?.message || "카메라를 불러오는 중 문제가 발생했어요.",
        );
        setIsCameraReady(false);
      }
    } finally {
      // 성공/실패와 관계없이 시작 중 상태 해제
      isStartingRef.current = false;
    }
  }, [stopCamera]);

  useEffect(() => {
    isMountedRef.current = true;
    startCamera();

    // 페이지를 벗어나거나 컴포넌트가 사라질 때 카메라 정리
    return () => {
      isMountedRef.current = false;
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  return {
    videoRef,
    isCameraReady,
    cameraError,
    startCamera,
    stopCamera,
  };
}
