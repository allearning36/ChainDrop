import { setAuthTokenGetter, getBaseUrl } from "@workspace/api-client-react";

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

// ── Global 401 handler ────────────────────────────────────────────────────────
// Components call handleUnauthorized() when they receive a 401.
// The dashboard registers a redirect callback via registerUnauthorizedHandler().
let _onUnauthorized: (() => void) | null = null;

export function registerUnauthorizedHandler(fn: () => void) {
  _onUnauthorized = fn;
}

export function handleUnauthorized() {
  removeToken();
  _onUnauthorized?.();
}

// ── Auth-aware fetch helper ───────────────────────────────────────────────────
// Drop-in replacement for fetch() in admin components.
// Automatically calls handleUnauthorized() on 401.
// Prepends the configured base URL (VITE_API_BASE_URL) to relative paths so
// that production Vercel requests correctly reach the Railway API server.
export async function adminFetch(input: string, init?: RequestInit): Promise<Response> {
  const base = getBaseUrl();
  const url = base && input.startsWith("/") ? `${base}${input}` : input;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken() ?? ""}`,
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    handleUnauthorized();
  }
  return res;
}

// Setup custom fetch to use the token
setAuthTokenGetter(() => getToken());
