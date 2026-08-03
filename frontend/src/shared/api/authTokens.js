const ACCESS_TOKEN_KEY = "gieoksaerok.accessToken";
const REFRESH_TOKEN_KEY = "gieoksaerok.refreshToken";

export function getAccessToken() {
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken() {
  return window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens({ access, refresh }) {
  if (access) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, access);
  }

  if (refresh) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  }
}

export function clearAuthTokens() {
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
}
