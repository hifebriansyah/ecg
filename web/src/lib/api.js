// Small client for the DETAKITA API (ecg/worker/api.js).
export const API_URL = (import.meta.env.VITE_API_URL || 'https://ecg-api.hifebriansyah.workers.dev').replace(/\/$/, '');

const TOKEN_KEY = 'detakita.token';

// "Ingat saya" keeps the token in localStorage (7 days); otherwise it lives only in this tab (sessionStorage).
export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token, remember) {
  try {
    localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY);
    if (token) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
  } catch { /* storage blocked: the user simply stays logged in for this page view */ }
}

export class ApiError extends Error {
  constructor(status, error) {
    super(error?.message || `HTTP ${status}`);
    this.status = status; this.code = error?.code; this.fields = error?.fields;
  }
}

export async function api(path, { method = 'GET', body, token = getToken(), signal } = {}) {
  let res;
  try {
    res = await fetch(API_URL + path, {
      method, signal,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, { code: 'network', message: 'Tidak dapat terhubung ke server' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error);
  return data;
}
