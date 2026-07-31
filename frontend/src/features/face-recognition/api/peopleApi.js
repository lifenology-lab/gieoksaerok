const DEFAULT_API_BASE_URL = "";

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

async function request(path, options = {}) {
  const headers = {
    ...options.headers,
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

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

export function fetchPeople() {
  return request("/api/people/");
}

function buildCoreMemory(value) {
  const summary = value?.trim();

  if (!summary) {
    return {};
  }

  return { summary };
}

export function createPerson({ name, relationship, coreMemory, faceDescriptor }) {
  return request("/api/people/", {
    method: "POST",
    body: JSON.stringify({
      name,
      relationship,
      core_memory: buildCoreMemory(coreMemory),
      face_descriptor: Array.from(faceDescriptor),
    }),
  });
}
