import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileDown, FileText, Heart, Image as ImageIcon, MonitorPlay, Pause, Play, Printer, TrendingUp, ZoomIn, ZoomOut, Zap,
} from 'lucide-react';
import { API_URL, api, getToken } from '../lib/api.js';
import { FILTERS, filterChunks } from '../lib/ecgFilter.js';
import { fmtDateTime, fmtHM, fmtTime } from '../lib/format.js';
import { t } from '../lib/i18n.jsx';
import { useApi } from '../lib/useApi.js';
import { CodeTag, cx, useToast } from './ui.jsx';
import { EcgCanvas } from './EcgStrip.jsx';
import TrendChart from './TrendChart.jsx';

const MIN_SPAN = 2000; const MAX_SPAN = 120000; // zoom limits (ms)
const PRESETS = [5000, 10000, 60000];
const readPref = (key, allowed, def) => { try { const v = localStorage.getItem(key); return allowed.includes(v) ? v : def; } catch { return def; } };
const writePref = (key, v) => { try { localStorage.setItem(key, v); } catch { /* storage blocked */ } };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const msClock = (ms) => `${fmtTime(ms).replace(' WIB', '')}.${String(Math.floor(((ms % 1000) + 1000) % 1000)).padStart(3, '0')}`;

// Chunks for [start, start + span] (with a margin on both sides), fetched when the view settles and kept so panning back is instant.
function useEcgRange(code, start, span, enabled) {
  const [chunks, setChunks] = useState([]);
  const [loading, setLoading] = useState(false);
  const cache = useRef(new Map());
  const loaded = useRef({ code: null, lo: 0, hi: 0 });
  const [hz, setHz] = useState(250);
  useEffect(() => {
    if (!enabled || start == null || !code) return undefined;
    if (loaded.current.code !== code) { cache.current = new Map(); loaded.current = { code, lo: 0, hi: 0 }; }
    const from = Math.floor(start - span); const to = Math.ceil(start + 2 * span);
    const covered = loaded.current.lo <= from + span * 0.5 && loaded.current.hi >= to - span * 0.5;
    const show = () => setChunks([...cache.current.values()].filter((c) => c.started_at < start + 3 * span && c.started_at + 70000 > start - 2 * span).sort((a, b) => a.started_at - b.started_at));
    if (covered) { show(); return undefined; }
    let alive = true; const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api(`/sessions/${code}/ecg?from=${from}&to=${to}`, { signal: ctrl.signal });
        if (!alive) return;
        for (const c of r.chunks) cache.current.set(c.started_at, c);
        loaded.current = { code, lo: from, hi: to }; setHz(r.sampling_hz || 250);
        if (cache.current.size > 900) { // keep the cache small
          const keep = [...cache.current.values()].filter((c) => Math.abs(c.started_at - start) < 10 * 60000); cache.current = new Map(keep.map((c) => [c.started_at, c]));
        }
        show();
      } catch { /* aborted or offline: keep what we have */ } finally { if (alive) setLoading(false); }
    }, 140);
    return () => { alive = false; clearTimeout(timer); ctrl.abort(); };
  }, [code, start, span, enabled]);
  return { chunks, hz, loading };
}

function Seg({ value, onChange, options, label }) { // small segmented control
  return (
    <span className="inline-flex overflow-hidden rounded-md border border-outline-variant/40 font-mono text-xs" role="group" aria-label={label}>
      {options.map(({ v, text, icon: Icon, disabled, title }) => (
        <button key={v} type="button" disabled={disabled} title={title} onClick={() => onChange(v)} aria-pressed={value === v}
          className={cx('flex items-center gap-1.5 px-2.5 py-1.5', value === v ? 'bg-primary-container font-semibold text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container', disabled && 'opacity-40')}>
          {Icon && <Icon className="size-3.5" />}{text}
        </button>
      ))}
    </span>
  );
}
function Tool({ icon: Icon, children, ...rest }) {
  return (
    <button type="button" {...rest} className={cx('inline-flex items-center gap-1.5 rounded-md border border-outline-variant/40 bg-surface-container-lowest px-2.5 py-1.5 text-xs font-medium hover:bg-surface-container-low disabled:opacity-40', rest.className)}>
      <Icon className="size-3.5" />{children}
    </button>
  );
}

