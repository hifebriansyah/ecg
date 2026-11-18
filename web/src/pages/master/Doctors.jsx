import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Check, Phone, Stethoscope, Trash2, UserCheck, UserPlus, UserRound, UserX } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { useApi } from '../../lib/useApi.js';
import { useList } from '../../lib/useList.js';
import { DOCTOR_STATUS } from '../../lib/format.js';
import DataTable from '../../components/DataTable.jsx';
import BulkBar from '../../components/BulkBar.jsx';
import {
  Avatar, Button, ButtonLink, CodeTag, ConfirmDialog, ErrorBlock, Input, LoadingBlock, PageHeader, SearchFilterBar,
  SectionCard, Select, StatusPill, fieldErrors, useToast,
} from '../../components/ui.jsx';

const STATUS_OPTIONS = Object.entries(DOCTOR_STATUS).map(([value, label]) => ({ value, label }));

// ─── Daftar Dokter ────────────────────────────────────────────────────────────
export function DoctorList() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const list = useList('/doctors');
  const lookups = useApi('/lookups');
  const [busy, setBusy] = useState(null);
  const admin = can('master.write');

  async function setStatus(status) {
    setBusy(status);
    try {
      await Promise.all([...list.selected].map((id) => api(`/doctors/${id}`, { method: 'PATCH', body: { status } })));
      toast({ title: 'Status diperbarui', text: `${list.selected.size} dokter kini ${DOCTOR_STATUS[status]}.` });
      list.clearSelection(); list.reload(true);
    } catch (e) { toast({ tone: 'error', title: 'Gagal memperbarui', text: e.message }); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader title="Daftar Dokter" badge={`${list.data?.total ?? '…'} Terdaftar`}
        actions={admin && <ButtonLink to="/master/dokter/baru" icon={UserPlus} title="Tambah dokter"><span className="sr-only sm:not-sr-only">Tambah</span></ButtonLink>} />
      <SearchFilterBar
        search={list.search} onSearch={list.setSearch} placeholder="Cari nama dokter, spesialisasi..."
        value={list.filters} onChange={list.setFilters}
        filters={[
          { key: 'status', label: 'Status Praktik', chip: 'Status', options: STATUS_OPTIONS },
          { key: 'subspecialty', label: 'Subspesialisasi', chip: 'Subspesialis', options: (lookups.data?.subspecialties || []).map((s) => ({ value: s.code, label: s.short_name })) },
          { key: 'quota', label: 'Beban Kuota Pasien', chip: 'Kuota', options: [{ value: 'available', label: 'Tersedia' }, { value: 'near_full', label: 'Mendekati Penuh' }] },
        ]}
      />
      <DataTable
        list={list} selectable={admin} onRowClick={(r) => navigate(`/master/dokter/${r.code}`)}
        empty={{ icon: Stethoscope, title: 'Belum ada dokter', text: admin ? 'Tambahkan dokter DPJP pertama.' : undefined }}
        columns={[
          { key: 'name', label: 'Dokter DPJP', render: (r) => (
            <div className="flex items-center gap-3">
              <Avatar name={r.full_name} index={r.id} muted={r.status === 'inactive'} />
              <div className="min-w-0">
                <p className="font-headline text-base font-bold group-hover:text-primary">{r.full_name}</p>
                <p className="mt-0.5 text-xs text-outline">{r.specialty_label || r.code}</p>
              </div>
            </div>
          ) },
          { key: 'patients', label: 'Pasien Aktif', className: 'w-40', render: (r) => (
            <div>
              <span className={`font-headline text-base font-bold ${r.active_patients ? 'text-primary' : 'text-outline'}`}>{r.active_patients} Pasien</span>
              {r.patient_quota != null && <p className={`text-xs ${r.quota_state === 'near_full' ? 'text-[#9a5a12]' : 'text-outline'}`}>Kuota {r.patient_quota}{r.quota_state === 'near_full' ? ' • hampir penuh' : ''}</p>}
            </div>
          ) },
          { key: 'status', label: 'Status', className: 'w-36', render: (r) => <StatusPill tone={r.status}>{DOCTOR_STATUS[r.status]}</StatusPill> },
        ]}
      />
      <BulkBar count={list.selected.size} onClear={list.clearSelection} busy={busy} actions={[
        { key: 'active', icon: UserCheck, label: 'Aktifkan', onClick: () => setStatus('active') },
        { key: 'inactive', icon: UserX, label: 'Nonaktifkan', onClick: () => setStatus('inactive') },
      ]} />
    </>
  );
}

// ─── Tambah / Edit Dokter ─────────────────────────────────────────────────────
const EMPTY = { full_name: '', nik: '', str_number: '', sip_number: '', subspecialty_code: '', specialty_label: '', email: '', whatsapp: '', status: 'active', patient_quota: '' };

