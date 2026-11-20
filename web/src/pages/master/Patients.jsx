import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Activity, Calendar, Check, Contact, HeartPulse, IdCard, Mars, Phone, Trash2, UserPlus, UserRound, UserSearch, Venus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.jsx';
import { t } from '../../lib/i18n.jsx';
import { useApi } from '../../lib/useApi.js';
import { useList } from '../../lib/useList.js';
import { SIMPLE_STATUS, fmtDateTime, sexLabel } from '../../lib/format.js';
import DataTable from '../../components/DataTable.jsx';
import PasswordCard from '../../components/PasswordCard.jsx';
import {
  Avatar, Button, ButtonLink, Card, CodeTag, ConfirmDialog, ErrorBlock, Input, LoadingBlock, PageHeader,
  SearchFilterBar, SectionCard, Select, StatusPill, Textarea, Toggle, fieldErrors, useToast,
} from '../../components/ui.jsx';

function Sex({ sex }) {
  const Icon = sex === 'F' ? Venus : Mars;
  return <span className="inline-flex items-center gap-1.5"><Icon className={`size-4 ${sex === 'F' ? 'text-[#c0507a]' : 'text-primary'}`} />{t(sexLabel(sex))}</span>;
}

// ─── Daftar Pasien ────────────────────────────────────────────────────────────
export function PatientList() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const list = useList('/patients');
  const canAdd = can('patients.write');
  return (
    <>
      <PageHeader title={t('Daftar Pasien')} badge={t('{n} Terdaftar', { n: list.data?.total ?? '…' })}
        actions={canAdd && <ButtonLink to="/master/pasien/baru" icon={UserPlus} title={t('Tambah pasien')}><span className="sr-only sm:not-sr-only">{t('Tambah')}</span></ButtonLink>} />
      <SearchFilterBar
        search={list.search} onSearch={list.setSearch} placeholder={t('Cari nama pasien, No. RM, atau NIK...')}
        value={list.filters} onChange={list.setFilters}
        filters={[
          { key: 'sex', label: t('Jenis Kelamin'), options: [{ value: 'M', label: t('Laki-laki') }, { value: 'F', label: t('Perempuan') }] },
          { key: 'status', label: t('Status'), options: Object.entries(SIMPLE_STATUS).map(([value, label]) => ({ value, label: t(label) })) },
        ]}
      />
      <DataTable
        list={list} onRowClick={(r) => navigate(`/master/pasien/${r.mrn}`)} minWidth={720}
        empty={{
          icon: UserSearch, title: t('Belum ada pasien'), text: canAdd ? t('Daftarkan pasien pertama untuk memulai sesi Holter.') : undefined,
          filteredTitle: t('Pasien Tidak Ditemukan'), filteredText: t('Tidak ada data pasien yang cocok dengan kata kunci atau filter saat ini.'), resetLabel: t('Kembalikan ke semua pasien'),
        }}
        columns={[
          { key: 'name', label: t('Nama Pasien & No. RM'), render: (r) => (
            <div className="flex items-center gap-3">
              <Avatar name={r.full_name} index={r.id + 3} muted={r.status !== 'active'} />
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-headline text-base font-bold group-hover:text-primary">
                  {r.full_name}{r.running_session && <StatusPill tone="running" className="!px-2 !py-0.5">{t('Sesi berjalan')}</StatusPill>}
                </p>
                <p className="mt-0.5 font-mono text-xs text-outline">{t('RM: {mrn}', { mrn: r.mrn })}</p>
              </div>
            </div>
          ) },
          { key: 'age', label: t('Umur'), className: 'w-28', render: (r) => <span className="font-mono">{t('{n} Thn', { n: r.age })}</span> },
          { key: 'sex', label: t('Jenis Kelamin'), className: 'w-40', render: (r) => <Sex sex={r.sex} /> },
          { key: 'phone', label: t('Kontak / WhatsApp'), className: 'w-48', render: (r) => <span className="font-mono text-on-surface-variant">{r.phone}</span> },
        ]}
      />
    </>
  );
}

