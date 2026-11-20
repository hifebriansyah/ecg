import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Activity, HeartPulse, Play, Square, Unplug, Waves, Zap } from 'lucide-react';
import { API_URL } from '../../lib/api.js';
import { openStream } from '../../lib/stream.js';
import { useApi } from '../../lib/useApi.js';
import { HZ, SCENARIOS, createGenerator } from '../../lib/simulator.js';
import { t } from '../../lib/i18n.jsx';
import { Button, CodeTag, ErrorBlock, LoadingBlock, PageHeader, SectionCard, Select, StatusPill, cx } from '../../components/ui.jsx';
import { Callout } from '../docs/parts.jsx';

const ICONS = { normal: HeartPulse, tachy: Zap, afib: Waves, leadoff: Unplug };
const INTERVALS = [{ value: '1', label: '1 detik' }, { value: '5', label: '5 detik' }];

// Konfigurasi > Simulator: sends synthetic ECG to a running session, from the browser, through the same open endpoint
// the Android app uses (POST /api/sessions/:code/data with {bpm, ecg_waveform}).
export default function Simulator() {
  const sessions = useApi('/sessions?view=running&limit=100');
  const [code, setCode] = useState('');
  const [scenario, setScenario] = useState('normal');
  const [bpm, setBpm] = useState(SCENARIOS.normal.bpm[2]);
  const [interval, setIntervalSec] = useState('1');
  const [transport, setTransport] = useState('ws'); // how the data is pushed: 'ws' (WebSocket) | 'rest' (POST /sessions/:code/data)
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState({ chunks: 0, samples: 0, failed: 0, since: null, last: null });
  const [log, setLog] = useState([]);
  const timer = useRef(null);
  const gen = useRef(null);
  const busy = useRef(false);
  const lastAt = useRef(0); // wall-clock time up to which samples have been generated
  const stream = useRef(null);
  const seq = useRef(0);
  const inflight = useRef(new Map()); // WebSocket frames sent and not acknowledged yet: seq -> { samples, bpm }
  const pending = useRef([]); // samples not delivered yet (kept when a post fails, like the Android app)
  const [, tick] = useState(0);

  const sc = SCENARIOS[scenario];
  const [min, max] = sc.bpm;
  const url = transport === 'ws' ? `${API_URL.replace(/^http/, 'ws')}/api/sessions/${code || '{code}'}/stream` : `${API_URL}/api/sessions/${code || '{code}'}/data`;
  const options = useMemo(() => (sessions.data?.data || []).map((s) => ({ value: s.code, label: `${s.patient_name} • #${s.code}` })), [sessions.data]);

  function pick(key) {
    setScenario(key); setBpm(SCENARIOS[key].bpm[2]);
    if (running) gen.current = createGenerator(key, SCENARIOS[key].bpm[2] || 0);
  }
  function changeBpm(v) { setBpm(v); if (running) gen.current = createGenerator(scenario, v); }

  async function send() {
    if (busy.current) return;
    busy.current = true;
    // as many samples as real time has passed since the last tick, so a slow request or a skipped tick leaves no hole in the trace
    const nowMs = Date.now();
    const n = Math.max(1, Math.min(15000, Math.round(((nowMs - lastAt.current) / 1000) * HZ)));
    lastAt.current = nowMs;
    const made = gen.current.next(n);
    const reported = made.bpm;
    const samples = pending.current.concat(made.samples).slice(-15000);
    pending.current = [];
    if (transport === 'ws') { // push over the WebSocket; the answer (ack / error) arrives in onFrame
      const n2 = ++seq.current;
      if (stream.current && stream.current.send({ seq: n2, bpm: reported, ecg_waveform: samples })) inflight.current.set(n2, { samples, bpm: reported });
      else { pending.current = samples; setLog((l) => [{ at: nowMs, status: 0, bpm: reported, n: samples.length, note: t('Antrean (menunggu koneksi)') }, ...l].slice(0, 12)); }
      busy.current = false;
      return;
    }
    let status; let note;
    try {
      const res = await fetch(`${API_URL}/api/sessions/${code}/data`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bpm: reported, ecg_waveform: samples }),
      });
      status = res.status;
      const body = await res.json().catch(() => ({}));
      note = res.ok ? `id ${body.id}` : body.error?.message || '';
      if (status === 409) stop(); // the session is no longer running
      else if (status >= 500) pending.current = samples; // try again with the next chunk
    } catch { status = 0; note = t('Tidak dapat terhubung ke server'); pending.current = samples; }
    setStats((s) => ({ ...s, chunks: s.chunks + (status === 201 ? 1 : 0), samples: s.samples + (status === 201 ? samples.length : 0), failed: s.failed + (status === 201 ? 0 : 1), last: status }));
    setLog((l) => [{ at: Date.now(), status, bpm: reported, n: samples.length, note }, ...l].slice(0, 12));
    busy.current = false;
  }

  // answers to the frames pushed over the WebSocket
  function onFrame(m) {
    if (m.type !== 'ack' && m.type !== 'error') return;
    const sent = inflight.current.get(m.seq); inflight.current.delete(m.seq);
    const n = sent ? sent.samples.length : 0;
    const ok = m.type === 'ack';
    if (!ok && m.status === 409) stop();
    else if (!ok && m.status >= 500 && sent) pending.current = sent.samples.concat(pending.current).slice(-15000);
    setStats((s) => ({ ...s, chunks: s.chunks + (ok ? 1 : 0), samples: s.samples + (ok ? n : 0), failed: s.failed + (ok ? 0 : 1), last: ok ? 201 : m.status }));
    setLog((l) => [{ at: Date.now(), status: ok ? 201 : m.status, bpm: sent ? sent.bpm : 0, n, note: ok ? `id ${m.id} • WebSocket` : m.message }, ...l].slice(0, 12));
  }
  function onState(st) {
    if (st !== 'closed') return;
    for (const v of inflight.current.values()) pending.current = pending.current.concat(v.samples); // unacknowledged: send again once reconnected
    inflight.current.clear(); pending.current = pending.current.slice(-15000);
    setLog((l) => [{ at: Date.now(), status: 0, bpm: 0, n: 0, note: t('WebSocket terputus; mencoba menyambung lagi…') }, ...l].slice(0, 12));
  }

  function start() {
    gen.current = createGenerator(scenario, bpm || 0);
    lastAt.current = Date.now() - Number(interval) * 1000; pending.current = [];
    setStats({ chunks: 0, samples: 0, failed: 0, since: Date.now(), last: null }); setLog([]);
    setRunning(true);
    if (transport === 'ws') stream.current = openStream(code, { role: 'push', onMessage: onFrame, onState });
    send();
    timer.current = setInterval(send, Number(interval) * 1000);
  }
  function stop() { clearInterval(timer.current); timer.current = null; stream.current?.close(); stream.current = null; inflight.current.clear(); setRunning(false); }
  useEffect(() => () => { clearInterval(timer.current); stream.current?.close(); }, []);
  useEffect(() => { if (!running) return undefined; const id = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(id); }, [running]);

  if (sessions.loading && !sessions.data) return <LoadingBlock />;
  if (sessions.error) return <ErrorBlock error={sessions.error} onRetry={() => sessions.reload()} />;
  const elapsed = stats.since ? Math.floor((Date.now() - stats.since) / 1000) : 0;
  const mmss = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  return (
    <>
      <PageHeader title={t('Simulator')} badge={t('Konfigurasi')}
        actions={running
          ? <Button variant="danger" icon={Square} onClick={stop}>{t('Hentikan')}</Button>
          : <Button icon={Play} onClick={start} disabled={!code}>{t('Mulai Kirim Data')}</Button>} />
      <div className="space-y-4">
        <Callout tone="warn" title={t('Data uji masuk ke sesi sungguhan')}>
          {t('Simulator mengirim EKG sintetis ke sesi yang sedang berjalan, sama seperti aplikasi Android. Gunakan hanya pada sesi uji atau demo.')}
        </Callout>

        <SectionCard icon={Activity} title={t('Sesi Tujuan')} subtitle={t('Hanya sesi yang sedang berjalan')}>
          <div className="grid gap-5 sm:grid-cols-3">
            <Select label={t('Sesi')} value={code} onChange={(e) => setCode(e.target.value)} disabled={running} placeholder={t('Pilih sesi…')} options={options}
              hint={options.length === 0 ? t('Tidak ada sesi berjalan. Buat sesi lewat Tambah Sesi.') : undefined} />
            <Select label={t('Pengiriman')} value={transport} onChange={(e) => setTransport(e.target.value)} disabled={running} options={[{ value: 'ws', label: 'WebSocket' }, { value: 'rest', label: 'REST (POST)' }]} />
            <Select label={t('Interval Kirim')} value={interval} onChange={(e) => setIntervalSec(e.target.value)} disabled={running} options={INTERVALS.map((o) => ({ ...o, label: t(o.label) }))} />
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-outline">{t('Endpoint')}: <CodeTag>{transport === 'ws' ? 'GET' : 'POST'} {url}</CodeTag></p>
        </SectionCard>

        <SectionCard icon={HeartPulse} title={t('Skenario')} subtitle={t('Dapat diganti saat berjalan')}>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(SCENARIOS).map(([key, s]) => {
              const Icon = ICONS[key];
              return (
                <button key={key} type="button" onClick={() => pick(key)} aria-pressed={scenario === key}
                  className={cx('flex items-start gap-3 rounded-xl border p-4 text-left transition-colors', scenario === key ? 'border-primary-container bg-surface-container-low' : 'border-outline-variant/40 hover:bg-surface-container-low')}>
                  <span className={cx('flex size-9 shrink-0 items-center justify-center rounded-lg', scenario === key ? 'bg-primary-container text-on-primary' : 'bg-surface-container text-primary')}><Icon className="size-5" /></span>
                  <span><span className="block font-headline font-semibold">{t(s.label)}</span><span className="block text-sm text-on-surface-variant">{t(s.hint)}</span></span>
                </button>
              );
            })}
          </div>
          {max > 0 && (
            <div className="mt-6 max-w-md">
              <label htmlFor="sim-bpm" className="mb-2 flex items-center justify-between text-sm font-medium">{t('Detak jantung')}<span className="font-mono text-primary">{bpm} BPM</span></label>
              <input id="sim-bpm" type="range" min={min} max={max} value={bpm} onChange={(e) => changeBpm(Number(e.target.value))} className="w-full accent-primary-container" />
            </div>
          )}
        </SectionCard>

        <SectionCard icon={Activity} title={t('Status Pengiriman')} subtitle={running ? t('Sedang mengirim…') : t('Belum berjalan')}>
          <div className="grid gap-3 sm:grid-cols-4">
            {[[t('Paket terkirim'), stats.chunks], [t('Sampel'), stats.samples.toLocaleString()], [t('Gagal'), stats.failed], [t('Durasi'), mmss]].map(([label, v]) => (
              <div key={label} className="rounded-xl border border-outline-variant/30 p-4"><p className="text-sm text-on-surface-variant">{label}</p><p className="mt-1 font-mono text-2xl font-bold">{v}</p></div>
            ))}
          </div>
          {code && <p className="mt-4 text-sm"><Link to={`/sesi/${code}`} className="font-semibold text-primary hover:underline">{t('Buka sesi untuk melihat grafiknya')}</Link></p>}
          {log.length > 0 && (
            <ul className="mt-4 divide-y divide-outline-variant/20 rounded-lg border border-outline-variant/30 font-mono text-xs">
              {log.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                  <span className="text-outline">{new Date(r.at).toLocaleTimeString()}</span>
                  <StatusPill tone={r.status === 201 ? 'active' : 'error'}>{r.status || 'ERR'}</StatusPill>
                  <span>{r.n} {t('sampel')} • {r.bpm} BPM</span>
                  <span className="text-outline">{r.note}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
