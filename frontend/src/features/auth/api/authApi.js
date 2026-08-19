import {
  clearAuthTokens,
  getRefreshToken,
  setAuthTokens,
} from "../../../shared/api/authTokens";
import { request } from "../../../shared/api/client";

export async function loginUser({ username, password }) {
  const data = await request("/api/auth/login/", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({
      username,
      password,
    }),
  });

  setAuthTokens(data);

  return data;
}

export async function startDemoExperience({ mode }) {
  const data = await request("/api/auth/demo/", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({ mode }),
  });

  setAuthTokens(data);

  return data;
}

export function signUpUser({ username, password, name, email }) {
  return request("/api/auth/signup/", {
    method: "POST",
    skipAuth: true,
    body: JSON.stringify({
      username,
      password,
      name,
      email,
    }),
  });
}

export function fetchCurrentUser() {
  return request("/api/auth/me/");
}

export async function logoutUser() {
  const refresh = getRefreshToken();

  try {
    if (refresh) {
      await request("/api/auth/logout/", {
        method: "POST",
        retryOnUnauthorized: false,
        body: JSON.stringify({ refresh }),
      });
    }
  } finally {
    clearAuthTokens();
  }
}
