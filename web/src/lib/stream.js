import { API_URL, getToken } from './api.js';

// Live stream (WebSocket) to one session's hub on the API (GET /sessions/:code/stream).
//   role 'view': receives { type: 'live', ecg?: {started_at, hz, lead, samples}, telemetry?: {...} } for every chunk saved
//   role 'push': sends { seq, bpm, ecg_waveform } frames (same body as POST /sessions/:code/data), gets { type: 'ack' | 'error', seq, ... }
// Reconnects by itself with a growing delay and pings every 25 s (the server answers without waking up).
export function streamUrl(code, role) {
  const u = new URL(API_URL);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = `/api/sessions/${encodeURIComponent(code)}/stream`;
  u.searchParams.set('role', role);
  u.searchParams.set('token', getToken() || '');
  return u.toString();
}

export function openStream(code, { role = 'view', onMessage, onState } = {}) {
  let ws; let closed = false; let tries = 0; let pingId; let retryId;
  function connect() {
    try { ws = new WebSocket(streamUrl(code, role)); } catch { onState?.('closed'); return; }
    ws.onopen = () => {
      tries = 0; onState?.('open');
      pingId = setInterval(() => { if (ws.readyState === 1) ws.send('ping'); }, 25000);
    };
    ws.onmessage = (e) => {
      if (e.data === 'pong') return;
      try { onMessage?.(JSON.parse(e.data)); } catch { /* not JSON */ }
    };
    ws.onclose = () => {
      clearInterval(pingId); onState?.('closed');
      if (!closed) retryId = setTimeout(connect, Math.min(15000, 1000 * 2 ** tries++));
    };
    ws.onerror = () => { try { ws.close(); } catch { /* already closed */ } };
  }
  connect();
  return {
    get open() { return !!ws && ws.readyState === 1; },
    send(obj) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; } return false; },
    close() { closed = true; clearTimeout(retryId); clearInterval(pingId); try { ws?.close(); } catch { /* already closed */ } },
  };
}
