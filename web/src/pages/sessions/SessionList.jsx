import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Activity, Archive, ArchiveRestore, CircleCheck, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api.js';
import { t } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useList } from '../../lib/useList.js';
import { fmtDate, fmtTime, rhythmTone, sexShort } from '../../lib/format.js';
import { useStats } from '../../components/Layout.jsx';
import DataTable from '../../components/DataTable.jsx';
import BulkBar from '../../components/BulkBar.jsx';
import { MiniEcg } from '../../components/EcgStrip.jsx';
import { Avatar, ButtonLink, ConfirmDialog, PageHeader, SearchFilterBar, useToast } from '../../components/ui.jsx';

const VIEWS = {
  berjalan: { api: 'running', title: 'Berjalan' },
  selesai: { api: 'completed', title: 'Selesai' },
  arsip: { api: 'archived', title: 'Arsip' },
};

export default function SessionList({ view = 'berjalan' }) {
  const v = VIEWS[view] || VIEWS.berjalan;
  const live = v.api === 'running';
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { reloadStats } = useStats();
  const list = useList(`/sessions?view=${v.api}`, { poll: live ? 15000 : undefined });
  const [busy, setBusy] = useState(null);
  const [confirm, setConfirm] = useState(false);

  async function bulk(action) {
    setBusy(action);
    try {
      const codes = [...list.selected];
      const r = await api('/sessions/bulk', { method: 'POST', body: { action, codes } });
      const n = r.done.length;
      if (action === 'delete') toast({ title: t('Berhasil Dihapus'), text: t('{n} sesi pemeriksaan telah dihapus secara permanen.', { n }) });
      else toast({ title: t({ complete: 'Sesi ditandai selesai', archive: 'Sesi diarsipkan', unarchive: 'Sesi dipulihkan dari arsip' }[action]), text: t('{n} sesi diperbarui.', { n }) });
      list.clearSelection(); list.reload(true); reloadStats();
    } catch (e) { toast({ tone: 'error', title: t('Aksi gagal'), text: e.message }); } finally { setBusy(null); setConfirm(false); }
  }

  const actions = [
    live && can('sessions.complete') && { key: 'complete', icon: CircleCheck, label: t('Selesai'), onClick: () => bulk('complete') },
    v.api !== 'archived' && can('sessions.archive') && { key: 'archive', icon: Archive, label: t('Arsip'), onClick: () => bulk('archive') },
    v.api === 'archived' && can('sessions.archive') && { key: 'unarchive', icon: ArchiveRestore, label: t('Pulihkan'), onClick: () => bulk('unarchive') },
    can('sessions.delete') && { key: 'delete', icon: Trash2, title: t('Hapus permanen'), danger: true, onClick: () => setConfirm(true) },
  ].filter(Boolean);

  return (
    <>
      <PageHeader title={t('Sesi Pemeriksaan')} badge={`${list.data?.total ?? '…'} ${t(v.title)}`}
        actions={can('sessions.create') && <ButtonLink to="/sesi/baru" icon={Plus} title={t('Tambah sesi')}><span className="sr-only sm:not-sr-only">{t('Tambah Sesi')}</span></ButtonLink>} />
      <SearchFilterBar
        search={list.search} onSearch={list.setSearch} placeholder={t('Cari nama pasien, no. RM, atau kode sesi...')}
        value={list.filters} onChange={list.setFilters}
        filters={[
          { key: 'lead', label: t('Sadapan (Lead)'), chip: 'Lead', options: [{ value: 'II', label: 'Lead II' }] },
          { key: 'sync_interval', label: t('Interval Sinkronisasi'), chip: t('Interval'), options: [{ value: 5, label: '5s' }, { value: 1, label: '1s' }] },
        ]}
      />
      <DataTable
        list={list} rowKey={(r) => r.code} selectable={actions.length > 0} minWidth={860}
        onRowClick={(r) => navigate(`/sesi/${r.code}`)}
        empty={{ icon: Activity, title: t('Tidak ada sesi {view}', { view: t(v.title).toLowerCase() }), text: live && can('sessions.create') ? t('Mulai sesi Holter baru dari menu Tambah Sesi.') : undefined }}
        columns={[
          { key: 'patient', label: t('Nama Pasien'), render: (r) => (
            <div className="flex items-center gap-3">
              <Avatar name={r.patient_name} index={r.patient_id + 3} />
              <div className="min-w-0">
                <p className="font-headline text-base font-semibold group-hover:text-primary">{r.patient_name}</p>
                <p className="font-mono text-xs text-outline">{r.patient_mrn} • {t('{age} th', { age: r.patient_age })} ({t(sexShort(r.patient_sex))})</p>
                <p className="mt-0.5 truncate text-xs text-outline">{r.doctor_name}</p>
              </div>
            </div>
          ) },
          { key: 'date', label: t('Tanggal'), className: 'w-40', render: (r) => (
            <div>
              <p className="text-sm font-medium">{fmtDate(r.started_at)}</p>
              <p className="font-mono text-xs text-outline">{fmtTime(r.started_at)}</p>
            </div>
          ) },
          { key: 'ecg', label: t('Garis EKG'), className: 'w-[380px]', render: (r) => (
            <MiniEcg code={r.code} live={r.status === 'running'} lastSeen={r.last_seen_at} bpm={r.last_bpm} rhythm={r.last_rhythm} tone={rhythmTone(r.last_bpm, r.last_rhythm || '')} />
          ) },
        ]}
      />
      <BulkBar count={list.selected.size} onClear={list.clearSelection} busy={busy} actions={actions} />
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => bulk('delete')} loading={busy === 'delete'}
        title={t('Hapus sesi pemeriksaan?')} confirmLabel={t('Hapus Permanen')}
        text={t('{n} sesi beserta rekaman EKG, telemetri, catatan, dan hasil analisis AI akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.', { n: list.selected.size })} />
    </>
  );
}
