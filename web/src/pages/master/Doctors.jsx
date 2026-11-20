import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Check, Phone, Stethoscope, Trash2, UserCheck, UserPlus, UserRound, UserX } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { t } from '../../lib/i18n.jsx';
import { useApi } from '../../lib/useApi.js';
import { useList } from '../../lib/useList.js';
import { DOCTOR_STATUS } from '../../lib/format.js';
import DataTable from '../../components/DataTable.jsx';
import BulkBar from '../../components/BulkBar.jsx';
import PasswordCard from '../../components/PasswordCard.jsx';
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
      toast({ title: t('Status diperbarui'), text: t('{n} dokter kini {status}.', { n: list.selected.size, status: t(DOCTOR_STATUS[status]) }) });
      list.clearSelection(); list.reload(true);
    } catch (e) { toast({ tone: 'error', title: t('Gagal memperbarui'), text: e.message }); } finally { setBusy(null); }
  }

  return (
    <>
      <PageHeader title={t('Daftar Dokter')} badge={t('{n} Terdaftar', { n: list.data?.total ?? '…' })}
        actions={admin && <ButtonLink to="/master/dokter/baru" icon={UserPlus} title={t('Tambah dokter')}><span className="sr-only sm:not-sr-only">{t('Tambah')}</span></ButtonLink>} />
      <SearchFilterBar
        search={list.search} onSearch={list.setSearch} placeholder={t('Cari nama dokter, spesialisasi...')}
        value={list.filters} onChange={list.setFilters}
        filters={[
          { key: 'status', label: t('Status Praktik'), chip: t('Status'), options: STATUS_OPTIONS.map((o) => ({ ...o, label: t(o.label) })) },
          { key: 'subspecialty', label: t('Subspesialisasi'), chip: t('Subspesialis'), options: (lookups.data?.subspecialties || []).map((s) => ({ value: s.code, label: s.short_name })) },
          { key: 'quota', label: t('Beban Kuota Pasien'), chip: t('Kuota'), options: [{ value: 'available', label: t('Tersedia') }, { value: 'near_full', label: t('Mendekati Penuh') }] },
        ]}
      />
      <DataTable
        list={list} selectable={admin} onRowClick={(r) => navigate(`/master/dokter/${r.code}`)}
        empty={{ icon: Stethoscope, title: t('Belum ada dokter'), text: admin ? t('Tambahkan dokter DPJP pertama.') : undefined }}
        columns={[
          { key: 'name', label: t('Dokter DPJP'), render: (r) => (
            <div className="flex items-center gap-3">
              <Avatar name={r.full_name} index={r.id} muted={r.status === 'inactive'} />
              <div className="min-w-0">
                <p className="font-headline text-base font-bold group-hover:text-primary">{r.full_name}</p>
                <p className="mt-0.5 text-xs text-outline">{r.specialty_label || r.code}</p>
              </div>
            </div>
          ) },
          { key: 'patients', label: t('Pasien Aktif'), className: 'w-40', render: (r) => (
            <div>
              <span className={`font-headline text-base font-bold ${r.active_patients ? 'text-primary' : 'text-outline'}`}>{t('{n} Pasien', { n: r.active_patients })}</span>
              {r.patient_quota != null && <p className={`text-xs ${r.quota_state === 'near_full' ? 'text-[#9a5a12]' : 'text-outline'}`}>{r.quota_state === 'near_full' ? t('Kuota {n} • hampir penuh', { n: r.patient_quota }) : t('Kuota {n}', { n: r.patient_quota })}</p>}
            </div>
          ) },
          { key: 'status', label: t('Status'), className: 'w-36', render: (r) => <StatusPill tone={r.status}>{t(DOCTOR_STATUS[r.status])}</StatusPill> },
        ]}
      />
      <BulkBar count={list.selected.size} onClear={list.clearSelection} busy={busy} actions={[
        { key: 'active', icon: UserCheck, label: t('Aktifkan'), onClick: () => setStatus('active') },
        { key: 'inactive', icon: UserX, label: t('Nonaktifkan'), onClick: () => setStatus('inactive') },
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
    const errs = Object.fromEntries(req.filter((k) => !String(form[k]).trim()).map((k) => [k, t('Wajib diisi')]));
    if (form.nik && !/^\d{16}$/.test(form.nik.replace(/\s/g, ''))) errs.nik = t('Harus 16 digit angka');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = { ...form, patient_quota: form.patient_quota === '' ? null : Number(form.patient_quota) };
      const saved = await api(isNew ? '/doctors' : `/doctors/${doctor.data.id}`, { method: isNew ? 'POST' : 'PATCH', body });
      toast({ title: isNew ? t('Dokter ditambahkan') : t('Perubahan disimpan'), text: saved.full_name });
      if (isNew) navigate(`/master/dokter/${saved.code}`, { replace: true }); else doctor.setData(saved);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: t('Gagal menyimpan'), text: err.status === 409 && err.fields ? t('Ada data yang sudah dipakai dokter lain.') : err.message });
    } finally { setSaving(false); }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(`/doctors/${doctor.data.id}`, { method: 'DELETE' });
      toast({ title: t('Dokter dihapus'), text: doctor.data.full_name });
      navigate('/master/dokter', { replace: true });
    } catch (err) {
      toast({ tone: 'error', title: t('Tidak dapat dihapus'), text: err.status === 409 ? t('Dokter ini memiliki sesi pemeriksaan. Ubah statusnya menjadi Nonaktif.') : err.message });
      setConfirm(false);
    } finally { setDeleting(false); }
  }

  if (!isNew && doctor.loading && !doctor.data) return <LoadingBlock />;
  if (!isNew && doctor.error) return <ErrorBlock error={doctor.error} onRetry={() => doctor.reload()} />;

  return (
    <form onSubmit={save} noValidate>
      <PageHeader
        back={{ to: '/master/dokter', label: t('Kembali ke Daftar Dokter') }}
        code={<CodeTag>{isNew ? t('#DOKTER-BARU') : `#${doctor.data.code}`}</CodeTag>}
        actions={(
          <>
            <Select className="w-36" aria-label={t('Status')} value={form.status} onChange={set('status')} options={STATUS_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))} disabled={!canEdit} label="" />
            {!isNew && canEdit && <Button variant="secondary" icon={Trash2} onClick={() => setConfirm(true)} title={t('Hapus dokter')} className="!px-3"><span className="sr-only">{t('Hapus')}</span></Button>}
            {canEdit && <Button type="submit" icon={Check} loading={saving}>{t('Simpan')}</Button>}
          </>
        )}
      />
      <div className="space-y-4">
        <SectionCard icon={UserRound} title={t('Informasi Pribadi')} subtitle={t('Identitas, legalitas praktik, dan peminatan klinis')}>
          <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
            <Input label={t('Nama Lengkap & Gelar')} required value={form.full_name} onChange={set('full_name')} error={errors.full_name} placeholder={t('dr. Nama Lengkap, Sp.JP')} />
            <Input label={t('Nomor Induk Kependudukan (NIK)')} required value={form.nik} onChange={set('nik')} error={errors.nik} inputMode="numeric" maxLength={16} mono />
            <Input label={t('Nomor STR')} required value={form.str_number} onChange={set('str_number')} error={errors.str_number} mono />
            <Input label={t('Nomor SIP')} required value={form.sip_number} onChange={set('sip_number')} error={errors.sip_number} mono />
            <Select label={t('Spesialisasi & Peminatan')} required value={form.subspecialty_code} onChange={set('subspecialty_code')} error={errors.subspecialty_code}
              placeholder={t('Pilih peminatan…')} options={(lookups.data?.subspecialties || []).map((s) => ({ value: s.code, label: s.name }))} className="sm:col-span-2" />
            <Input label={t('Keterangan di Daftar')} value={form.specialty_label} onChange={set('specialty_label')} hint={t('Contoh: Spesialis Jantung & Pembuluh Darah • Aritmia')} />
            <Input label={t('Kuota Pasien Aktif')} type="number" min={0} value={form.patient_quota} onChange={set('patient_quota')} error={errors.patient_quota} hint={t('Kosongkan bila tanpa batas')} />
          </fieldset>
        </SectionCard>
        <SectionCard icon={Phone} title={t('Kontak')} subtitle={t('Kanal komunikasi kedinasan')}>
          <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
            <Input label={t('Email Kedinasan')} required type="email" value={form.email} onChange={set('email')} error={errors.email} placeholder="nama@rs-jantung.co.id" />
            <Input label={t('Nomor WhatsApp')} required type="tel" value={form.whatsapp} onChange={set('whatsapp')} error={errors.whatsapp} placeholder="+62 811-xxxx-xxxx" icon={Phone} mono />
          </fieldset>
        </SectionCard>
        {!isNew && doctor.data && <PasswordCard path="doctors" id={doctor.data.id} />}
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} loading={deleting}
        title={t('Hapus dokter?')} text={t('{name} akan dihapus permanen dari master data.', { name: doctor.data?.full_name || '' })} />
    </form>
  );
}