// ─── Tambah / Edit Pasien ─────────────────────────────────────────────────────
const EMPTY = {
  full_name: '', nik: '', birth_date: '', sex: 'M', phone: '', emergency_contact_name: '', emergency_contact_relation: '',
  emergency_contact_phone: '', address: '', medical_history: '', status: 'active',
};

function PatientSessions({ mrn }) {
  const { data } = useApi(`/patients/${mrn}/sessions?limit=10`);
  if (!data) return null;
  return (
    <SectionCard icon={Activity} title={t('Riwayat Sesi Holter')} subtitle={t('Sesi pemeriksaan pasien ini')}>
      {data.data.length === 0 ? <p className="text-sm text-outline">{t('Belum ada sesi pemeriksaan.')}</p> : (
        <ul className="divide-y divide-outline-variant/20">
          {data.data.map((s) => (
            <li key={s.code}>
              <Link to={`/sesi/${s.code}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:text-primary">
                <span className="flex items-center gap-3">
                  <CodeTag>#{s.code}</CodeTag>
                  <span className="text-sm">{t('{date} • {n} Jam', { date: fmtDateTime(s.started_at), n: s.target_duration_hours })}</span>
                </span>
                <span className="flex items-center gap-3 text-sm text-on-surface-variant">
                  {s.doctor_name}
                  <StatusPill tone={s.archived_at ? 'archived' : s.status}>{s.archived_at ? t('Arsip') : s.status === 'running' ? t('Berjalan') : t('Selesai')}</StatusPill>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

export function PatientForm() {
  const { key } = useParams();
  const isNew = !key;
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const canEdit = can('patients.write');
  const canDelete = can('master.write');
  const patient = useApi(isNew ? null : `/patients/${key}`);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { if (patient.data) setForm(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, patient.data[k] ?? '']))); }, [patient.data]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e?.preventDefault();
    const errs = {};
    for (const k of ['full_name', 'nik', 'birth_date', 'sex', 'phone', 'emergency_contact_phone']) if (!String(form[k]).trim()) errs[k] = t('Wajib diisi');
    if (form.nik && !/^\d{16}$/.test(form.nik.replace(/\s/g, ''))) errs.nik = t('Harus 16 digit angka');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : v]));
      const saved = await api(isNew ? '/patients' : `/patients/${patient.data.id}`, { method: isNew ? 'POST' : 'PATCH', body });
      toast({ title: isNew ? t('Pasien terdaftar') : t('Perubahan disimpan'), text: t('{name} • RM {mrn}', { name: saved.full_name, mrn: saved.mrn }) });
      if (isNew) navigate(`/master/pasien/${saved.mrn}`, { replace: true }); else patient.setData(saved);
    } catch (err) { setErrors(fieldErrors(err)); toast({ tone: 'error', title: t('Gagal menyimpan'), text: err.message }); } finally { setSaving(false); }
  }

  async function remove() {
    setDeleting(true);
    try {
      await api(`/patients/${patient.data.id}`, { method: 'DELETE' });
      toast({ title: t('Pasien dihapus'), text: patient.data.full_name });
      navigate('/master/pasien', { replace: true });
    } catch (err) {
      toast({ tone: 'error', title: t('Tidak dapat dihapus'), text: err.status === 409 ? t('Pasien ini memiliki sesi pemeriksaan. Ubah statusnya menjadi Nonaktif.') : err.message });
      setConfirm(false);
    } finally { setDeleting(false); }
  }

  if (!isNew && patient.loading && !patient.data) return <LoadingBlock />;
  if (!isNew && patient.error) return <ErrorBlock error={patient.error} onRetry={() => patient.reload()} />;

  return (
    <form onSubmit={save} noValidate>
      <PageHeader
        back={{ to: '/master/pasien', label: t('Kembali ke Daftar Pasien') }}
        code={<CodeTag icon={IdCard}>{isNew ? t('#PASIEN-BARU') : `#RM-${patient.data.mrn.replace(/^CC-/, '')}`}</CodeTag>}
        actions={(
          <>
            {!isNew && <Toggle checked={form.status === 'active'} onChange={(on) => setForm((f) => ({ ...f, status: on ? 'active' : 'inactive' }))} label={t(SIMPLE_STATUS[form.status])} disabled={!canEdit} />}
            {!isNew && canDelete && <Button variant="secondary" icon={Trash2} onClick={() => setConfirm(true)} className="!px-3" title={t('Hapus pasien')}><span className="sr-only">{t('Hapus')}</span></Button>}
            {canEdit && <Button type="submit" icon={Check} loading={saving}>{isNew ? t('Simpan Pasien') : t('Simpan Perubahan')}</Button>}
          </>
        )}
      />
      <div className="space-y-4">
        <SectionCard icon={UserRound} title={t('Informasi Pribadi')} subtitle={t('Identitas kependudukan dan demografi pasien')}>
          <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
            <Input label={t('Nama Lengkap')} required value={form.full_name} onChange={set('full_name')} error={errors.full_name} />
            <Input label={t('Nomor Induk Kependudukan (NIK)')} required value={form.nik} onChange={set('nik')} error={errors.nik} inputMode="numeric" maxLength={16} mono />
            <Input label={t('Tanggal Lahir')} required type="date" value={form.birth_date} onChange={set('birth_date')} error={errors.birth_date} max={new Date().toISOString().slice(0, 10)} icon={Calendar} />
            <Select label={t('Jenis Kelamin')} required value={form.sex} onChange={set('sex')} error={errors.sex} options={[{ value: 'M', label: t('Laki-laki') }, { value: 'F', label: t('Perempuan') }]} />
          </fieldset>
        </SectionCard>
        <SectionCard icon={Contact} title={t('Kontak & Alamat')} subtitle={t('Kanal komunikasi dan data tempat tinggal aktif')}>
          <fieldset disabled={!canEdit} className="grid gap-5 sm:grid-cols-2">
            <Input label={t('Nomor WhatsApp / Telepon')} required type="tel" value={form.phone} onChange={set('phone')} error={errors.phone} icon={Phone} mono placeholder="+62 812-xxxx-xxxx" />
            <Input label={t('Kontak Darurat (Keluarga)')} required type="tel" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')} error={errors.emergency_contact_phone} icon={Contact} mono placeholder="+62 811-xxxx-xxxx" />
            <Input label={t('Nama Kontak Darurat')} value={form.emergency_contact_name} onChange={set('emergency_contact_name')} placeholder={t('Contoh: Ny. Ratna')} />
            <Input label={t('Hubungan')} value={form.emergency_contact_relation} onChange={set('emergency_contact_relation')} placeholder={t('Contoh: Istri')} />
            <Textarea label={t('Alamat Domisili Lengkap')} value={form.address} onChange={set('address')} className="sm:col-span-2" />
          </fieldset>
        </SectionCard>
        <SectionCard icon={HeartPulse} title={t('Catatan Medis Kardiovaskular')} subtitle={t('Riwayat klinis dan penanggung jawab medis')}>
          <fieldset disabled={!canEdit}>
            <Textarea label={t('Riwayat Penyakit Penyerta & Alergi')} value={form.medical_history} onChange={set('medical_history')} placeholder={t('Contoh: Hipertensi derajat 1, alergi perekat elektrode')} />
          </fieldset>
        </SectionCard>
        {!isNew && patient.data && <PasswordCard path="patients" id={patient.data.id} />}
        {!isNew && <PatientSessions mrn={patient.data.mrn} />}
        {!isNew && patient.data.running_session && (
          <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
            <p className="text-sm">{t('Pasien sedang menjalani sesi Holter')} <CodeTag>#{patient.data.running_session}</CodeTag></p>
            <ButtonLink to={`/sesi/${patient.data.running_session}`} variant="secondary">{t('Buka Sesi')}</ButtonLink>
          </Card>
        )}
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={remove} loading={deleting}
        title={t('Hapus pasien?')} text={t('{name} akan dihapus permanen dari master data.', { name: patient.data?.full_name || '' })} />
    </form>
  );
}
