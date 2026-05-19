import { setAuthTokenGetter } from "@workspace/api-client-react";

const TOKEN_KEY = "chainDrop_adminToken";

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function isAuthenticated() {
  return !!getToken();
}

// Setup custom fetch to use the token
setAuthTokenGetter(() => getToken());
