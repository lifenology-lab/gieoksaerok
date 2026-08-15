import { useCallback, useEffect, useRef, useState } from "react";

import { requestPatientAnswerSpeech } from "../api/patientAnswerSpeechApi";

export default function usePatientAnswerSpeech() {
  const audioRef = useRef(null);
  const objectUrlRef = useRef("");
  const requestIdRef = useRef(0);
  const audioCacheRef = useRef(new Map());
  const statusRef = useRef("idle");
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const updateStatus = useCallback((nextStatus) => {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }, []);

  const releaseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    }
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    releaseAudio();
    updateStatus("idle");
  }, [releaseAudio, updateStatus]);

  const loadAudio = useCallback(async (text) => {
    const cachedAudio = audioCacheRef.current.get(text);

    if (cachedAudio) {
      return cachedAudio;
    }

    const audioBlob = await requestPatientAnswerSpeech(text);
    audioCacheRef.current.set(text, audioBlob);

    if (audioCacheRef.current.size > 3) {
      const oldestText = audioCacheRef.current.keys().next().value;
      audioCacheRef.current.delete(oldestText);
    }

    return audioBlob;
  }, []);

  const preload = useCallback(
    async (text) => {
      if (!text) {
        return;
      }

      try {
        await loadAudio(text);
      } catch {
        // 초기 예열이 실패해도 사용자가 직접 재생할 수 있도록 조용히 넘긴다.
      }
    },
    [loadAudio],
  );

  const play = useCallback(
    async (text, { autoplay = false } = {}) => {
      if (!text || statusRef.current === "loading") {
        return;
      }

      stop();
      const requestId = requestIdRef.current;
      setErrorMessage("");
      updateStatus("loading");

      try {
        const audioBlob = await loadAudio(text);

        if (requestId !== requestIdRef.current) {
          return;
        }

        const objectUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(objectUrl);
        objectUrlRef.current = objectUrl;
        audioRef.current = audio;
        audio.onended = () => {
          releaseAudio();
          updateStatus("idle");
        };
        try {
          await audio.play();
        } catch (error) {
          if (autoplay && error?.name === "NotAllowedError") {
            releaseAudio();
            updateStatus("ready");
            setErrorMessage(
              "자동 재생이 차단됐어요. 아래 안내 듣기 버튼을 눌러 주세요.",
            );
            return;
          }

          throw error;
        }

        if (requestId === requestIdRef.current) {
          updateStatus("playing");
        }
      } catch {
        if (requestId === requestIdRef.current) {
          releaseAudio();
          updateStatus("idle");
          setErrorMessage("음성 안내를 재생하지 못했어요. 다시 눌러 주세요.");
        }
      }
    },
    [loadAudio, releaseAudio, stop, updateStatus],
  );

  useEffect(() => stop, [stop]);

  return { errorMessage, play, preload, status, stop };
}
