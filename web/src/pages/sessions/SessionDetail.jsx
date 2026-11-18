import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Archive, ArchiveRestore, BatteryMedium, Brain, CircleCheck, Heart, LoaderCircle, Pause, PhoneCall, Play, RefreshCw,
  Send, Signal, Sparkles, Stethoscope, Trash2, UserRound, Waves, Cpu,
} from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useApi } from '../../lib/useApi.js';
import { TONE_COLOR, fmtDateTime, fmtDuration, fmtHM, fmtTime, rhythmTone, sexLabel } from '../../lib/format.js';
import { useStats } from '../../components/Layout.jsx';
import { EcgCanvas, useEcg } from '../../components/EcgStrip.jsx';
import {
  Button, Card, CodeTag, ConfirmDialog, ErrorBlock, LoadingBlock, PageHeader, Select, StatusPill, cx, useToast,
} from '../../components/ui.jsx';

function Info({ label, children, mono, accent }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-outline">{label}</p>
      <div className={cx('mt-1 break-words text-sm font-medium', mono && 'font-mono', accent && 'text-primary')}>{children ?? '—'}</div>
    </div>
  );
}
function Block({ icon: Icon, title, children, cols = 3 }) {
  return (
    <div>
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant"><Icon className="size-4 text-primary" />{title}</p>
      <div className={cx('grid gap-x-6 gap-y-4 rounded-xl border border-outline-variant/30 bg-surface-container-low/40 p-4 sm:p-5', cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}>{children}</div>
    </div>
  );
}

function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, [active]);
  return now;
}

const signalLabel = (q) => (q == null ? '—' : q >= 95 ? 'Sangat Baik' : q >= 85 ? 'Baik' : q >= 70 ? 'Cukup' : 'Buruk');

