import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BriefcaseMedical, Check, Phone, Plus, ShieldPlus, Trash2, UserCheck, UserPlus, UserRound, UserX } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { t } from '../../lib/i18n.jsx';
import { useApi } from '../../lib/useApi.js';
import { useList } from '../../lib/useList.js';
import { SHIFTS, SIMPLE_STATUS } from '../../lib/format.js';
import DataTable from '../../components/DataTable.jsx';
import BulkBar from '../../components/BulkBar.jsx';
import PasswordCard from '../../components/PasswordCard.jsx';
import {
  Avatar, Button, CodeTag, ConfirmDialog, ErrorBlock, Input, LoadingBlock, Modal, PageHeader, SearchFilterBar,
  SectionCard, Select, StatusPill, Toggle, fieldErrors, useToast,
} from '../../components/ui.jsx';

const SHIFT_OPTIONS = Object.entries(SHIFTS).map(([value, label]) => ({ value, label }));
const unitOptions = (lookups) => (lookups.data?.units || []).map((u) => ({ value: u.id, label: u.name }));

// ─── Tambah Tenaga Perawat (dialog from the list design) ──────────────────────
function AddNurseDialog({ open, onClose, onSaved, lookups }) {
  const toast = useToast();
  const blank = { full_name: '', nik: '', nira: '', unit_id: '', shift: 'morning', status: 'active' };
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setForm(blank); setErrors({}); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    const errs = {};
    if (!form.full_name.trim()) errs.full_name = t('Wajib diisi');
    if (!form.nik.trim()) errs.nik = t('Wajib diisi');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const saved = await api('/nurses', { method: 'POST', body: { ...form, unit_id: form.unit_id ? Number(form.unit_id) : null, nira: form.nira || null } });
      toast({ title: t('Perawat ditambahkan'), text: saved.full_name });
      onSaved(saved);
    } catch (err) { setErrors(fieldErrors(err)); toast({ tone: 'error', title: t('Gagal menyimpan'), text: err.message }); } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('Tambah Tenaga Perawat')} icon={UserPlus}
      footer={<><Button variant="secondary" onClick={onClose}>{t('Batal')}</Button><Button icon={Check} onClick={save} loading={saving}>{t('Simpan Data Perawat')}</Button></>}>
      <div className="grid gap-4">
        <Input label={t('Nama Lengkap beserta Gelar')} required value={form.full_name} onChange={set('full_name')} error={errors.full_name} placeholder={t('Contoh: Ns. Anita Rahmawati, S.Kep')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('NIK / NIP')} required value={form.nik} onChange={set('nik')} error={errors.nik} placeholder={t('16 digit NIK atau NIP RS')} mono />
          <Input label={t('Nomor Registrasi NIRA')} value={form.nira} onChange={set('nira')} error={errors.nira} placeholder="3174XXXXXXXX" mono />
        </div>
        <Select label={t('Unit Penugasan')} value={form.unit_id} onChange={set('unit_id')} placeholder={t('Pilih unit…')} options={unitOptions(lookups)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label={t('Shift Kerja')} value={form.shift} onChange={set('shift')} options={SHIFT_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} />
          <Select label={t('Status Kepegawaian')} value={form.status} onChange={set('status')} options={[{ value: 'active', label: t('Aktif') }, { value: 'inactive', label: t('Nonaktif / Cuti') }]} />
        </div>
      </div>
    </Modal>
  );
}

