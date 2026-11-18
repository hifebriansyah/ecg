import { Link, useNavigate } from 'react-router';
import { Activity, Archive, ArrowRight, CircleCheck, CirclePlus, ShieldPlus, Stethoscope, UserRound } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useApi } from '../lib/useApi.js';
import { fmtDate, fmtDuration, fmtTime, rhythmTone, sexShort } from '../lib/format.js';
import { useStats } from '../components/Layout.jsx';
import { MiniEcg } from '../components/EcgStrip.jsx';
import { Avatar, ButtonLink, Card, EmptyState, LoadingBlock } from '../components/ui.jsx';

function Tile({ icon: Icon, label, value, to, tone = 'text-primary' }) {
  return (
    <Link to={to} className="group rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 transition-colors hover:border-primary-container/40">
      <div className="flex items-center justify-between">
        <p className="text-sm text-on-surface-variant">{label}</p>
        <Icon className={`size-5 ${tone}`} />
      </div>
      <p className="mt-3 font-mono text-4xl font-bold">{value ?? '—'}</p>
      <p className="mt-2 flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">Lihat <ArrowRight className="size-3.5" /></p>
    </Link>
  );
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const { stats } = useStats();
  const running = useApi('/sessions?view=running&limit=5', { poll: 15000 });
  const s = stats?.sessions;
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', hour: 'numeric', hour12: false }).format(Date.now()));
  const greeting = hour < 11 ? 'Selamat pagi' : hour < 15 ? 'Selamat siang' : hour < 18 ? 'Selamat sore' : 'Selamat malam';

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <h1 className="font-headline text-2xl font-bold tracking-tight sm:text-[28px]">{greeting}, {user.name}</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            {user.role === 'doctor' ? 'Ringkasan sesi Holter pasien DPJP Anda.' : 'Ringkasan pemantauan Holter EKG hari ini.'}
          </p>
        </div>
        {can('sessions.create') && <ButtonLink to="/sesi/baru" icon={CirclePlus}>Tambah Sesi</ButtonLink>}
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={Activity} label="Sesi Berjalan" value={s?.running} to="/sesi/berjalan" tone="text-tertiary" />
        <Tile icon={CircleCheck} label="Sesi Selesai" value={s?.completed} to="/sesi/selesai" />
        <Tile icon={Archive} label="Arsip" value={s?.archived} to="/sesi/arsip" tone="text-outline" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile icon={UserRound} label="Pasien Terdaftar" value={stats?.patients} to="/master/pasien" />
        <Tile icon={Stethoscope} label="Dokter" value={stats?.doctors} to="/master/dokter" />
        <Tile icon={ShieldPlus} label="Perawat" value={stats?.nurses} to="/master/perawat" />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4 sm:px-6">
          <h2 className="font-headline text-lg font-semibold">Sesi Berjalan Terbaru</h2>
          <Link to="/sesi/berjalan" className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">Semua <ArrowRight className="size-4" /></Link>
        </div>
        {running.loading && !running.data ? <LoadingBlock /> : running.data?.data.length === 0 ? (
          <EmptyState icon={Activity} title="Tidak ada sesi berjalan" text={can('sessions.create') ? 'Mulai sesi Holter baru untuk memantau pasien.' : undefined} />
        ) : (
          <ul className="divide-y divide-outline-variant/20">
            {running.data?.data.map((r) => (
              <li key={r.code}>
                <button type="button" onClick={() => navigate(`/sesi/${r.code}`)} className="grid w-full items-center gap-4 px-5 py-4 text-left hover:bg-surface-container-low/60 sm:px-6 lg:grid-cols-[minmax(0,1fr)_160px_380px]">
                  <span className="flex items-center gap-3">
                    <Avatar name={r.patient_name} index={r.patient_id + 3} />
                    <span className="min-w-0">
                      <span className="block font-headline font-semibold">{r.patient_name}</span>
                      <span className="block font-mono text-xs text-outline">{r.patient_mrn} • {r.patient_age} th ({sexShort(r.patient_sex)}) • {r.doctor_name}</span>
                    </span>
                  </span>
                  <span className="text-sm">
                    <span className="block font-medium">{fmtDate(r.started_at)}</span>
                    <span className="block font-mono text-xs text-outline">{fmtTime(r.started_at)} • sisa {fmtDuration(r.started_at + r.target_duration_hours * 3600000 - Date.now())}</span>
                  </span>
                  <MiniEcg code={r.code} live lastSeen={r.last_seen_at} bpm={r.last_bpm} rhythm={r.last_rhythm} tone={rhythmTone(r.last_bpm, r.last_rhythm || '')} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