export function DoctorForm() {
  const { key } = useParams();
  const isNew = !key;
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can('master.write');
  const doctor = useApi(isNew ? null : `/doctors/${key}`);
  const lookups = useApi('/lookups');
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (doctor.data) setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, doctor.data[k] ?? ''])));
  }, [doctor.data]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e?.preventDefault();
    const req = ['full_name', 'nik', 'str_number', 'sip_number', 'subspecialty_code', 'email', 'whatsapp'];
    const errs = Object.fromEntries(req.filter((k) => !String(form[k]).trim()).map((k) => [k, 'Wajib diisi']));
    if (form.nik && !/^\d{16}$/.test(form.nik.replace(/\s/g, ''))) errs.nik = 'Harus 16 digit angka';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = { ...form, patient_quota: form.patient_quota === '' ? null : Number(form.patient_quota) };
      const saved = await api(isNew ? '/doctors' : `/doctors/${doctor.data.id}`, { method: isNew ? 'POST' : 'PATCH', body });
      toast({ title: isNew ? 'Dokter ditambahkan' : 'Perubahan disimpan', text: saved.full_name });
      if (isNew) navigate(`/master/dokter/${saved.code}`, { replace: true }); else doctor.setData(saved);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Gagal menyimpan', text: err.status === 409 && err.fields ? 'Ada data yang sudah dipakai dokter lain.' : err.message });
    } finally { setSaving(false); }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(`/doctors/${doctor.data.id}`, { method: 'DELETE' });
      toast({ title: 'Dokter dihapus', text: doctor.data.full_name });
      navigate('/master/dokter', { replace: true });
    } catch (err) {
      toast({ tone: 'error', title: 'Tidak dapat dihapus', text: err.status === 409 ? 'Dokter ini memiliki sesi pemeriksaan. Ubah statusnya menjadi Nonaktif.' : err.message });
      setConfirm(false);
    } finally { setDeleting(false); }
  }

  if (!isNew && doctor.loading && !doctor.data) return <LoadingBlock />;
  if (!isNew && doctor.error) return <ErrorBlock error={doctor.error} onRetry={() => doctor.reload()} />;

  return (
    <form onSubmit={save} noValidate>
      <PageHeader
        back={{ to: '/master/dokter', label: 'Kembali ke Daftar Dokter' }}
        code={<CodeTag>{isNew ? '#DOKTER-BARU' : `#${doctor.data.code}`}</CodeTag>}
        actions={(
          <>
            <Select className="w-36" aria-label="Status" value={form.status} onChange={set('status')} options={STATUS_OPTIONS} disabled={!canEdit} label="" />
            {!isNew && canEdit && <Button variant="secondary" icon={Trash2} onClick={() => setConfirm(true)} title="Hapus dokter" className="!px-3"><span className="sr-only">Hapus</span></Button>}
            {canEdit && <Button type="submit" icon={Check} loading={saving}>Simpan</Button>}
          </>
        )}
      />
      <div className="space-y-4">
        <SectionCard icon={UserRound} title="Informasi Pribadi" subtitle="Identitas, legalitas praktik, dan peminatan klinis">
          <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
            <Input label="Nama Lengkap & Gelar" required value={form.full_name} onChange={set('full_name')} error={errors.full_name} placeholder="dr. Nama Lengkap, Sp.JP" />
            <Input label="Nomor Induk Kependudukan (NIK)" required value={form.nik} onChange={set('nik')} error={errors.nik} inputMode="numeric" maxLength={16} mono />
            <Input label="Nomor STR" required value={form.str_number} onChange={set('str_number')} error={errors.str_number} mono />
            <Input label="Nomor SIP" required value={form.sip_number} onChange={set('sip_number')} error={errors.sip_number} mono />
            <Select label="Spesialisasi & Peminatan" required value={form.subspecialty_code} onChange={set('subspecialty_code')} error={errors.subspecialty_code}
              placeholder="Pilih peminatan…" options={(lookups.data?.subspecialties || []).map((s) => ({ value: s.code, label: s.name }))} className="sm:col-span-2" />
            <Input label="Keterangan di Daftar" value={form.specialty_label} onChange={set('specialty_label')} hint="Contoh: Spesialis Jantung & Pembuluh Darah • Aritmia" />
            <Input label="Kuota Pasien Aktif" type="number" min={0} value={form.patient_quota} onChange={set('patient_quota')} error={errors.patient_quota} hint="Kosongkan bila tanpa batas" />
          </fieldset>
        </SectionCard>
        <SectionCard icon={Phone} title="Kontak" subtitle="Kanal komunikasi kedinasan">
          <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
            <Input label="Email Kedinasan" required type="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="nama@rs-jantung.co.id" />
            <Input label="Nomor WhatsApp" required type="tel" value={form.whatsapp} onChange={set('whatsapp')} error={errors.whatsapp} placeholder="+62 811-xxxx-xxxx" icon={Phone} mono />
          </fieldset>
        </SectionCard>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} loading={deleting}
        title="Hapus dokter?" text={`${doctor.data?.full_name || ''} akan dihapus permanen dari master data.`} />
    </form>
  );
}
