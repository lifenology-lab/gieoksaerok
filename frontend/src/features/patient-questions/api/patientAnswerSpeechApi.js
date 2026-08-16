import { requestBlob } from "@/shared/api/client";

export function requestPatientAnswerSpeech(text) {
  return requestBlob("/api/patient-answers/speech/", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