// ─── Daftar Perawat ───────────────────────────────────────────────────────────
export function NurseList() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const list = useList('/nurses');
  const lookups = useApi('/lookups');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);
  const admin = can('master.write');

  async function setStatus(status) {
    setBusy(status);
    try {
      await Promise.all([...list.selected].map((id) => api(`/nurses/${id}`, { method: 'PATCH', body: { status } })));
      toast({ title: t('Status diperbarui'), text: t('{n} perawat kini {status}.', { n: list.selected.size, status: t(SIMPLE_STATUS[status]) }) });
      list.clearSelection(); list.reload(true);
    } catch (e) { toast({ tone: 'error', title: t('Gagal memperbarui'), text: e.message }); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader title={t('Daftar Perawat')} badge={t('{n} Terdaftar', { n: list.data?.total ?? '…' })}
        actions={admin && <Button icon={Plus} onClick={() => setAdding(true)} title={t('Tambah perawat')}><span className="sr-only sm:not-sr-only">{t('Tambah')}</span></Button>} />
      <SearchFilterBar
        search={list.search} onSearch={list.setSearch} placeholder={t('Cari nama perawat, NIRA, atau ruangan...')}
        value={list.filters} onChange={list.setFilters}
        filters={[
          { key: 'status', label: t('Status Kepegawaian'), chip: t('Status'), options: Object.entries(SIMPLE_STATUS).map(([value, label]) => ({ value, label: t(label) })) },
          { key: 'unit_id', label: t('Ruangan / Unit'), chip: t('Ruangan'), options: unitOptions(lookups) },
          { key: 'shift', label: t('Shift Kerja'), chip: t('Shift'), options: SHIFT_OPTIONS.map((o) => ({ ...o, label: t(o.label).split(' (')[0] })) },
        ]}
      />
      <DataTable
        list={list} selectable={admin} onRowClick={(r) => navigate(`/master/perawat/${r.code}`)}
        empty={{ icon: ShieldPlus, title: t('Belum ada perawat'), text: admin ? t('Tambahkan tenaga perawat pertama.') : undefined }}
        columns={[
          { key: 'name', label: t('Perawat'), render: (r) => (
            <div className="flex items-center gap-3">
              <Avatar name={r.full_name} index={r.id} muted={r.status !== 'active'} />
              <div className="min-w-0">
                <p className="font-headline text-base font-bold group-hover:text-primary">{r.full_name}</p>
                <p className="mt-0.5 text-xs text-outline">{[r.position, r.unit_name].filter(Boolean).join(' • ') || r.code}</p>
              </div>
            </div>
          ) },
          { key: 'patients', label: t('Pasien Aktif'), className: 'w-36', render: (r) => <span className={`font-headline text-base font-bold ${r.active_patients ? 'text-primary' : 'text-outline'}`}>{t('{n} Pasien', { n: r.active_patients })}</span> },
          { key: 'status', label: t('Status'), className: 'w-36', render: (r) => <StatusPill tone={r.status}>{t(SIMPLE_STATUS[r.status])}</StatusPill> },
        ]}
      />
      <BulkBar count={list.selected.size} onClear={list.clearSelection} busy={busy} actions={[
        { key: 'active', icon: UserCheck, label: t('Aktifkan'), onClick: () => setStatus('active') },
        { key: 'inactive', icon: UserX, label: t('Nonaktifkan'), onClick: () => setStatus('inactive') },
      ]} />
      <AddNurseDialog open={adding} onClose={() => setAdding(false)} lookups={lookups} onSaved={(n) => { setAdding(false); list.reload(true); navigate(`/master/perawat/${n.code}`); }} />
    </>
  );
}

// ─── Edit Perawat ─────────────────────────────────────────────────────────────
const EMPTY = { full_name: '', nik: '', nira: '', sipp_number: '', str_number: '', position: '', unit_id: '', shift: '', email: '', whatsapp: '', status: 'active' };

