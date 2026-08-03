import {
  clearAuthTokens,
  getAccessToken,
  getRefreshToken,
  setAuthTokens,
} from "./authTokens";

const DEFAULT_API_BASE_URL = "";

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL
).replace(/\/$/, "");

async function readErrorMessage(response) {
  const fallbackMessage = "API 요청 중 문제가 발생했어요.";
  const text = await response.text();

  if (!text) {
    return fallbackMessage;
  }

  try {
    const data = JSON.parse(text);
    return data.detail || JSON.stringify(data);
  } catch {
    return text;
  }
}

async function refreshAccessToken() {
  const refresh = getRefreshToken();

  if (!refresh) {
    return null;
  }

  const response = await fetch(`${API_BASE_URL}/api/auth/token/refresh/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh }),
  });

  if (!response.ok) {
    clearAuthTokens();
    return null;
  }

  const data = await response.json();
  setAuthTokens({
    access: data.access,
    refresh: data.refresh || refresh,
  });

  return data.access;
}

export async function request(path, options = {}) {
  const {
    headers: optionHeaders,
    retryOnUnauthorized = true,
    skipAuth = false,
    ...fetchOptions
  } = options;
  const headers = new Headers(optionHeaders || {});
  const body = fetchOptions.body;

  if (body && !(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const accessToken = getAccessToken();

  if (!skipAuth && accessToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (
    response.status === 401 &&
    !skipAuth &&
    retryOnUnauthorized &&
    getRefreshToken()
  ) {
    const nextAccessToken = await refreshAccessToken();

    if (nextAccessToken) {
      return request(path, {
        ...options,
        retryOnUnauthorized: false,
      });
    }
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text);
}

export function getApiMediaUrl(pathOrUrl) {
  if (!pathOrUrl) {
    return "";
  }

  if (/^https?:\/\//.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return `${API_BASE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}
