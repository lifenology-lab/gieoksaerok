import { useCallback, useEffect, useRef, useState } from "react";

import { transcribePatientQuestion } from "../api/patientQuestionApi";

const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];
const MAX_RECORDING_MS = 15000;

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

export default function usePatientQuestionRecorder({ onTranscript }) {
  const [recordingStatus, setRecordingStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timeoutRef = useRef(null);
  const stopRecordingRef = useRef(null);

  const cleanupRecording = useCallback(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    chunksRef.current = [];
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
      const mimeType = getSupportedAudioMimeType();
      const mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );

      streamRef.current = stream;
      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

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

      mediaRecorder.start();
      timeoutRef.current = window.setTimeout(() => {
        stopRecordingRef.current?.();
      }, MAX_RECORDING_MS);
      setRecordingStatus("recording");
      setStatusMessage("듣고 있어요. 말씀해 주세요.");
    } catch (error) {
      cleanupRecording();
      setRecordingStatus("error");
      setErrorMessage(error?.message || "녹음을 시작하지 못했어요.");
    }
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

      const result = await transcribePatientQuestion({ audioBlob });
      const transcript = result?.transcript?.trim();

      if (!transcript) {
        throw new Error("말씀하신 내용을 확인하지 못했어요. 다시 말씀해 주세요.");
      }

      await onTranscript(transcript);
      setRecordingStatus("idle");
      setStatusMessage("");
    } catch (error) {
      cleanupRecording();
      setRecordingStatus("error");
      setErrorMessage(error?.message || "음성 질문을 처리하지 못했어요.");
    }
  }, [cleanupRecording, onTranscript]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  useEffect(() => {
    return () => {
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
  };
}