export function NurseForm() {
  const { key } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can('master.write');
  const nurse = useApi(`/nurses/${key}`);
  const lookups = useApi('/lookups');
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { if (nurse.data) setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, nurse.data[k] ?? '']))); }, [nurse.data]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e?.preventDefault();
    const errs = {};
    for (const k of ['full_name', 'nik']) if (!String(form[k]).trim()) errs[k] = t('Wajib diisi');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]));
      body.unit_id = body.unit_id ? Number(body.unit_id) : null;
      const saved = await api(`/nurses/${nurse.data.id}`, { method: 'PATCH', body });
      nurse.setData(saved);
      toast({ title: t('Perubahan disimpan'), text: saved.full_name });
    } catch (err) { setErrors(fieldErrors(err)); toast({ tone: 'error', title: t('Gagal menyimpan'), text: err.message }); } finally { setSaving(false); }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(`/nurses/${nurse.data.id}`, { method: 'DELETE' });
      toast({ title: t('Perawat dihapus'), text: nurse.data.full_name });
      navigate('/master/perawat', { replace: true });
    } catch (err) {
      toast({ tone: 'error', title: t('Tidak dapat dihapus'), text: err.status === 409 ? t('Perawat ini tercatat di sesi pemeriksaan. Ubah statusnya menjadi Nonaktif.') : err.message });
      setConfirm(false);
    } finally { setDeleting(false); }
  }

  if (nurse.loading && !nurse.data) return <LoadingBlock />;
  if (nurse.error) return <ErrorBlock error={nurse.error} onRetry={() => nurse.reload()} />;

  return (
    <form onSubmit={save} noValidate>
      <PageHeader
        back={{ to: '/master/perawat', label: t('Kembali ke Master Perawat') }}
        code={<CodeTag>#{nurse.data.code}</CodeTag>}
        actions={(
          <>
            <span className="text-sm text-outline">{t('Status:')}</span>
            <Toggle checked={form.status === 'active'} onChange={(on) => setForm((f) => ({ ...f, status: on ? 'active' : 'inactive' }))} label={t(SIMPLE_STATUS[form.status])} disabled={!canEdit} />
            {canEdit && <Button variant="secondary" icon={Trash2} onClick={() => setConfirm(true)} className="!px-3" title={t('Hapus perawat')}><span className="sr-only">{t('Hapus')}</span></Button>}
            {canEdit && <Button type="submit" icon={Check} loading={saving}>{t('Simpan')}</Button>}
          </>
        )}
      />
      <div className="space-y-4">
        <SectionCard icon={UserRound} title={t('Informasi Pribadi')} subtitle={t('Identitas dan legalitas praktik keperawatan')}>
          <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
            <Input label={t('Nama Lengkap')} required value={form.full_name} onChange={set('full_name')} error={errors.full_name} placeholder={t('Contoh: Ns. Siti Rahmawati, S.Kep')} className="sm:col-span-2" />
            <Input label={t('Nomor Induk Kependudukan')} required value={form.nik} onChange={set('nik')} error={errors.nik} placeholder={t('16 Digit NIK KTP atau NIP Rumah Sakit')} mono />
            <Input label={t('Nomor Registrasi NIRA')} value={form.nira} onChange={set('nira')} error={errors.nira} mono />
            <Input label={t('Nomor SIPP')} value={form.sipp_number} onChange={set('sipp_number')} error={errors.sipp_number} placeholder={t('Contoh: 446/2088/SIPP/2023')} mono />
            <Input label={t('Nomor STR Perawat')} value={form.str_number} onChange={set('str_number')} error={errors.str_number} placeholder={t('Contoh: 31.2.1.200.3.22.189402')} mono />
          </fieldset>
        </SectionCard>
        <SectionCard icon={BriefcaseMedical} title={t('Penugasan')} subtitle={t('Unit, jabatan, dan shift kerja')}>
          <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
            <Input label={t('Jabatan')} value={form.position} onChange={set('position')} placeholder={t('Contoh: Koordinator Perawat Telemetri')} />
            <Select label={t('Unit Penugasan')} value={form.unit_id} onChange={set('unit_id')} placeholder={t('Pilih unit…')} options={unitOptions(lookups)} />
            <Select label={t('Shift Kerja')} value={form.shift} onChange={set('shift')} placeholder={t('Pilih shift…')} options={SHIFT_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} />
          </fieldset>
        </SectionCard>
        <SectionCard icon={Phone} title={t('Kontak')} subtitle={t('Kanal komunikasi kedinasan')}>
          <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
            <Input label={t('Email Kedinasan')} type="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="nama@rs-jantung.co.id" />
            <Input label={t('Nomor WhatsApp')} type="tel" value={form.whatsapp} onChange={set('whatsapp')} error={errors.whatsapp} placeholder="+62 812-xxxx-xxxx" icon={Phone} mono />
          </fieldset>
        </SectionCard>
        <PasswordCard path="nurses" id={nurse.data.id} />
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} loading={deleting}
        title={t('Hapus perawat?')} text={t('{name} akan dihapus permanen dari master data.', { name: nurse.data.full_name })} />
    </form>
  );
}
