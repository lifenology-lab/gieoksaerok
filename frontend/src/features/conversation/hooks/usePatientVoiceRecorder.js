import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchPatientVoiceProfile,
  savePatientVoiceSample,
} from "../api/patientVoiceApi";

const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
];
const MAX_PATIENT_VOICE_RECORDING_MS = 10000;

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

export default function usePatientVoiceRecorder() {
  const [profile, setProfile] = useState(null);
  const [recordingStatus, setRecordingStatus] = useState("loading");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingTimeoutRef = useRef(null);
  const stopRecordingRef = useRef(null);

  const cleanupRecording = useCallback(() => {
    if (recordingTimeoutRef.current) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (streamRef.current) {
      stopStream(streamRef.current);
      streamRef.current = null;
    }

    mediaRecorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const refreshProfile = useCallback(async () => {
    try {
      const nextProfile = await fetchPatientVoiceProfile();
      setProfile(nextProfile);
      setRecordingStatus("idle");
      setErrorMessage("");
      return nextProfile;
    } catch (error) {
      console.error("Patient voice profile fetch error:", error);
      setRecordingStatus("error");
      setErrorMessage(
        error?.message || "환자 목소리 등록 상태를 확인하지 못했어요.",
      );
      return null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setErrorMessage("이 브라우저에서는 마이크를 사용할 수 없어요.");
      setRecordingStatus("error");
      return;
    }

    if (!window.MediaRecorder) {
      setErrorMessage("이 브라우저에서는 녹음을 사용할 수 없어요.");
      setRecordingStatus("error");
      return;
    }

    if (mediaRecorderRef.current?.state === "recording") {
      return;
    }

    try {
      setErrorMessage("");
      setStatusMessage("환자 목소리를 녹음하고 있어요.");

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
        setErrorMessage("환자 목소리를 녹음하는 중 문제가 발생했어요.");
        setRecordingStatus("error");
        cleanupRecording();
      });

      mediaRecorder.start();
      recordingTimeoutRef.current = window.setTimeout(() => {
        stopRecordingRef.current?.();
      }, MAX_PATIENT_VOICE_RECORDING_MS);
      setRecordingStatus("recording");
    } catch (error) {
      console.error("Patient voice recording start error:", error);
      cleanupRecording();
      setRecordingStatus("error");
      setErrorMessage(
        error?.message || "환자 목소리 녹음을 시작하지 못했어요.",
      );
    }
  }, [cleanupRecording]);

  const stopRecording = useCallback(async () => {
    const mediaRecorder = mediaRecorderRef.current;

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
      return;
    }

    setRecordingStatus("saving");
    setStatusMessage("환자 목소리를 저장하고 있어요.");
    setErrorMessage("");

    try {
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
            reject(new Error("환자 목소리 녹음을 종료하지 못했어요."));
          },
          { once: true },
        );
        mediaRecorder.stop();
      });

      cleanupRecording();

      if (!audioBlob.size) {
        throw new Error("녹음된 오디오가 비어 있어요.");
      }

      const nextProfile = await savePatientVoiceSample({ audioBlob });

      setProfile(nextProfile);
      setRecordingStatus("saved");
      setStatusMessage("환자 목소리를 등록했어요.");
    } catch (error) {
      console.error("Patient voice save error:", error);
      cleanupRecording();
      setRecordingStatus("error");
      setErrorMessage(
        error?.message || "환자 목소리를 저장하는 중 문제가 발생했어요.",
      );
    }
  }, [cleanupRecording]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

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
    isRegistered: Boolean(profile?.is_registered),
    profile,
    recordingStatus,
    statusMessage,
    errorMessage,
    refreshProfile,
    startRecording,
    stopRecording,
  };
}