// The ECG viewer of a session: Live (sweep) and Review (zoom, pan, minute navigation, jump to moments, heart-rate trend), hospital-paper or monitor
// theme, smoothing filter, CSV / image export and print. `ecg` is the live feed from useEcg (owned by the page, which also needs its telemetry).
export default function EcgViewer({ s, ecg, tel, color, live, mode, setMode, onSpanChange }) {
  const toast = useToast();
  const review = mode === 'review' || !live;
  const [theme, setTheme] = useState(() => readPref('ecg.viewerTheme', ['dark', 'paper'], 'dark'));
  const [filter, setFilter] = useState(() => readPref('ecg.viewerFilter', Object.keys(FILTERS), 'f25'));
  const [printing, setPrinting] = useState(false);
  const [showTrend, setShowTrend] = useState(false);
  const effTheme = printing ? 'paper' : theme; const paper = effTheme === 'paper';
  const [clock, setClock] = useState(Date.now());
  useEffect(() => { if (!live) return undefined; const id = setInterval(() => setClock(Date.now()), 2000); return () => clearInterval(id); }, [live]);
  const recStart = s.started_at;
  const recEnd = live ? clock : (s.ended_at || s.last_seen_at || recStart + 60000);
  const clampStart = useCallback((st, span) => clamp(st, recStart, Math.max(recStart, recEnd - span)), [recStart, recEnd]);

  const [view, setView] = useState({ start: live ? null : recStart, span: 10000 });
  const goReview = () => { setView((v) => ({ ...v, start: clampStart(recEnd - v.span, v.span) })); setMode('review'); };
  const start = view.start ?? clampStart(recEnd - view.span, view.span);
  useEffect(() => { onSpanChange?.(view.span); }, [view.span, onSpanChange]); // the live feed keeps enough history for the zoom level
  const range = useEcgRange(s.code, start, view.span, review);
  const canvasRef = useRef(null); const wrapRef = useRef(null);

  const filteredReview = useMemo(() => filterChunks(range.chunks, range.hz, filter), [range.chunks, range.hz, filter]);
  const filteredLive = useMemo(() => filterChunks(ecg.chunks, ecg.hz, filter), [ecg.chunks, ecg.hz, filter]);
  const chunks = review ? filteredReview : filteredLive; const hz = review ? range.hz : ecg.hz;

  const pickTheme = (v) => { setTheme(v); writePref('ecg.viewerTheme', v); };
  const pickFilter = (v) => { setFilter(v); writePref('ecg.viewerFilter', v); };
  const setSpan = (span, anchorFrac = 0.5) => setView((v) => { const st = v.start ?? start; const sp = clamp(span, MIN_SPAN, MAX_SPAN); return { span: sp, start: clampStart(st + anchorFrac * v.span - anchorFrac * sp, sp) }; });
  const moveTo = (st) => setView((v) => ({ ...v, start: clampStart(st, v.span) }));
  const centerOn = (tt) => setView((v) => ({ ...v, start: clampStart(tt - v.span / 2, v.span) }));

  // wheel zoom around the pointer (needs a non-passive listener to stop the page from scrolling)
  useEffect(() => {
    const el = wrapRef.current; if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect(); const frac = clamp((e.clientX - r.left) / r.width, 0, 1);
      setView((v) => {
        const sp = clamp(v.span * (e.deltaY > 0 ? 1.15 : 1 / 1.15), MIN_SPAN, MAX_SPAN);
        if (!review) return { ...v, span: sp }; // live: the sweep just shows more or fewer seconds
        return { span: sp, start: clampStart((v.start ?? start) + frac * v.span - frac * sp, sp) };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [review, start, clampStart]);

  const drag = useRef(null); const [hover, setHover] = useState(null);
  const onDown = (e) => {
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a pointer that is already gone: keep going without capture */ }
    if (!review) { const st = clampStart(recEnd - view.span, view.span); goReview(); drag.current = { x: e.clientX, start: st }; return; } // grabbing a running strip opens Review at this moment
    drag.current = { x: e.clientX, start };
  };
  const onMove = (e) => {
    if (!review && !drag.current) return;
    const r = wrapRef.current.getBoundingClientRect(); const frac = clamp((e.clientX - r.left) / r.width, 0, 1);
    if (drag.current) { moveTo(drag.current.start - ((e.clientX - drag.current.x) / r.width) * view.span); setHover(null); return; }
    const tt = start + frac * view.span; const dt = 1000 / hz;
    const c = filteredReview.find((x) => tt >= x.started_at && tt < x.started_at + x.samples.length * dt);
    setHover({ x: e.clientX - r.left, tt, v: c ? c.samples[Math.floor((tt - c.started_at) / dt)] : null });
  };
  const onUp = () => { drag.current = null; };
  const onKey = (e) => {
    if (!review) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); moveTo(start - view.span * 0.25); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); moveTo(start + view.span * 0.25); }
    else if (e.key === '+' || e.key === '=') setSpan(view.span / 1.5);
    else if (e.key === '-') setSpan(view.span * 1.5);
  };

  const moments = useApi(review ? `/sessions/${s.code}/moments` : null);
  const trend = useApi(showTrend ? `/sessions/${s.code}/trend` : null, { poll: live ? 30000 : undefined });
  const minutes = Math.max(1, Math.ceil((recEnd - recStart) / 60000));
  const minuteIdx = clamp(Math.floor((start - recStart) / 60000), 0, minutes - 1);
  const exportRange = review ? [start, start + view.span] : [Date.now() - 10000, Date.now()];
  const stamp = (ms) => new Date(ms).toISOString().slice(0, 19).replace(/[:T]/g, '');

  async function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  async function exportCsv() {
    try {
      const res = await fetch(`${API_URL}/api/sessions/${s.code}/ecg.csv?from=${Math.round(exportRange[0])}&to=${Math.round(exportRange[1])}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error?.message || `HTTP ${res.status}`);
      await download(await res.blob(), `ecg-${s.code}-${stamp(exportRange[0])}.csv`);
      toast({ title: t('CSV diunduh'), text: t('Rentang {a} – {b}', { a: fmtTime(exportRange[0]), b: fmtTime(exportRange[1]) }) });
    } catch (e) { toast({ tone: 'error', title: t('Gagal mengunduh CSV'), text: e.message }); }
  }
  function exportImage() {
    const cv = canvasRef.current; if (!cv) return;
    cv.toBlob((b) => { if (b) download(b, `ecg-${s.code}-${stamp(exportRange[0])}.png`); }, 'image/png');
  }
  async function printNow() {
    setPrinting(true); // always printed on the hospital paper theme
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    document.body.classList.add('ecg-printing');
    const done = () => { document.body.classList.remove('ecg-printing'); setPrinting(false); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
  }

  const PAPER_TONE = { '#2ee6c5': '#0b7480', '#38d2f0': '#0e7490', '#f5b934': '#b45309', '#6e797b': '#4b5563' }; // darker tones for the light paper
  const hudColor = paper ? (PAPER_TONE[color] || '#0b7480') : color;
  const lineColor = paper ? '#111827' : color;
  const P = paper
    ? { box: 'bg-[#fff6f4] text-[#1f2937]', line: 'border-[#e3b5b5]', muted: 'text-[#7a4a4a]', hud: 'border-[#e3b5b5] bg-white/90', dot: 'bg-[#b91c1c]', head: 'text-[#9a3412]' }
    : { box: 'bg-[#0b1c30] text-white', line: 'border-white/10', muted: 'text-white/60', hud: 'border-white/10 bg-[#13263d]/90 backdrop-blur', dot: 'bg-[#2ee6c5]', head: 'text-[#2ee6c5]' };
  const spanLabel = `${Math.round(view.span / 100) / 10} s`;
  const hasData = chunks.length > 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <CodeTag>SN: {s.device ? `${s.device.serial_number} (${s.device.model})` : t('Tanpa perangkat')}</CodeTag>
          <span className="rounded-md border border-outline-variant/40 bg-surface-container-low px-2.5 py-1 font-mono text-xs">{t('Filter perangkat')}: <span className="font-semibold text-primary">{t('Aktif ({lo} - {hi} Hz)', { lo: s.filter_low_hz, hi: s.filter_high_hz })}</span></span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Seg label={t('Mode')} value={review ? 'review' : 'live'} onChange={(v) => (v === 'live' ? setMode('live') : goReview())}
            options={[{ v: 'live', text: 'Live', icon: Activity, disabled: !live }, { v: 'review', text: t('Telaah'), icon: MonitorPlay }]} />
          {live && !review && ( // live always listens on the WebSocket; this only shows its state (REST polling covers an outage)
            <span className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/40 bg-surface-container-low px-2.5 py-1.5 font-mono text-xs text-on-surface-variant"
              title={ecg.transport === 'ws' ? t('Terhubung') : t('Menyambung… (sementara memakai REST)')}>
              <span className={cx('size-1.5 rounded-full', ecg.transport === 'ws' ? 'bg-[#00a894]' : 'animate-pulse bg-[#f5b934]')} />
              {ecg.transport === 'ws' ? 'WebSocket' : t('Menyambung…')}
            </span>
          )}
          {live && !review && <Tool icon={Pause} onClick={goReview}>{t('Bekukan (Freeze)')}</Tool>}
          {live && review && <Tool icon={Play} onClick={() => setMode('live')}>{t('Kembali ke Live')}</Tool>}
        </div>
      </div>

      <div id="ecg-viewer" className={cx('overflow-hidden rounded-xl border', P.box, P.line)}>
        <div className="hidden border-b border-[#e3b5b5] px-5 py-3 text-sm print:block">
          <p className="font-headline text-base font-bold">DETAKITA — {t('Rekaman EKG')}</p>
          <p>{s.patient?.full_name} • {s.patient?.mrn} • {t('Sesi')} #{s.code} • DPJP: {s.doctor?.full_name}</p>
          <p>{t('Rentang')}: {fmtDateTime(start)} – {fmtTime(start + view.span)} • 25 mm/s • 10 mm/mV • Lead {s.lead} • {t('Penghalus')}: {t(FILTERS[filter].label)} • {t('Dicetak')}: {fmtDateTime(Date.now())}</p>
        </div>
        <div className={cx('flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 sm:px-5', P.line)}>
          <div className="flex items-center gap-3">
            <span className={cx('size-2.5 rounded-full', live && !review ? `animate-pulse ${P.dot}` : paper ? 'bg-[#7a4a4a]/40' : 'bg-white/40')} />
            <span className="font-headline text-sm font-semibold">Continuous Lead {s.lead} Waveform Strip</span>
            <span className={cx('hidden font-mono text-xs sm:inline', P.muted)}>25 mm/s&nbsp;&nbsp;10 mm/mV</span>
          </div>
          <span className={cx('font-mono text-[11px]', P.head)}>
            {review ? `${msClock(start)} → ${fmtTime(start + view.span)}${range.loading ? ' …' : ''}` : t('Waktu Sinyal: {time} • Standard AAMI Calibration', { time: ecg.to ? fmtTime(ecg.to) : '—' })}
          </span>
        </div>
        <div ref={wrapRef} className="relative cursor-grab touch-pan-y outline-none active:cursor-grabbing" tabIndex={review ? 0 : -1} title={review ? undefined : t('Gulir untuk zoom. Seret untuk menelusuri rekaman ke belakang.')} aria-label={review ? t('Grafik EKG: seret untuk menggeser, gulir untuk zoom, tombol panah untuk bergerak') : undefined}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onPointerLeave={() => { onUp(); setHover(null); }} onKeyDown={onKey}>
          {review
            ? <EcgCanvas chunks={chunks} hz={hz} from={start} to={start + view.span} color={lineColor} grid height={260} theme={effTheme} canvasRef={canvasRef} label={t('Strip EKG Lead II')} />
            : <EcgCanvas chunks={chunks} hz={hz} live span={view.span} delay={ecg.delay} color={lineColor} grid height={260} theme={effTheme} canvasRef={canvasRef} label={t('Strip EKG Lead II')} />}
          {!hasData && (ecg.loaded || review) && !range.loading && (
            <div className={cx('pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-xs uppercase tracking-wider', paper ? 'text-[#7a4a4a]' : 'text-white/50')}>
              {live && !review ? t('Menunggu sinyal dari perangkat…') : t('Tidak ada rekaman pada rentang ini')}
            </div>
          )}
          {review && hover && (
            <>
              <div className={cx('pointer-events-none absolute inset-y-0 w-px', paper ? 'bg-[#7a4a4a]/50' : 'bg-white/40')} style={{ left: hover.x }} />
              <div className={cx('pointer-events-none absolute bottom-3 rounded-md border px-2 py-1 font-mono text-[11px]', P.hud)} style={{ left: clamp(hover.x + 10, 4, 99999), transform: hover.x > 600 ? 'translateX(calc(-100% - 20px))' : undefined }}>
                {msClock(hover.tt)} WIB{hover.v != null ? ` • ${(hover.v / 1000).toFixed(2)} mV` : ''}
              </div>
            </>
          )}
          <div className={cx('absolute right-3 top-3 flex items-center gap-4 rounded-xl border px-4 py-3', P.hud)}>
            <div>
              <p className={cx('font-mono text-[10px] uppercase tracking-wider', P.muted)}>{t('Laju Detak Jantung')}</p>
              <p className="mt-1 flex items-baseline gap-1.5"><Heart className="size-4 self-center" style={{ color: hudColor }} /><span className="font-mono text-3xl font-bold">{tel?.bpm ?? s.last_bpm ?? '—'}</span><span className={cx('font-mono text-xs', P.muted)}>BPM</span></p>
            </div>
            <div className={cx('hidden border-l pl-4 sm:block', P.line)}>
              <p className={cx('font-mono text-[10px] uppercase tracking-wider', P.muted)}>{t('Irama')}</p>
              <p className="mt-1 font-headline text-sm font-semibold" style={{ color: hudColor }}>{tel?.rhythm || s.last_rhythm || t('Menunggu analisis')}</p>
              <p className={cx('font-mono text-[11px]', P.muted)}>PR: {tel?.pr_ms ?? '—'}ms • QRS: {tel?.qrs_ms ?? '—'}ms</p>
            </div>
          </div>
        </div>
        <div className={cx('flex flex-wrap gap-x-6 gap-y-1 px-4 py-2.5 font-mono text-[11px] sm:px-5', paper ? 'text-[#7a4a4a]' : 'text-white/50')}>
          <span>{t('Skala: 10 mm/mV')}</span><span>Lead Vector: {s.lead} (+60°)</span><span>Bandwidth: {s.filter_low_hz} - {s.filter_high_hz} Hz</span>
          <span>{t('Rentang')}: {spanLabel}</span><span>{t('Penghalus')}: {t(FILTERS[filter].label)}</span>
        </div>
      </div>

      <div className="mt-3 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          {review && (<>
            <Tool icon={ChevronsLeft} title={t('Awal rekaman')} onClick={() => moveTo(recStart)}><span className="sr-only">{t('Awal rekaman')}</span></Tool>
            <Tool icon={ChevronLeft} title={t('Mundur 1 menit')} onClick={() => moveTo(start - 60000)}>-1 {t('mnt')}</Tool>
            <label className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">{t('Menit')}
              <select value={minuteIdx} onChange={(e) => moveTo(recStart + Number(e.target.value) * 60000)} aria-label={t('Menit')}
                className="rounded-md border border-outline-variant/40 bg-surface-container-lowest px-2 py-1.5 font-mono text-xs text-on-surface">
                {Array.from({ length: minutes }, (_, i) => <option key={i} value={i}>{fmtHM(recStart + i * 60000)} ({t('Mnt')} {i + 1})</option>)}
              </select>
              <span className="font-mono">/ {minutes} {t('mnt')}</span>
            </label>
            <Tool icon={ChevronRight} title={t('Maju 1 menit')} onClick={() => moveTo(start + 60000)}>+1 {t('mnt')}</Tool>
            <Tool icon={ChevronsRight} title={t('Akhir rekaman')} onClick={() => moveTo(recEnd)}><span className="sr-only">{t('Akhir rekaman')}</span></Tool>
            <select value="" onChange={(e) => e.target.value && centerOn(Number(e.target.value))} aria-label={t('Loncat ke momen…')}
              className="rounded-md border border-outline-variant/40 bg-surface-container-lowest px-2 py-1.5 text-xs">
              <option value="">{t('Loncat ke momen…')}</option>
              {(moments.data?.data || []).map((m, i) => <option key={i} value={m.at}>{fmtHM(m.at)} • {t(m.label)}{m.bpm ? ` • ${m.bpm} BPM` : ''}</option>)}
            </select>
          </>)}
            <span className="ml-auto inline-flex items-center gap-1.5">
              <span className="text-xs text-on-surface-variant">Zoom:</span>
              <Seg label="Zoom" value={view.span} onChange={(v) => setSpan(v)} options={PRESETS.map((p) => ({ v: p, text: `${p / 1000}s` }))} />
              <Tool icon={ZoomOut} title={t('Perkecil')} onClick={() => setSpan(view.span * 1.5)}><span className="sr-only">{t('Perkecil')}</span></Tool>
              <Tool icon={ZoomIn} title={t('Perbesar')} onClick={() => setSpan(view.span / 1.5)}><span className="sr-only">{t('Perbesar')}</span></Tool>
            </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Seg label={t('Tema')} value={theme} onChange={pickTheme} options={[{ v: 'dark', text: 'Monitor', icon: Zap }, { v: 'paper', text: t('Kertas RS'), icon: FileText, title: t('Kertas EKG standar rumah sakit') }]} />
          <label className="inline-flex items-center gap-1.5 text-xs text-on-surface-variant">{t('Penghalus')}
            <select value={filter} onChange={(e) => pickFilter(e.target.value)} aria-label={t('Penghalus')} className="rounded-md border border-outline-variant/40 bg-surface-container-lowest px-2 py-1.5 text-xs text-on-surface">
              {Object.entries(FILTERS).map(([k, f]) => <option key={k} value={k}>{t(f.label)}</option>)}
            </select>
          </label>
          {review && <Tool icon={TrendingUp} aria-pressed={showTrend} onClick={() => setShowTrend((v) => !v)} className={showTrend ? '!bg-primary-container !text-on-primary' : ''}>{t('Tren Makro')}</Tool>}
          <span className="ml-auto inline-flex flex-wrap items-center gap-2">
            <Tool icon={FileDown} onClick={exportCsv}>CSV</Tool>
            <Tool icon={ImageIcon} onClick={exportImage}>{t('Gambar')}</Tool>
            <Tool icon={Printer} onClick={printNow}>{t('Cetak')}</Tool>
          </span>
        </div>
        {review && showTrend && (
          <div>
            <p className="mb-2 text-xs text-on-surface-variant">{t('Garis tren detak jantung seluruh rekaman. Klik atau seret untuk membuka bagian tersebut.')}</p>
            {trend.data
              ? <TrendChart data={trend.data.data} startAt={recStart} endAt={recEnd} windowFrom={start} windowTo={start + view.span} onPick={centerOn} />
              : <p className="text-sm text-outline">{t('Memuat data…')}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
