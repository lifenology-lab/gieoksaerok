import { useCallback, useEffect, useRef, useState } from "react";

import { transcribeConversation } from "../api/conversationsApi";

const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];

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
  stream.getTracks().forEach((track) => {
    track.stop();
  });
}

export default function useConversationRecorder({
  person,
  onConversationSaved,
}) {
  const [recordingStatus, setRecordingStatus] = useState("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [lastConversation, setLastConversation] = useState(null);
  const [recordingPerson, setRecordingPerson] = useState(null);

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingPersonRef = useRef(null);
  const currentPersonIdRef = useRef(person?.id || null);
  const previousPersonIdRef = useRef(person?.id || null);
  const recordedAtRef = useRef(null);

  const cleanupRecording = useCallback(() => {
    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    chunksRef.current = [];
    recordingPersonRef.current = null;
    recordedAtRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    if (!person) {
      setErrorMessage("대화할 사람을 먼저 인식해야 합니다.");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage("이 브라우저에서는 마이크를 사용할 수 없어요.");
      return;
    }

    if (!window.MediaRecorder) {
      setErrorMessage("이 브라우저에서는 녹음을 사용할 수 없어요.");
      return;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      return;
    }

    try {
      setErrorMessage("");
      setLastConversation(null);
      setStatusMessage("마이크를 준비하고 있어요.");

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
      recordingPersonRef.current = person;
      recordedAtRef.current = new Date().toISOString();
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });

      mediaRecorder.addEventListener("error", () => {
        setErrorMessage("녹음 중 문제가 발생했어요.");
        setRecordingStatus("error");
        setRecordingPerson(null);
        cleanupRecording();
      });

      mediaRecorder.start();
      setRecordingPerson(person);
      setRecordingStatus("recording");
      setStatusMessage(`${person.name}님과의 대화를 기록하고 있어요.`);
    } catch (error) {
      console.error("Conversation recording start error:", error);
      cleanupRecording();
      setRecordingStatus("error");
      setErrorMessage(
        error?.message || "대화 녹음을 시작하는 중 문제가 발생했어요.",
      );
    }
  }, [cleanupRecording, person]);

  const stopRecording = useCallback(async () => {
    const mediaRecorder = mediaRecorderRef.current;

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      return;
    }

    const recordingPersonSnapshot = recordingPersonRef.current;
    const recordedAt = recordedAtRef.current;

    setRecordingStatus("transcribing");
    setStatusMessage("대화 내용을 텍스트로 변환하고 있어요.");
    setErrorMessage("");

    try {
      if (!recordingPersonSnapshot) {
        throw new Error("녹음 대상 사람 정보를 찾지 못했어요.");
      }

      const audioBlob = await new Promise((resolve, reject) => {
        mediaRecorder.addEventListener(
          "stop",
          () => {
            const type = mediaRecorder.mimeType || "audio/webm";
            resolve(new Blob(chunksRef.current, { type }));
          },
          { once: true },
        );
        mediaRecorder.addEventListener(
          "error",
          () => {
            reject(new Error("녹음을 종료하는 중 문제가 발생했어요."));
          },
          { once: true },
        );
        mediaRecorder.stop();
      });

      cleanupRecording();

      if (!audioBlob.size) {
        throw new Error("녹음된 오디오가 비어 있어요.");
      }

      const conversation = await transcribeConversation({
        personId: recordingPersonSnapshot.id,
        audioBlob,
        recordedAt,
      });

      setRecordingPerson(null);

      if (
        currentPersonIdRef.current &&
        currentPersonIdRef.current !== recordingPersonSnapshot.id
      ) {
        setLastConversation(null);
        setRecordingStatus("idle");
        setStatusMessage("");
        return;
      }

      setLastConversation(conversation);

      try {
        await onConversationSaved?.(conversation);
      } catch (refreshError) {
        console.error("People refresh after conversation save error:", refreshError);
      }

      setRecordingStatus("saved");
      setStatusMessage(
        conversation.memory_error
          ? "대화 내용은 저장했지만 요약 저장에 실패했어요."
          : "대화 내용과 요약을 저장했어요.",
      );
    } catch (error) {
      console.error("Conversation transcription error:", error);
      cleanupRecording();
      setRecordingPerson(null);
      setRecordingStatus("error");
      setErrorMessage(
        error?.message || "대화 내용을 저장하는 중 문제가 발생했어요.",
      );
    }
  }, [cleanupRecording, onConversationSaved]);

  useEffect(() => {
    const nextPersonId = person?.id || null;
    const previousPersonId = previousPersonIdRef.current;

    currentPersonIdRef.current = nextPersonId;

    if (previousPersonId === nextPersonId) {
      return;
    }

    previousPersonIdRef.current = nextPersonId;

    if (recordingStatus === "recording" || recordingStatus === "transcribing") {
      return;
    }

    setRecordingStatus("idle");
    setStatusMessage("");
    setErrorMessage("");
    setLastConversation(null);
    setRecordingPerson(null);
  }, [person?.id, recordingStatus]);

  useEffect(() => {
    return () => {
      const mediaRecorder = mediaRecorderRef.current;

      if (mediaRecorder?.state === "recording") {
        mediaRecorder.stop();
      }

      cleanupRecording();
    };
  }, [cleanupRecording]);

  return {
    recordingStatus,
    statusMessage,
    errorMessage,
    lastConversation,
    recordingPerson,
    startRecording,
    stopRecording,
  };
}
