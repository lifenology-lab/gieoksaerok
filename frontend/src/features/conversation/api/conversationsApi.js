const DEFAULT_API_BASE_URL = "";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);

  if (!response.ok) {
    let message = "API 요청 중 문제가 발생했어요.";
    const text = await response.text();

    try {
      const data = JSON.parse(text);
      message = data.detail || JSON.stringify(data);
    } catch {
      message = text || message;
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

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
