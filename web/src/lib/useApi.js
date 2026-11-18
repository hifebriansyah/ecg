import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { useAuth } from './auth.jsx';

// GET a path and keep the result. `path` null = don't load. `poll` (ms) reloads quietly in the background.
export function useApi(path, { poll } = {}) {
  const { logout } = useAuth();
  const [state, setState] = useState({ data: null, error: null, loading: !!path });
  const ctrlRef = useRef(null);

  const load = useCallback(async (quiet = false) => {
    if (!path) return;
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    if (!quiet) setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path, { signal: ctrl.signal });
      if (!ctrl.signal.aborted) setState({ data, error: null, loading: false });
    } catch (e) {
      if (e.name === 'AbortError') return;
      if (e.status === 401) { logout(); return; }
      setState((s) => ({ ...s, error: e, loading: false }));
    }
  }, [path, logout]);

  useEffect(() => {
    load();
    return () => ctrlRef.current?.abort();
  }, [load]);

  useEffect(() => {
    if (!poll || !path) return;
    const id = setInterval(() => { if (!document.hidden) load(true); }, poll);
    return () => clearInterval(id);
  }, [poll, path, load]);

  return { ...state, reload: load, setData: (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn })) };
}

// Build "/path?a=1&b=x,y" from an object, skipping empty values.
export function withQuery(path, params) {
  const q = new URLSearchParams(); // path may already carry a query (e.g. "/sessions?view=running")
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    q.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = q.toString();
  return s ? `${path}${path.includes('?') ? '&' : '?'}${s}` : path;
}

// Debounced value (search boxes).
export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
