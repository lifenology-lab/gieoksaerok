import { request } from "@/shared/api/client";

export function transcribePatientQuestion({ audioBlob }) {
  const formData = new FormData();
  const extension = audioBlob.type.includes("mp4") ? "mp4" : "webm";

  formData.append("audio", audioBlob, `patient-question.${extension}`);

  return request("/api/patient-questions/transcribe/", {
    method: "POST",
    body: formData,
  });
}

export function fetchPatientQuestionSchedules() {
  return request("/api/patient-questions/schedules/");
}

export function savePatientQuestionEvent({
  transcript,
  inputMethod,
  intentType,
  responseSummary,
  occurredAt,
}) {
  return request('/api/patient-questions/', {
    method: 'POST',
    body: JSON.stringify({
      transcript,
      input_method: inputMethod,
      intent_type: intentType,
      response_summary: responseSummary,
      occurred_at: occurredAt,
    }),
  });
}

export function fetchPatientQuestionEvents() {
  return request('/api/patient-questions/');
}
