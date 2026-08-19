import { useCallback, useEffect, useState } from "react";

import { SPEECH_MODE } from "./createSpeechRequest";
import { speechPlayer } from "./speechPlayer";

export default function useSpeechPlayback({ requestTts } = {}) {
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => speechPlayer.subscribe(setStatus), []);

  const stop = useCallback(() => {
    speechPlayer.stop();
  }, []);

  const preloadPreset = useCallback((presetId) => {
    speechPlayer.preloadPreset(presetId);
  }, []);

  const play = useCallback(
    async (speechRequest, options) => {
      if (!speechRequest || speechRequest.mode === SPEECH_MODE.NONE) {
        stop();
        return;
      }

      setErrorMessage("");
      setStatus("loading");

      try {
        if (speechRequest.mode === SPEECH_MODE.PRESET) {
          try {
            await speechPlayer.playPreset(speechRequest.id, options);
          } catch (presetError) {
            if (!speechRequest.fallbackText || !requestTts) {
              throw presetError;
            }

            const audioBlob = await requestTts(speechRequest.fallbackText);
            await speechPlayer.playTts(audioBlob, options);
          }
          return;
        }

        if (speechRequest.mode === SPEECH_MODE.TTS) {
          if (!requestTts) {
            throw new Error("음성 안내 요청을 준비하지 못했어요.");
          }

          const audioBlob = await requestTts(speechRequest.text);
          await speechPlayer.playTts(audioBlob, options);
        }
      } catch (error) {
        setStatus("ready");
        setErrorMessage(
          error?.name === "NotAllowedError"
            ? "음성 안내를 재생하려면 안내 듣기 버튼을 눌러 주세요."
            : "음성 안내를 재생하지 못했어요. 다시 눌러 주세요.",
        );
      }
    },
    [requestTts, stop],
  );

  useEffect(() => stop, [stop]);

  return { errorMessage, play, preloadPreset, status, stop };
}
