import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BriefcaseMedical, Check, Phone, Plus, ShieldPlus, Trash2, UserCheck, UserPlus, UserRound, UserX } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useApi } from '../../lib/useApi.js';
import { useList } from '../../lib/useList.js';
import { SHIFTS, SIMPLE_STATUS } from '../../lib/format.js';
import DataTable from '../../components/DataTable.jsx';
import BulkBar from '../../components/BulkBar.jsx';
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
    if (!form.full_name.trim()) errs.full_name = 'Wajib diisi';
    if (!form.nik.trim()) errs.nik = 'Wajib diisi';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const saved = await api('/nurses', { method: 'POST', body: { ...form, unit_id: form.unit_id ? Number(form.unit_id) : null, nira: form.nira || null } });
      toast({ title: 'Perawat ditambahkan', text: saved.full_name });
      onSaved(saved);
    } catch (err) { setErrors(fieldErrors(err)); toast({ tone: 'error', title: 'Gagal menyimpan', text: err.message }); } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title="Tambah Tenaga Perawat" icon={UserPlus}
      footer={<><Button variant="secondary" onClick={onClose}>Batal</Button><Button icon={Check} onClick={save} loading={saving}>Simpan Data Perawat</Button></>}>
      <div className="grid gap-4">
        <Input label="Nama Lengkap beserta Gelar" required value={form.full_name} onChange={set('full_name')} error={errors.full_name} placeholder="Contoh: Ns. Anita Rahmawati, S.Kep" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="NIK / NIP" required value={form.nik} onChange={set('nik')} error={errors.nik} placeholder="16 digit NIK atau NIP RS" mono />
          <Input label="Nomor Registrasi NIRA" value={form.nira} onChange={set('nira')} error={errors.nira} placeholder="3174XXXXXXXX" mono />
        </div>
        <Select label="Unit Penugasan" value={form.unit_id} onChange={set('unit_id')} placeholder="Pilih unit…" options={unitOptions(lookups)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Shift Kerja" value={form.shift} onChange={set('shift')} options={SHIFT_OPTIONS} />
          <Select label="Status Kepegawaian" value={form.status} onChange={set('status')} options={[{ value: 'active', label: 'Aktif' }, { value: 'inactive', label: 'Nonaktif / Cuti' }]} />
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
      toast({ title: 'Status diperbarui', text: `${list.selected.size} perawat kini ${SIMPLE_STATUS[status]}.` });
      list.clearSelection(); list.reload(true);
    } catch (e) { toast({ tone: 'error', title: 'Gagal memperbarui', text: e.message }); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader title="Daftar Perawat" badge={`${list.data?.total ?? '…'} Terdaftar`}
        actions={admin && <Button icon={Plus} onClick={() => setAdding(true)} title="Tambah perawat"><span className="sr-only sm:not-sr-only">Tambah</span></Button>} />
      <SearchFilterBar
        search={list.search} onSearch={list.setSearch} placeholder="Cari nama perawat, NIRA, atau ruangan..."
        value={list.filters} onChange={list.setFilters}
        filters={[
          { key: 'status', label: 'Status Kepegawaian', chip: 'Status', options: Object.entries(SIMPLE_STATUS).map(([value, label]) => ({ value, label })) },
          { key: 'unit_id', label: 'Ruangan / Unit', chip: 'Ruangan', options: unitOptions(lookups) },
          { key: 'shift', label: 'Shift Kerja', chip: 'Shift', options: SHIFT_OPTIONS.map((o) => ({ ...o, label: o.label.split(' (')[0] })) },
        ]}
      />
      <DataTable
        list={list} selectable={admin} onRowClick={(r) => navigate(`/master/perawat/${r.code}`)}
        empty={{ icon: ShieldPlus, title: 'Belum ada perawat', text: admin ? 'Tambahkan tenaga perawat pertama.' : undefined }}
        columns={[
          { key: 'name', label: 'Perawat', render: (r) => (
            <div className="flex items-center gap-3">
              <Avatar name={r.full_name} index={r.id} muted={r.status !== 'active'} />
              <div className="min-w-0">
                <p className="font-headline text-base font-bold group-hover:text-primary">{r.full_name}</p>
                <p className="mt-0.5 text-xs text-outline">{[r.position, r.unit_name].filter(Boolean).join(' • ') || r.code}</p>
              </div>
            </div>
          ) },
          { key: 'patients', label: 'Pasien Aktif', className: 'w-36', render: (r) => <span className={`font-headline text-base font-bold ${r.active_patients ? 'text-primary' : 'text-outline'}`}>{r.active_patients} Pasien</span> },
          { key: 'status', label: 'Status', className: 'w-36', render: (r) => <StatusPill tone={r.status}>{SIMPLE_STATUS[r.status]}</StatusPill> },
        ]}
      />
      <BulkBar count={list.selected.size} onClear={list.clearSelection} busy={busy} actions={[
        { key: 'active', icon: UserCheck, label: 'Aktifkan', onClick: () => setStatus('active') },
        { key: 'inactive', icon: UserX, label: 'Nonaktifkan', onClick: () => setStatus('inactive') },
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
    for (const k of ['full_name', 'nik']) if (!String(form[k]).trim()) errs[k] = 'Wajib diisi';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]));
      body.unit_id = body.unit_id ? Number(body.unit_id) : null;
      const saved = await api(`/nurses/${nurse.data.id}`, { method: 'PATCH', body });
      nurse.setData(saved);
      toast({ title: 'Perubahan disimpan', text: saved.full_name });
    } catch (err) { setErrors(fieldErrors(err)); toast({ tone: 'error', title: 'Gagal menyimpan', text: err.message }); } finally { setSaving(false); }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(`/nurses/${nurse.data.id}`, { method: 'DELETE' });
      toast({ title: 'Perawat dihapus', text: nurse.data.full_name });
      navigate('/master/perawat', { replace: true });
    } catch (err) {
      toast({ tone: 'error', title: 'Tidak dapat dihapus', text: err.status === 409 ? 'Perawat ini tercatat di sesi pemeriksaan. Ubah statusnya menjadi Nonaktif.' : err.message });
      setConfirm(false);
    } finally { setDeleting(false); }
  }

  if (nurse.loading && !nurse.data) return <LoadingBlock />;
  if (nurse.error) return <ErrorBlock error={nurse.error} onRetry={() => nurse.reload()} />;

  return (
    <form onSubmit={save} noValidate>
      <PageHeader
        back={{ to: '/master/perawat', label: 'Kembali ke Master Perawat' }}
        code={<CodeTag>#{nurse.data.code}</CodeTag>}
        actions={(
          <>
            <span className="text-sm text-outline">Status:</span>
            <Toggle checked={form.status === 'active'} onChange={(on) => setForm((f) => ({ ...f, status: on ? 'active' : 'inactive' }))} label={SIMPLE_STATUS[form.status]} disabled={!canEdit} />
            {canEdit && <Button variant="secondary" icon={Trash2} onClick={() => setConfirm(true)} className="!px-3" title="Hapus perawat"><span className="sr-only">Hapus</span></Button>}
            {canEdit && <Button type="submit" icon={Check} loading={saving}>Simpan</Button>}
          </>
        )}
      />
      <div className="space-y-4">
        <SectionCard icon={UserRound} title="Informasi Pribadi" subtitle="Identitas dan legalitas praktik keperawatan">
          <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
            <Input label="Nama Lengkap" required value={form.full_name} onChange={set('full_name')} error={errors.full_name} placeholder="Contoh: Ns. Siti Rahmawati, S.Kep" className="sm:col-span-2" />
            <Input label="Nomor Induk Kependudukan" required value={form.nik} onChange={set('nik')} error={errors.nik} placeholder="16 Digit NIK KTP atau NIP Rumah Sakit" mono />
            <Input label="Nomor Registrasi NIRA" value={form.nira} onChange={set('nira')} error={errors.nira} mono />
            <Input label="Nomor SIPP" value={form.sipp_number} onChange={set('sipp_number')} error={errors.sipp_number} placeholder="Contoh: 446/2088/SIPP/2023" mono />
            <Input label="Nomor STR Perawat" value={form.str_number} onChange={set('str_number')} error={errors.str_number} placeholder="Contoh: 31.2.1.200.3.22.189402" mono />
          </fieldset>
        </SectionCard>
        <SectionCard icon={BriefcaseMedical} title="Penugasan" subtitle="Unit, jabatan, dan shift kerja">
          <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
            <Input label="Jabatan" value={form.position} onChange={set('position')} placeholder="Contoh: Koordinator Perawat Telemetri" />
            <Select label="Unit Penugasan" value={form.unit_id} onChange={set('unit_id')} placeholder="Pilih unit…" options={unitOptions(lookups)} />
            <Select label="Shift Kerja" value={form.shift} onChange={set('shift')} placeholder="Pilih shift…" options={SHIFT_OPTIONS} />
          </fieldset>
        </SectionCard>
        <SectionCard icon={Phone} title="Kontak" subtitle="Kanal komunikasi kedinasan">
          <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
            <Input label="Email Kedinasan" type="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="nama@rs-jantung.co.id" />
            <Input label="Nomor WhatsApp" type="tel" value={form.whatsapp} onChange={set('whatsapp')} error={errors.whatsapp} placeholder="+62 812-xxxx-xxxx" icon={Phone} mono />
          </fieldset>
        </SectionCard>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} loading={deleting}
        title="Hapus perawat?" text={`${nurse.data.full_name} akan dihapus permanen dari master data.`} />
    </form>
  );
}
