import { useEffect, useRef, useState } from 'react';
import { fmtTime } from '../lib/format.js';
import { t } from '../lib/i18n.jsx';

// Heart-rate trend of the whole recording: min-max band and average line per bucket, 60 / 100 BPM reference lines, the viewer's current
// window highlighted. Click (or drag) anywhere to jump there. data: [{ t, avg, min, max }] from GET /sessions/:code/trend.
export default function TrendChart({ data = [], startAt, endAt, windowFrom, windowTo, onPick, height = 120 }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = ref.current?.parentElement;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const total = Math.max(1, endAt - startAt);
  const maxBpm = Math.max(120, ...data.map((d) => d.max || 0)) + 10;
  const minBpm = Math.min(50, ...data.map((d) => d.min || 999)) - 5;
  const X = (tt) => ((tt - startAt) / total) * width;
  const Y = (v) => height - 6 - ((v - minBpm) / (maxBpm - minBpm)) * (height - 14);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setLineDash([3, 4]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(110,121,123,0.5)'; ctx.fillStyle = 'rgba(110,121,123,0.9)'; ctx.font = '10px "JetBrains Mono", monospace';
    for (const v of [60, 100]) { if (v > minBpm && v < maxBpm) { ctx.beginPath(); ctx.moveTo(0, Y(v)); ctx.lineTo(width, Y(v)); ctx.stroke(); ctx.fillText(String(v), 4, Y(v) - 3); } }
    ctx.setLineDash([]);
    if (data.length) {
      const w = Math.max(2, (total / Math.max(1, data.length)) / total * width); // width of one bucket
      ctx.fillStyle = 'rgba(11,116,128,0.16)'; // min-max band
      for (const d of data) ctx.fillRect(X(d.t), Y(d.max), w, Math.max(1.5, Y(d.min) - Y(d.max)));
      ctx.strokeStyle = '#0b7480'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.beginPath();
      data.forEach((d, i) => { const x = X(d.t) + w / 2; if (i === 0) ctx.moveTo(x, Y(d.avg)); else ctx.lineTo(x, Y(d.avg)); });
      ctx.stroke();
    }
    if (windowFrom != null) { // where the viewer is
      const x0 = Math.max(0, X(windowFrom)); const x1 = Math.min(width, X(windowTo));
      ctx.fillStyle = 'rgba(0,223,193,0.20)'; ctx.fillRect(x0, 0, Math.max(3, x1 - x0), height);
      ctx.strokeStyle = '#00a894'; ctx.lineWidth = 1.5; ctx.strokeRect(x0 + 0.5, 0.5, Math.max(3, x1 - x0) - 1, height - 1);
    }
  }, [data, width, height, windowFrom, windowTo, startAt, endAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const at = (e) => { const r = ref.current.getBoundingClientRect(); return startAt + Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total; };
  const nearest = (tt) => data.reduce((best, d) => (!best || Math.abs(d.t - tt) < Math.abs(best.t - tt) ? d : best), null);
  return (
    <div className="relative select-none">
      <canvas ref={ref} style={{ width: '100%', height }} className="cursor-pointer rounded-lg bg-surface-container-low" role="img" aria-label={t('Tren detak jantung seluruh rekaman')}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onPick?.(at(e)); }}
        onPointerMove={(e) => { const tt = at(e); setHover({ x: e.clientX - ref.current.getBoundingClientRect().left, tt, d: nearest(tt) }); if (e.buttons === 1) onPick?.(tt); }}
        onPointerLeave={() => setHover(null)} />
      {hover && hover.d && (
        <div className="pointer-events-none absolute top-1 rounded-md border border-outline-variant/40 bg-surface-container-lowest px-2 py-1 font-mono text-[11px] shadow" style={{ left: Math.min(Math.max(4, hover.x + 10), Math.max(4, width - 150)) }}>
          <p className="font-semibold">{fmtTime(hover.tt)}</p>
          <p>{t('rata-rata')} {hover.d.avg} • {hover.d.min}–{hover.d.max} BPM</p>
        </div>
      )}
    </div>
  );
}
