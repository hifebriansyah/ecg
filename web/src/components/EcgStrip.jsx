import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { TONE_COLOR } from '../lib/format.js';
import { t } from '../lib/i18n.jsx';
import { openStream } from '../lib/stream.js';

// Samples are int16 in µV (1000 = 1 mV), as the Holter K1 sends them (see worker/api.js addEcg).
const UV_PER_MV = 1000;

// Draw a window of ECG samples. chunks: [{ started_at, samples }]; the strip spans [from, to] (ms).
// Paper speed 25 mm/s and gain 10 mm/mV, like the design's "25 mm/s • 10 mm/mV".
export function EcgCanvas({ chunks = [], hz = 250, from, to, color = TONE_COLOR.ok, grid = false, height = 64, className, label }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const span = Math.max(1, to - from);
    const pxPerMm = width / ((span / 1000) * 25);
    const mid = height / 2;

    if (grid) {
      for (let mm = 0, x = 0; x <= width; mm++, x = mm * pxPerMm) {
        ctx.strokeStyle = mm % 5 === 0 ? 'rgba(128,211,224,0.16)' : 'rgba(128,211,224,0.06)';
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
      }
      for (let mm = 0; mm * pxPerMm <= mid; mm++) {
        ctx.strokeStyle = mm % 5 === 0 ? 'rgba(128,211,224,0.16)' : 'rgba(128,211,224,0.06)';
        for (const y of [mid - mm * pxPerMm, mid + mm * pxPerMm]) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      }
    }

    const pxPerUv = grid ? (10 * pxPerMm) / UV_PER_MV : (height * 0.42) / 1200; // mini strips: fit ±1.2 mV
    ctx.strokeStyle = color; ctx.lineWidth = grid ? 1.8 : 1.5; ctx.lineJoin = 'round';
    ctx.shadowColor = color; ctx.shadowBlur = grid ? 6 : 3;
    ctx.beginPath();
    let drawn = false; let lastX = -Infinity;
    for (const c of chunks) {
      const dt = 1000 / hz;
      let pen = false;
      for (let i = 0; i < c.samples.length; i++) {
        const t = c.started_at + i * dt;
        if (t < from || t > to) { pen = false; continue; }
        const x = ((t - from) / span) * width;
        const y = Math.max(1, Math.min(height - 1, mid - c.samples[i] * pxPerUv));
        if (!pen || x - lastX > 4 * (width / span) * dt) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        pen = true; lastX = x; drawn = true;
      }
    }
    if (!drawn) { ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(190,200,202,0.35)'; ctx.setLineDash([4, 4]); ctx.moveTo(0, mid); ctx.lineTo(width, mid); }
    ctx.stroke();
  }, [chunks, hz, from, to, color, grid, height, width]);

  return <canvas ref={ref} style={{ width: '100%', height }} className={className} role="img" aria-label={label || t('Strip EKG')} />;
}

// Load the last `span` ms of a session's ECG (up to `to`, default now), reloading every `poll` ms while live.
// With `stream` (live view) it also listens on the WebSocket: new chunks are appended as they arrive and the window slides with the clock;
// REST polling stays as the fallback and only runs while the socket is not open. `telemetry` is the latest reading pushed over the socket,
// `transport` is 'ws' while the socket is open and 'rest' otherwise.
export function useEcg(code, { span = 10000, to, poll, lead, stream = false } = {}) {
  const [state, setState] = useState({ chunks: [], hz: 250, from: 0, to: 0, loaded: false });
  const [telemetry, setTelemetry] = useState(null);
  const [wsOpen, setWsOpen] = useState(false);
  const wsOpenRef = useRef(false);
  const toKey = to ?? null;

  useEffect(() => {
    if (!code || !stream) { wsOpenRef.current = false; setWsOpen(false); return undefined; }
    const conn = openStream(code, {
      role: 'view',
      onState: (st) => { wsOpenRef.current = st === 'open'; setWsOpen(st === 'open'); },
      onMessage: (m) => {
        if (m.type !== 'live') return;
        if (m.telemetry) setTelemetry(m.telemetry);
        if (m.ecg) setState((s) => ({ ...s, chunks: [...s.chunks, { started_at: m.ecg.started_at, samples: m.ecg.samples }].slice(-(Math.ceil(span / 1000) + 8)), hz: m.ecg.hz || s.hz, loaded: true }));
      },
    });
    return () => { conn.close(); wsOpenRef.current = false; };
  }, [code, stream, span]);

  // while the socket is open the window follows the clock (the REST poll does this by itself)
  useEffect(() => {
    if (!wsOpen) return undefined;
    const id = setInterval(() => { const end = Date.now(); setState((s) => ({ ...s, from: end - span, to: end })); }, 80);
    return () => clearInterval(id);
  }, [wsOpen, span]);

  useEffect(() => {
    if (!code) return;
    let alive = true; let ctrl;
    async function load() {
      ctrl?.abort(); ctrl = new AbortController();
      const end = toKey ?? Date.now();
      try {
        const r = await api(`/sessions/${code}/ecg?from=${end - span}&to=${end}${lead ? `&lead=${lead}` : ''}`, { signal: ctrl.signal });
        if (alive) setState({ chunks: r.chunks, hz: r.sampling_hz, from: r.from, to: r.to, loaded: true });
      } catch (e) { if (e.name !== 'AbortError' && alive) setState((s) => ({ ...s, loaded: true })); }
    }
    load();
    const id = poll ? setInterval(() => { if (!document.hidden && !wsOpenRef.current) load(); }, poll) : null;
    return () => { alive = false; ctrl?.abort(); if (id) clearInterval(id); };
  }, [code, span, toKey, poll, lead]);
  return { ...state, telemetry, transport: wsOpen ? 'ws' : 'rest' };
}

// Compact strip for a list row (design: "GARIS EKG" column) with the BPM and rhythm on the right.
export function MiniEcg({ code, live, lastSeen, bpm, rhythm, tone = 'ok' }) {
  const to = live ? undefined : lastSeen || undefined;
  const ecg = useEcg(code, { span: 6000, to, poll: live ? 5000 : undefined });
  const hasSignal = useMemo(() => ecg.chunks.length > 0, [ecg.chunks]);
  const color = TONE_COLOR[tone];
  return (
    <div className="flex h-16 w-full min-w-[260px] items-stretch overflow-hidden rounded-xl bg-[#0b1c30]">
      <div className="relative flex-1 px-2">
        <EcgCanvas chunks={ecg.chunks} hz={ecg.hz} from={ecg.from} to={ecg.to} color={color} height={64} label={`EKG ${rhythm || ''}`} />
        {ecg.loaded && !hasSignal && <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-wider text-white/40">{t('Belum ada sinyal')}</span>}
      </div>
      <div className="flex w-24 shrink-0 flex-col items-end justify-center border-l border-white/10 px-3">
        <p className="font-mono text-lg font-bold leading-none" style={{ color }}>{bpm ?? '—'}<span className="ml-1 text-[10px] font-medium text-white/50">BPM</span></p>
        <p className="mt-1.5 max-w-full truncate font-mono text-[9px] uppercase tracking-wider" style={{ color }}>{rhythm || 'Menunggu'}</p>
      </div>
    </div>
  );
}
