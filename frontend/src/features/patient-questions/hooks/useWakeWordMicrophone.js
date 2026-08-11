import { useEffect, useRef, useState } from "react";

const VOICE_ACTIVITY_THRESHOLD = 0.025;
const VOICE_ACTIVITY_HOLD_MS = 450;

function getMicrophoneErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "마이크 사용을 허용해 주세요.";
  }

  if (error?.name === "NotFoundError") {
    return "사용할 수 있는 마이크를 찾지 못했어요.";
  }

  if (error?.name === "NotReadableError") {
    return "다른 앱에서 마이크를 사용 중일 수 있어요.";
  }

  return "마이크를 연결하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export default function useWakeWordMicrophone(enabled) {
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isVoiceDetected, setIsVoiceDetected] = useState(false);
  const resourcesRef = useRef(null);

  useEffect(() => {
    let isDisposed = false;

    const cleanup = () => {
      const resources = resourcesRef.current;

      if (!resources) {
        return;
      }

      window.cancelAnimationFrame(resources.animationFrameId);
      resources.source.disconnect();
      resources.analyser.disconnect();
      resources.stream.getTracks().forEach((track) => track.stop());
      void resources.audioContext.close();
      resourcesRef.current = null;
    };

    if (!enabled) {
      cleanup();
      setStatus("idle");
      setErrorMessage("");
      setIsVoiceDetected(false);
      return cleanup;
    }

    const initializeMicrophone = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setErrorMessage("이 브라우저에서는 마이크 기능을 사용할 수 없어요.");
        return;
      }

      setStatus("connecting");
      setErrorMessage("");
      setIsVoiceDetected(false);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            autoGainControl: true,
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        });

        if (isDisposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.72;
        const sampleData = new Uint8Array(analyser.fftSize);
        let lastVoiceDetectedAt = 0;
        source.connect(analyser);

        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        const resources = {
          analyser,
          animationFrameId: 0,
          audioContext,
          source,
          stream,
        };

        const observeVoiceActivity = () => {
          analyser.getByteTimeDomainData(sampleData);

          let sumOfSquares = 0;
          for (const sample of sampleData) {
            const normalizedSample = (sample - 128) / 128;
            sumOfSquares += normalizedSample * normalizedSample;
          }

          const volume = Math.sqrt(sumOfSquares / sampleData.length);
          const now = Date.now();

          if (volume >= VOICE_ACTIVITY_THRESHOLD) {
            lastVoiceDetectedAt = now;
          }

          const nextIsVoiceDetected =
            now - lastVoiceDetectedAt < VOICE_ACTIVITY_HOLD_MS;
          setIsVoiceDetected((previous) =>
            previous === nextIsVoiceDetected ? previous : nextIsVoiceDetected,
          );
          resources.animationFrameId = window.requestAnimationFrame(
            observeVoiceActivity,
          );
        };

        resourcesRef.current = resources;
        setStatus("listening");
        observeVoiceActivity();
      } catch (error) {
        if (!isDisposed) {
          setStatus("error");
          setErrorMessage(getMicrophoneErrorMessage(error));
        }
      }
    };

    initializeMicrophone();

    return () => {
      isDisposed = true;
      cleanup();
    };
  }, [enabled]);

  return { errorMessage, isVoiceDetected, status };
}
