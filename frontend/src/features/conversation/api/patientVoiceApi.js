import { request } from "../../../shared/api/client";

export function fetchPatientVoiceProfile() {
  return request("/api/patient-voice/");
}

export function savePatientVoiceSample({ audioBlob }) {
  const formData = new FormData();
  const extension = audioBlob.type.includes("mp4") ? "mp4" : "webm";

  formData.append("audio", audioBlob, `patient-voice.${extension}`);

  return request("/api/patient-voice/", {
    method: "POST",
    body: formData,
  });
}
