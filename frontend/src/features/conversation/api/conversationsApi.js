import { request } from "../../../shared/api/client";

export function transcribeConversation({
  personId,
  audioBlob,
  recordedAt,
  prompt,
}) {
  const formData = new FormData();
  const extension = audioBlob.type.includes("mp4") ? "mp4" : "webm";

  formData.append("person", personId);
  formData.append("audio", audioBlob, `conversation.${extension}`);

  if (recordedAt) {
    formData.append("recorded_at", recordedAt);
  }

  if (prompt) {
    formData.append("prompt", prompt);
  }

  return request("/api/conversations/transcribe/", {
    method: "POST",
    body: formData,
  });
}
