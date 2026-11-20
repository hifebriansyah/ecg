import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { TONE_COLOR } from '../lib/format.js';
import { t } from '../lib/i18n.jsx';
import { openStream } from '../lib/stream.js';

// Samples are int16 in µV (1000 = 1 mV), as the Holter K1 sends them (see worker/api.js addEcg).
const UV_PER_MV = 1000;

// Draw a window of ECG samples. chunks: [{ started_at, samples }]. Paper speed 25 mm/s and gain 10 mm/mV, like the design's "25 mm/s • 10 mm/mV".
// Two modes:
//  - fixed: the strip spans [from, to] (ms) and is painted whenever its props change (history, frozen view, stories);
//  - live: sweep display, like a bedside monitor. A glowing pen moves left to right at the paper speed and draws the line sample by sample (up and
//    down as the signal does); a short gap ahead of the pen erases the previous pass, which stays visible to the right of it. The pen is driven by a
//    render clock at the screen's frame rate, `delay` ms behind the newest sample: chunks arrive in bursts (about one per second) but the clock does
//    not, it follows the arrival of data gently, so the pen never jumps, stalls or runs out of data.
// Themes: 'dark' is the monitor look; 'paper' is the hospital standard ECG paper (pink 1 mm / 5 mm grid, black trace). The canvas paints its own
// background so an exported image looks like the screen. `canvasRef` gives the parent the <canvas> (image export).
const THEMES = {
  dark: { bg: '#0b1c30', minor: 'rgba(128,211,224,0.06)', major: 'rgba(128,211,224,0.16)' },
  paper: { bg: '#fff6f4', minor: 'rgba(224,122,122,0.30)', major: 'rgba(196,64,64,0.50)' },
};
export function EcgCanvas({ chunks = [], hz = 250, from, to, live = false, span = 10000, delay = 1500, color = TONE_COLOR.ok, grid = false, height = 64, theme = 'dark', canvasRef, className, label }) {
  const ref = useRef(null);
  const setRef = useCallback((el) => { ref.current = el; if (canvasRef) canvasRef.current = el; }, [canvasRef]);
  const [width, setWidth] = useState(0);
  const data = useRef({ chunks, hz });
  data.current = { chunks, hz };
  const gridCache = useRef({ key: '', canvas: null }); // the grid is drawn once per size, then copied each frame
  const anchor = useRef(null); // newest sample time (data clock) and the moment it arrived (performance.now())

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // the canvas bitmap is only resized when the size changes (not on every frame)
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
  }, [width, height]);

  const paint = useCallback((fromT, toT, sweep) => {
    const canvas = ref.current;
    if (!canvas || !width) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.setLineDash([]); ctx.globalAlpha = 1; // the canvas keeps its state between frames
    const th = THEMES[theme] || THEMES.dark; const paper = theme === 'paper';
    ctx.fillStyle = th.bg; ctx.fillRect(0, 0, width, height);
    const spanMs = Math.max(1, toT - fromT);
    const pxPerMm = width / ((spanMs / 1000) * 25);
    const mid = height / 2;

    if (grid) {
      const key = `${theme}x${width}x${height}x${dpr}x${Math.round(spanMs)}`;
      if (gridCache.current.key !== key) {
        const g = document.createElement('canvas'); g.width = width * dpr; g.height = height * dpr;
        const gc = g.getContext('2d'); gc.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (let mm = 0, x = 0; x <= width; mm++, x = mm * pxPerMm) {
          gc.strokeStyle = mm % 5 === 0 ? th.major : th.minor;
          gc.beginPath(); gc.moveTo(x, 0); gc.lineTo(x, height); gc.stroke();
        }
        for (let mm = 0; mm * pxPerMm <= mid; mm++) {
          gc.strokeStyle = mm % 5 === 0 ? th.major : th.minor;
          for (const y of [mid - mm * pxPerMm, mid + mm * pxPerMm]) { gc.beginPath(); gc.moveTo(0, y); gc.lineTo(width, y); gc.stroke(); }
        }
        gridCache.current = { key, canvas: g };
      }
      ctx.drawImage(gridCache.current.canvas, 0, 0, width, height);
    }

    const pxPerUv = grid ? (10 * pxPerMm) / UV_PER_MV : (height * 0.42) / 1200; // mini strips: fit ±1.2 mV
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    const { chunks: cs, hz: rate } = data.current;
    const dt = 1000 / rate;
    // time -> x. Fixed: the window [fromT, toT]. Sweep: x is the time within the current pass; the part right of the pen is the previous pass.
    const segments = sweep
      ? [{ t0: sweep.rt - spanMs + sweep.gap, t1: sweep.start, base: sweep.start - spanMs }, { t0: sweep.start, t1: sweep.rt, base: sweep.start }]
      : [{ t0: fromT, t1: toT, base: fromT }];
    let drawn = false; let head = null;
    for (const seg of segments) {
      let lastX = -Infinity; let pen = false;
      for (const c of cs) {
        if (c.started_at > seg.t1 || c.started_at + c.samples.length * dt < seg.t0) continue; // not in this part
        pen = false;
        for (let i = 0; i < c.samples.length; i++) {
          const tt = c.started_at + i * dt;
          if (tt < seg.t0 || tt > seg.t1) { pen = false; continue; }
          const x = ((tt - seg.base) / spanMs) * width;
          const y = Math.max(1, Math.min(height - 1, mid - c.samples[i] * pxPerUv));
          if (!pen || x - lastX > 4 * (width / spanMs) * dt) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          pen = true; lastX = x; drawn = true; head = { x, y, tt, i, c };
        }
      }
      // the pen sits exactly at the clock: continue the line from the last sample to the interpolated value at that moment
      if (sweep && seg.base === sweep.start && head && pen) {
        const next = head.c.samples[head.i + 1];
        const frac = Math.max(0, Math.min(1, (sweep.rt - head.tt) / dt));
        const v = next === undefined ? head.c.samples[head.i] : head.c.samples[head.i] + (next - head.c.samples[head.i]) * frac;
        head = { x: ((sweep.rt - sweep.start) / spanMs) * width, y: Math.max(1, Math.min(height - 1, mid - v * pxPerUv)) };
        ctx.lineTo(head.x, head.y);
      } else if (seg.base === sweep?.start) head = null;
    }
    if (!drawn) { ctx.strokeStyle = 'rgba(190,200,202,0.35)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.moveTo(0, mid); ctx.lineTo(width, mid); ctx.stroke(); return; }
    // glow: a wide faint stroke under the crisp one (much cheaper than shadowBlur on a long path); paper has none
    ctx.strokeStyle = color;
    if (!paper) { ctx.globalAlpha = 0.22; ctx.lineWidth = grid ? 5 : 4; ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.lineWidth = paper ? 1.5 : grid ? 1.8 : 1.5; ctx.stroke();
    if (sweep && head) { // the pen
      if (!paper) {
        const g = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, grid ? 12 : 8);
        g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.55; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(head.x, head.y, grid ? 12 : 8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.fillStyle = paper ? '#b91c1c' : '#fff'; ctx.beginPath(); ctx.arc(head.x, head.y, grid ? 2.6 : 2, 0, Math.PI * 2); ctx.fill();
    }
  }, [width, height, color, grid, theme]);

  // fixed mode
  useEffect(() => { if (!live) paint(from, to); }, [live, paint, chunks, hz, from, to]);

  // live mode: remember when the newest sample arrived
  useEffect(() => {
    if (!live) { anchor.current = null; return; }
    let head = 0;
    for (const c of chunks) head = Math.max(head, c.started_at + (c.samples.length * 1000) / hz);
    if (head && (!anchor.current || head > anchor.current.head)) anchor.current = { head, perf: performance.now() };
  }, [live, chunks, hz]);

  // live mode: the render clock
  useEffect(() => {
    if (!live || !width) return undefined;
    let raf; let last = performance.now(); let rt = null;
    const tick = (now) => {
      const a = anchor.current;
      if (a) {
        const ideal = a.head - delay + (now - a.perf); // where the clock should be now
        const step = now - last;
        if (rt === null || Math.abs(ideal - rt) > 3000) rt = ideal; // first frame, or far off (tab was hidden): jump
        else rt += step + (ideal - rt) * Math.min(1, step / 1500); // otherwise run at real speed and drift gently toward the ideal
        paint(rt - span, rt, { rt, start: Math.floor(rt / span) * span, gap: span * 0.04 });
      } else paint(0, span); // no data yet: baseline
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, width, paint, span, delay]);

  return <canvas ref={setRef} style={{ width: '100%', height }} className={className} role="img" aria-label={label || t('Strip EKG')} />;
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
        if (m.ecg) {
          const end = m.ecg.started_at + (m.ecg.samples.length * 1000) / (m.ecg.hz || 250);
          setState((s) => ({ ...s, chunks: [...s.chunks, { started_at: m.ecg.started_at, samples: m.ecg.samples }].slice(-(Math.ceil(span / 1000) + 8)), hz: m.ecg.hz || s.hz, from: end - span, to: end, loaded: true }));
        }
      },
    });
    return () => { conn.close(); wsOpenRef.current = false; };
  }, [code, stream, span]);

  useEffect(() => {
    if (!code) return;
    let alive = true; let ctrl;
    async function load() {
      ctrl?.abort(); ctrl = new AbortController();
      const end = toKey ?? Date.now();
      try {
        const r = await api(`/sessions/${code}/ecg?from=${end - span - (poll || stream ? 4000 : 0)}&to=${end}${lead ? `&lead=${lead}` : ''}`, { signal: ctrl.signal });
        if (alive) setState({ chunks: r.chunks, hz: r.sampling_hz, from: r.from, to: r.to, loaded: true });
      } catch (e) { if (e.name !== 'AbortError' && alive) setState((s) => ({ ...s, loaded: true })); }
    }
    load();
    const id = poll ? setInterval(() => { if (!document.hidden && !wsOpenRef.current) load(); }, poll) : null;
    return () => { alive = false; ctrl?.abort(); if (id) clearInterval(id); };
  }, [code, span, toKey, poll, lead]);
  // how far behind the newest sample the live strip runs: enough that the trace never reaches the end of the data between two arrivals
  const delay = wsOpen ? 1500 : (poll || 2000) + 1500;
  return { ...state, telemetry, transport: wsOpen ? 'ws' : 'rest', delay };
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
        <EcgCanvas chunks={ecg.chunks} hz={ecg.hz} from={ecg.from} to={ecg.to} live={!!live} span={6000} delay={ecg.delay} color={color} height={64} label={`EKG ${rhythm || ''}`} />
        {ecg.loaded && !hasSignal && <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] uppercase tracking-wider text-white/40">{t('Belum ada sinyal')}</span>}
      </div>
      <div className="flex w-24 shrink-0 flex-col items-end justify-center border-l border-white/10 px-3">
        <p className="font-mono text-lg font-bold leading-none" style={{ color }}>{bpm ?? '—'}<span className="ml-1 text-[10px] font-medium text-white/50">BPM</span></p>
        <p className="mt-1.5 max-w-full truncate font-mono text-[9px] uppercase tracking-wider" style={{ color }}>{rhythm || 'Menunggu'}</p>
      </div>
    </div>
  );
}
