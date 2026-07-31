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