// ─── live monitor ─────────────────────────────────────────────────────────────
function Monitor({ s }) {
  const live = s.status === 'running';
  const [frozen, setFrozen] = useState(false);
  const [frozenAt, setFrozenAt] = useState(null);
  const t = s.latest_telemetry;
  const to = frozen ? frozenAt : live ? undefined : (s.last_seen_at || s.ended_at || undefined);
  const ecg = useEcg(s.code, { span: 10000, to, poll: live && !frozen ? Math.max(2000, s.sync_interval_sec * 1000) : undefined });
  const tone = rhythmTone(t?.bpm ?? s.last_bpm, t?.rhythm || s.last_rhythm || '');
  const color = TONE_COLOR[tone];
  const battery = t?.battery_pct;

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <CodeTag>SN: {s.device ? `${s.device.serial_number} (${s.device.model})` : 'Tanpa perangkat'}</CodeTag>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md border border-outline-variant/40 bg-surface-container-low px-2.5 py-1 font-mono text-xs">Filter: <span className="font-semibold text-primary">Aktif ({s.filter_low_hz} - {s.filter_high_hz} Hz)</span></span>
          {live && (
            <Button variant="secondary" icon={frozen ? Play : Pause} className="!py-1.5" onClick={() => { setFrozen((f) => !f); setFrozenAt(Date.now()); }}>
              {frozen ? 'Lanjutkan' : 'Bekukan (Freeze)'}
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-[#0b1c30] text-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <span className={cx('size-2.5 rounded-full', live && !frozen ? 'animate-pulse bg-[#2ee6c5]' : 'bg-white/40')} />
            <span className="font-headline text-sm font-semibold">Continuous Lead {s.lead} Waveform Strip</span>
            <span className="hidden font-mono text-xs text-white/60 sm:inline">25 mm/s&nbsp;&nbsp;10 mm/mV</span>
          </div>
          <span className="font-mono text-[11px] text-[#2ee6c5]">Waktu Sinyal: {ecg.to ? fmtTime(ecg.to) : '—'} • Standard AAMI Calibration</span>
        </div>
        <div className="relative">
          <EcgCanvas chunks={ecg.chunks} hz={ecg.hz} from={ecg.from} to={ecg.to} color={color} grid height={240} label="Strip EKG Lead II" />
          {ecg.loaded && ecg.chunks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center font-mono text-xs uppercase tracking-wider text-white/50">
              {live ? 'Menunggu sinyal dari perangkat…' : 'Tidak ada rekaman pada rentang ini'}
            </div>
          )}
          <div className="absolute right-3 top-3 flex items-center gap-4 rounded-xl border border-white/10 bg-[#13263d]/90 px-4 py-3 backdrop-blur">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-white/60">Laju Detak Jantung</p>
              <p className="mt-1 flex items-baseline gap-1.5"><Heart className="size-4 self-center" style={{ color }} /><span className="font-mono text-3xl font-bold">{t?.bpm ?? s.last_bpm ?? '—'}</span><span className="font-mono text-xs text-white/60">BPM</span></p>
            </div>
            <div className="hidden border-l border-white/10 pl-4 sm:block">
              <p className="font-mono text-[10px] uppercase tracking-wider text-white/60">Irama</p>
              <p className="mt-1 font-headline text-sm font-semibold" style={{ color }}>{t?.rhythm || s.last_rhythm || 'Menunggu analisis'}</p>
              <p className="font-mono text-[11px] text-white/60">PR: {t?.pr_ms ?? '—'}ms • QRS: {t?.qrs_ms ?? '—'}ms</p>
            </div>
          </div>
          {frozen && <span className="absolute left-3 top-3 rounded-md bg-[#f5b934] px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#0b1c30]">Dibekukan</span>}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-2.5 font-mono text-[11px] text-white/50 sm:px-5">
          <span>Skala: 10 mm/mV</span><span>Lead Vector: {s.lead} (+60°)</span><span>Bandwidth: {s.filter_low_hz} - {s.filter_high_hz} Hz</span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm text-on-surface-variant"><BatteryMedium className="size-4" />Battery</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className={cx('font-mono text-3xl font-bold', battery != null && battery < 15 ? 'text-[#c25e12]' : 'text-tertiary')}>{battery != null ? `${battery}%` : '—'}</span>
            <span className="text-sm text-on-surface-variant">{t?.battery_hours_left != null ? `±${Math.round(t.battery_hours_left)} Jam` : ''}</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-container"><div className={cx('h-full rounded-full', battery < 15 ? 'bg-[#e07a2f]' : 'bg-tertiary')} style={{ width: `${battery ?? 0}%` }} /></div>
          <p className="mt-3 font-mono text-xs text-outline">Sisa Operasional: {t?.battery_hours_left != null ? `±${Math.round(t.battery_hours_left)} Jam` : '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm text-on-surface-variant"><Signal className="size-4" />Signal Quality</p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="font-mono text-3xl font-bold">{t?.signal_quality_pct != null ? `${t.signal_quality_pct}%` : '—'}</span>
            <span className="text-sm font-medium text-tertiary">{signalLabel(t?.signal_quality_pct)}</span>
          </div>
          <p className="mt-3 flex items-center gap-2 font-mono text-sm"><span className="size-2 rounded-full bg-tertiary" />{t?.rssi_dbm != null ? `${t.rssi_dbm} dBm` : '—'}</p>
          <p className="mt-2 font-mono text-xs text-outline">Kehilangan Paket: {t?.packet_loss_pct != null ? `${t.packet_loss_pct}%` : '—'}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm text-on-surface-variant"><Waves className="size-4" />Konfigurasi Sadapan</p>
          <p className="mt-2 font-headline text-lg font-semibold">{s.lead_config.replace(/^3-lead/i, '3-Lead')}</p>
          <p className="font-mono text-sm text-primary">Vektor Lead {s.lead} Utama</p>
          <p className="mt-3 font-mono text-xs text-outline">{t?.electrode_ok === 0 ? 'Elektroda perlu dicek' : 'Elektroda Ag/AgCl Aktif'}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-2 text-sm text-on-surface-variant"><Cpu className="size-4" />Frekuensi Sampling</p>
          <p className="mt-2 font-mono text-3xl font-bold">{s.sampling_hz} Hz</p>
          <p className="font-mono text-sm text-on-surface-variant">Standar AAMI EC38</p>
          <p className="mt-3 font-mono text-xs text-outline">Sinkronisasi tiap {s.sync_interval_sec} detik</p>
        </Card>
      </div>
    </Card>
  );
}

// ─── AI analysis ──────────────────────────────────────────────────────────────
function AiAnalysis({ s }) {
  const { can } = useAuth();
  const toast = useToast();
  const [a, setA] = useState(s.latest_analysis);
  const [busy, setBusy] = useState(false);
  const pending = a && (a.status === 'queued' || a.status === 'running');
  useEffect(() => setA(s.latest_analysis), [s.latest_analysis]);
  useEffect(() => {
    if (!pending) return;
    const id = setInterval(async () => {
      try { const r = await api(`/sessions/${s.code}/analyses`); setA(r.data[0] || null); } catch { /* keep the last state */ }
    }, 5000);
    return () => clearInterval(id);
  }, [pending, s.code]);

  async function run() {
    setBusy(true);
    try { setA(await api(`/sessions/${s.code}/analyses`, { method: 'POST', body: {} })); toast({ title: 'Analisa AI dijalankan', text: 'Hasil akan muncul di sini setelah selesai.' }); }
    catch (e) { toast({ tone: 'error', title: 'Analisa tidak dapat dijalankan', text: e.message }); } finally { setBusy(false); }
  }

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex size-11 items-center justify-center rounded-xl bg-surface-container-low text-primary"><Brain className="size-6" /></div>
          <div>
            <p className="flex flex-wrap items-center gap-2 font-headline font-semibold">Analisis Aritmia AI DETAKITA
              <span className="rounded-md border border-tertiary/30 bg-[#e3f8f1] px-2 py-0.5 font-mono text-[11px] text-tertiary">Model {a?.model_version || 'v2.4'} Siap</span>
            </p>
            <p className="text-sm text-on-surface-variant">Deteksi otomatis morfologi kompleks QRS, ektopik ventrikel, dan anomali ritme real-time.</p>
          </div>
        </div>
        {can('ai.run') && <Button onClick={run} loading={busy} disabled={pending} icon={Sparkles}>Jalankan Analisa AI</Button>}
      </div>
      {a && (
        <div className="mt-4 rounded-xl border border-outline-variant/30 bg-surface-container-low/40 p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-xs text-outline">Dijalankan {fmtDateTime(a.created_at)}</span>
            {pending && <StatusPill tone="warn"><LoaderCircle className="size-3 animate-spin" />{a.status === 'queued' ? 'Dalam antrean' : 'Sedang dianalisis'}</StatusPill>}
            {a.status === 'done' && <StatusPill tone="active">Selesai</StatusPill>}
            {a.status === 'failed' && <StatusPill tone="error">Gagal</StatusPill>}
          </div>
          {pending && <p className="mt-2 text-on-surface-variant">Menunggu mesin analisis DETAKITA memproses rekaman sesi ini.</p>}
          {a.summary && <p className="mt-2 font-medium">{a.summary}</p>}
          {Array.isArray(a.findings) && a.findings.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {a.findings.map((f, i) => (
                <li key={i} className="rounded-md bg-surface-container px-2 py-1 font-mono text-xs">{f.type}{f.bpm ? ` • ${f.bpm} BPM` : ''}{f.at ? ` • ${fmtHM(f.at)}` : ''}</li>
              ))}
            </ul>
          )}
          {a.error && <p className="mt-2 text-error">{a.error}</p>}
        </div>
      )}
    </Card>
  );
}

