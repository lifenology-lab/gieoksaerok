import { useCallback, useEffect, useRef, useState } from "react";

import { transcribePatientQuestion } from "../api/patientQuestionApi";

const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];
const MAX_RECORDING_MS = 15000;
const VOICE_ACTIVITY_THRESHOLD = 0.025;
const AUTO_STOP_SILENCE_MS = 2000;

function getSupportedAudioMimeType() {
  if (!window.MediaRecorder) {
    return "";
  }

  return (
    RECORDER_MIME_TYPES.find((mimeType) =>
      window.MediaRecorder.isTypeSupported(mimeType),
    ) || ""
  );
}

function stopStream(stream) {
  stream.getTracks().forEach((track) => track.stop());
}

function getMicrophoneErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return '마이크 사용을 허용해 주세요. 브라우저 설정에서 마이크 접근을 켠 뒤 다시 말해 보세요.';
  }

  if (error?.name === 'NotFoundError') {
    return '사용할 수 있는 마이크를 찾지 못했어요. 텍스트로 질문해 주세요.';
  }

  if (error?.name === 'NotReadableError') {
    return '다른 앱에서 마이크를 사용하고 있을 수 있어요. 잠시 후 다시 시도해 주세요.';
  }

  return '마이크를 시작하지 못했어요. 텍스트로 질문할 수도 있어요.';
}