// ─── notes timeline ───────────────────────────────────────────────────────────
const ROLE_BADGE = {
  patient: { label: 'Pasien', cls: 'bg-[#f5b934] text-[#3d2a00]' },
  doctor: { label: 'Dokter DPJP', cls: 'bg-surface-container-high text-primary' },
  nurse: { label: 'Perawat', cls: 'bg-surface-container text-on-surface-variant' },
  admin: { label: 'Admin', cls: 'bg-surface-container text-on-surface-variant' },
  system: { label: 'Sistem', cls: 'bg-surface-container text-on-surface-variant' },
};

function Notes({ s }) {
  const { user, can } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [kind, setKind] = useState(user.role === 'doctor' ? 'instruction' : 'note');
  const [posting, setPosting] = useState(false);

  async function load(before) {
    setLoading(true);
    try {
      const r = await api(`/sessions/${s.code}/notes?limit=10${before ? `&before=${before}` : ''}`);
      setItems((cur) => (before ? [...cur, ...r.data] : r.data));
      setHasMore(r.has_more);
    } catch (e) { toast({ tone: 'error', title: 'Catatan gagal dimuat', text: e.message }); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [s.code]); // eslint-disable-line react-hooks/exhaustive-deps

  async function post(e) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    try {
      const n = await api(`/sessions/${s.code}/notes`, { method: 'POST', body: { body, kind } });
      setItems((cur) => [n, ...cur]); setBody('');
    } catch (err) { toast({ tone: 'error', title: 'Catatan gagal dikirim', text: err.message }); } finally { setPosting(false); }
  }

  return (
    <Card className="p-4 sm:p-6">
      <h2 className="mb-4 font-headline text-lg font-semibold">Catatan & Keluhan</h2>
      {can('notes.write') && (
        <form onSubmit={post} className="mb-5 flex flex-col gap-2 sm:flex-row">
          <Select className="sm:w-44" aria-label="Jenis catatan" value={kind} onChange={(e) => setKind(e.target.value)}
            options={[{ value: 'note', label: 'Catatan' }, { value: 'instruction', label: 'Instruksi' }, ...(user.role !== 'doctor' ? [{ value: 'intake', label: 'Pemasangan' }] : [])]} />
          <input value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Tulis catatan sebagai ${user.role_label}…`}
            className="flex-1 rounded-lg border border-outline-variant/60 bg-surface-container-lowest px-3.5 py-2.5 text-sm placeholder:text-outline focus:border-primary-container focus:outline-none" />
          <Button type="submit" icon={Send} loading={posting} disabled={!body.trim()}>Kirim</Button>
        </form>
      )}
      <ul className="space-y-3">
        {items.map((n) => {
          const b = ROLE_BADGE[n.author_role] || ROLE_BADGE.system;
          const symptom = n.kind === 'symptom';
          return (
            <li key={n.id} className={cx('rounded-xl border p-4', symptom ? 'border-[#f5b934]/50 bg-[#fffbeb]' : 'border-outline-variant/30 bg-surface-container-low/30')}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2">
                  <span className={cx('rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider', b.cls)}>{b.label}</span>
                  <span className="font-headline text-sm font-semibold">{n.author_name}</span>
                </p>
                <span className="font-mono text-xs text-on-surface-variant">[{fmtHM(n.occurred_at)}]</span>
              </div>
              <p className="mt-2 text-sm">{n.body}{n.bpm_at_event ? ` (${n.bpm_at_event} BPM)` : ''}</p>
            </li>
          );
        })}
      </ul>
      {!loading && items.length === 0 && <p className="py-6 text-center text-sm text-outline">Belum ada catatan pada sesi ini.</p>}
      <div className="mt-4 border-t border-outline-variant/20 pt-4 text-center">
        {loading ? (
          <span className="inline-flex items-center gap-2 font-mono text-xs text-outline"><RefreshCw className="size-3.5 animate-spin" />Memuat catatan riwayat sebelumnya...</span>
        ) : hasMore ? (
          <button type="button" onClick={() => load(items[items.length - 1].occurred_at)} className="inline-flex items-center gap-2 font-mono text-xs text-primary hover:underline">
            <RefreshCw className="size-3.5" />Muat catatan riwayat sebelumnya
          </button>
        ) : items.length > 0 && <span className="font-mono text-xs text-outline">Semua catatan telah ditampilkan</span>}
      </div>
    </Card>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────
export default function SessionDetail() {
  const { code } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { reloadStats } = useStats();
  const res = useApi(`/sessions/${code}`, { poll: 15000 });
  const s = res.data;
  const now = useNow(s?.status === 'running');
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(false);

  async function act(action) {
    setBusy(action);
    try {
      if (action === 'delete') {
        await api(`/sessions/${code}`, { method: 'DELETE' });
        toast({ title: 'Berhasil Dihapus', text: 'Sesi pemeriksaan telah dihapus secara permanen.' });
        reloadStats();
        navigate('/sesi/berjalan', { replace: true });
        return;
      }
      res.setData(await api(`/sessions/${code}/${action}`, { method: 'POST' }));
      toast({ title: { complete: 'Sesi ditandai selesai', archive: 'Sesi diarsipkan', unarchive: 'Sesi dipulihkan' }[action] });
      reloadStats();
    } catch (e) { toast({ tone: 'error', title: 'Aksi gagal', text: e.message }); } finally { setBusy(null); setConfirm(false); }
  }

  if (res.loading && !s) return <LoadingBlock />;
  if (res.error) return <ErrorBlock error={res.error.status === 404 ? { message: 'Sesi tidak ditemukan atau Anda tidak memiliki akses.' } : res.error} onRetry={() => res.reload()} />;

  const p = s.patient; const d = s.doctor; const ec = s.emergency_contact;
  const back = s.archived_at ? '/sesi/arsip' : s.status === 'running' ? '/sesi/berjalan' : '/sesi/selesai';
  const remaining = s.status === 'running' ? Math.max(0, s.ends_at - now) : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        back={{ to: back, label: 'Kembali ke Sesi Pemeriksaan' }}
        code={<span className="flex items-center gap-2 font-mono text-sm text-outline">ID Sesi: <CodeTag>#{s.code}</CodeTag></span>}
        actions={(
          <>
            {s.archived_at ? <StatusPill tone="archived">Diarsipkan</StatusPill>
              : s.status === 'running' ? <StatusPill tone="running">Sedang Berjalan</StatusPill> : <StatusPill tone="completed">Selesai</StatusPill>}
            {s.status === 'running' && can('sessions.complete') && <Button variant="secondary" icon={CircleCheck} loading={busy === 'complete'} onClick={() => act('complete')}>Tandai Selesai</Button>}
            {!s.archived_at && s.status === 'completed' && can('sessions.archive') && <Button variant="secondary" icon={Archive} loading={busy === 'archive'} onClick={() => act('archive')}>Arsip</Button>}
            {s.archived_at && can('sessions.archive') && <Button variant="secondary" icon={ArchiveRestore} loading={busy === 'unarchive'} onClick={() => act('unarchive')}>Pulihkan</Button>}
            {can('sessions.delete') && <Button variant="secondary" icon={Trash2} onClick={() => setConfirm(true)} className="!px-3 !text-error" title="Hapus sesi"><span className="sr-only">Hapus</span></Button>}
          </>
        )}
      />

      <Card className="space-y-6 p-4 sm:p-6">
        <Block icon={UserRound} title="Detail Pasien">
          <Info label="Nama Pasien:"><span className="font-headline text-base font-semibold">{p.full_name}</span></Info>
          <Info label="Usia / Jenis Kelamin:">{p.age} thn • {sexLabel(p.sex)}</Info>
          <Info label="No. Rekam Medis:" mono accent>{p.mrn}</Info>
          <Info label="Waktu Mulai:" mono>{fmtDateTime(s.started_at)}</Info>
          <Info label="Target Durasi:">{s.target_duration_hours} Jam Holter</Info>
          <Info label={s.status === 'running' ? 'Sisa Waktu Pemantauan:' : 'Waktu Selesai:'} mono accent>
            {s.status === 'running'
              ? <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-tertiary" />{fmtDuration(remaining)} <span className="text-xs text-outline">(Aktif)</span></span>
              : fmtDateTime(s.ended_at)}
          </Info>
        </Block>
        <div className="grid gap-6 xl:grid-cols-2">
          <Block icon={Stethoscope} title="Detail Dokter" cols={2}>
            <Info label="Dokter DPJP:"><span className="font-headline font-semibold">{d?.full_name}</span></Info>
            <Info label="Peminatan:">{d?.subspecialty_name || d?.specialty_label}</Info>
            <Info label="Nomor STR:" mono>{d?.str_number}</Info>
            <Info label="WhatsApp:" mono accent>{d?.whatsapp ? <a href={`https://wa.me/${d.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="hover:underline">{d.whatsapp}</a> : '—'}</Info>
            <Info label="Perawat Pemasang:">{s.nurse?.full_name}</Info>
            <Info label="Indikasi Klinis:">{s.clinical_indication}</Info>
          </Block>
          <Block icon={PhoneCall} title="Kontak Darurat" cols={2}>
            <Info label="Nama Kontak:"><span className="font-headline font-semibold">{ec?.name}</span></Info>
            <Info label="Hubungan:">{ec?.relation}</Info>
            <Info label="Telepon Darurat:" mono accent>{ec?.phone ? <a href={`tel:${ec.phone.replace(/[^\d+]/g, '')}`} className="hover:underline">{ec.phone}</a> : '—'}</Info>
            <Info label="Telepon Pasien:" mono>{p.phone}</Info>
            <div className="sm:col-span-2"><Info label="Alamat:">{p.address}</Info></div>
          </Block>
        </div>
        {s.notes && <p className="rounded-lg bg-surface-container-low px-4 py-3 text-sm"><span className="font-semibold">Catatan khusus:</span> {s.notes}</p>}
      </Card>

      <Monitor s={s} />
      <AiAnalysis s={s} />
      <Notes s={s} />

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => act('delete')} loading={busy === 'delete'}
        title="Hapus sesi pemeriksaan?" confirmLabel="Hapus Permanen"
        text={`Sesi #${s.code} milik ${p.full_name} beserta rekaman EKG, telemetri, catatan, dan hasil analisis AI akan dihapus permanen.`} />
    </div>
  );
}