export default function usePatientQuestionRecorder({
  onTranscript,
  processAudio,
}) {
  const [recordingStatus, setRecordingStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timeoutRef = useRef(null);
  const stopRecordingRef = useRef(null);
  const recordingAttemptRef = useRef(0);
  const voiceActivityResourcesRef = useRef(null);
  const hasDetectedSpeechRef = useRef(false);
  const lastVoiceDetectedAtRef = useRef(0);
  const isAutoStoppingRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const processAudioRef = useRef(processAudio);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    processAudioRef.current = processAudio;
  }, [processAudio]);

  const cleanupVoiceActivityDetection = useCallback(() => {
    const resources = voiceActivityResourcesRef.current;

    if (resources) {
      window.cancelAnimationFrame(resources.animationFrameId);
      resources.source.disconnect();
      resources.analyser.disconnect();
      void resources.audioContext.close();
      voiceActivityResourcesRef.current = null;
    }

    hasDetectedSpeechRef.current = false;
    lastVoiceDetectedAtRef.current = 0;
    isAutoStoppingRef.current = false;
  }, []);

  const cleanupRecording = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    cleanupVoiceActivityDetection();

    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, [cleanupVoiceActivityDetection]);

  const startVoiceActivityDetection = useCallback((stream) => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);

      const sampleData = new Uint8Array(analyser.fftSize);
      const resources = {
        analyser,
        animationFrameId: 0,
        audioContext,
        source,
      };

      const observeVoiceActivity = () => {
        if (mediaRecorderRef.current?.state !== "recording") {
          return;
        }

        analyser.getByteTimeDomainData(sampleData);

        let sumOfSquares = 0;
        for (const sample of sampleData) {
          const normalizedSample = (sample - 128) / 128;
          sumOfSquares += normalizedSample * normalizedSample;
        }

        const volume = Math.sqrt(sumOfSquares / sampleData.length);
        const now = Date.now();

        if (volume >= VOICE_ACTIVITY_THRESHOLD) {
          hasDetectedSpeechRef.current = true;
          lastVoiceDetectedAtRef.current = now;
        }

        const hasReachedSilenceLimit =
          hasDetectedSpeechRef.current &&
          now - lastVoiceDetectedAtRef.current >= AUTO_STOP_SILENCE_MS;

        if (hasReachedSilenceLimit && !isAutoStoppingRef.current) {
          isAutoStoppingRef.current = true;
          stopRecordingRef.current?.();
          return;
        }

        resources.animationFrameId = window.requestAnimationFrame(
          observeVoiceActivity,
        );
      };

      voiceActivityResourcesRef.current = resources;
      void audioContext.resume();
      observeVoiceActivity();
    } catch {
      // VAD를 사용할 수 없더라도 수동 녹음은 계속 제공한다.
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingStatus("error");
      setErrorMessage("이 브라우저에서는 마이크를 사용할 수 없어요.");
      return;
    }

    if (!window.MediaRecorder) {
      setRecordingStatus("error");
      setErrorMessage("이 브라우저에서는 녹음을 사용할 수 없어요.");
      return;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      return;
    }

    const recordingAttempt = recordingAttemptRef.current + 1;
    recordingAttemptRef.current = recordingAttempt;

    try {
      setRecordingStatus("preparing");
      setStatusMessage("마이크를 준비하고 있어요.");
      setErrorMessage("");

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });

      if (recordingAttemptRef.current !== recordingAttempt) {
        stopStream(stream);
        return;
      }

      const mimeType = getSupportedAudioMimeType();
      const mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      streamRef.current = stream;
      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;
      hasDetectedSpeechRef.current = false;
      lastVoiceDetectedAtRef.current = 0;
      isAutoStoppingRef.current = false;

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });
      mediaRecorder.addEventListener("error", () => {
        setRecordingStatus("error");
        setErrorMessage("녹음 중 문제가 발생했어요.");
        cleanupRecording();
      });

      await new Promise((resolve, reject) => {
        mediaRecorder.addEventListener("start", resolve, { once: true });
        mediaRecorder.addEventListener(
          "error",
          () => reject(new Error("녹음을 시작하지 못했어요.")),
          { once: true },
        );
        mediaRecorder.start();
      });

      if (recordingAttemptRef.current !== recordingAttempt) {
        mediaRecorder.stop();
        return;
      }

      startVoiceActivityDetection(stream);
      timeoutRef.current = window.setTimeout(() => {
        stopRecordingRef.current?.();
      }, MAX_RECORDING_MS);
      setRecordingStatus("recording");
      setStatusMessage("마이크가 켜졌어요. 이제 말씀해 주세요.");
    } catch (error) {
      if (recordingAttemptRef.current !== recordingAttempt) {
        return;
      }

      cleanupRecording();
      setRecordingStatus("error");
      setStatusMessage("");
      setErrorMessage(getMicrophoneErrorMessage(error));
    }
  }, [cleanupRecording, startVoiceActivityDetection]);

  const cancelRecording = useCallback(() => {
    const mediaRecorder = mediaRecorderRef.current;

    recordingAttemptRef.current += 1;

    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop();
    }

    cleanupRecording();
    setRecordingStatus('idle');
    setStatusMessage('');
    setErrorMessage('');
  }, [cleanupRecording]);

  const stopRecording = useCallback(async () => {
    const mediaRecorder = mediaRecorderRef.current;

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      return;
    }

    setRecordingStatus("transcribing");
    setStatusMessage("말씀하신 내용을 확인하고 있어요.");
    setErrorMessage("");

    try {
      const audioBlob = await new Promise((resolve, reject) => {
        mediaRecorder.addEventListener(
          "stop",
          () => {
            resolve(
              new Blob(chunksRef.current, {
                type: mediaRecorder.mimeType || "audio/webm",
              }),
            );
          },
          { once: true },
        );
        mediaRecorder.addEventListener(
          "error",
          () => reject(new Error("녹음을 종료하지 못했어요.")),
          { once: true },
        );
        mediaRecorder.stop();
      });

      cleanupRecording();

      if (!audioBlob.size) {
        throw new Error("녹음된 내용이 없어요. 다시 말씀해 주세요.");
      }

      if (processAudioRef.current) {
        await processAudioRef.current({ audioBlob });
      } else {
        const result = await transcribePatientQuestion({ audioBlob });
        const transcript = result?.transcript?.trim();

        if (!transcript) {
          throw new Error("말씀하신 내용을 확인하지 못했어요. 다시 말씀해 주세요.");
        }

        await onTranscriptRef.current(transcript);
      }
      setRecordingStatus("idle");
      setStatusMessage("");
    } catch (error) {
      cleanupRecording();
      setRecordingStatus("error");
      setErrorMessage(error?.message || "음성 질문을 처리하지 못했어요.");
    }
  }, [cleanupRecording]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  useEffect(() => {
    return () => {
      recordingAttemptRef.current += 1;

      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }

      cleanupRecording();
    };
  }, [cleanupRecording]);

  return {
    recordingStatus,
    statusMessage,
    errorMessage,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
