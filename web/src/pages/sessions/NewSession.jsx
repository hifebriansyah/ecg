import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BriefcaseMedical, Check, Clock, CloudCog, Lock, MonitorCog, SquareUserRound } from 'lucide-react';
import { api } from '../../lib/api.js';
import { t } from '../../lib/i18n.jsx';
import { useAuth } from '../../lib/auth.jsx';
import { useApi } from '../../lib/useApi.js';
import { fromLocalInput, toLocalInput } from '../../lib/format.js';
import { useStats } from '../../components/Layout.jsx';
import { Button, CodeTag, Input, PageHeader, SectionCard, Select, Textarea, fieldErrors, useToast } from '../../components/ui.jsx';

const DURATIONS = [
  { value: 24, label: '24 Jam (Standar Diagnostik)' },
  { value: 48, label: '48 Jam (Evaluasi Ekstended)' },
  { value: 72, label: '72 Jam (Aritmia Kompleks)' },
];
const INTERVALS = [
  { value: 5, label: '5 Detik (Default Ambulatori)' },
  { value: 1, label: '1 Detik (High Surveillance)' },
];

export default function NewSession() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const { reloadStats } = useStats();
  const patients = useApi('/patients?status=active&limit=100');
  const doctors = useApi('/doctors?status=active&limit=100');
  const nurses = useApi(user.role === 'admin' ? '/nurses?status=active&limit=100' : null);
  const devices = useApi('/devices?status=available&limit=100');
  const [form, setForm] = useState({
    patient_id: '', doctor_id: '', nurse_id: '', device_id: '', target_duration_hours: 24, started_at: toLocalInput(Date.now()),
    sync_interval_sec: 5, clinical_indication: '', notes: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function start(e) {
    e?.preventDefault();
    const errs = {};
    if (!form.patient_id) errs.patient_id = t('Pilih pasien');
    if (!form.doctor_id) errs.doctor_id = t('Pilih dokter DPJP');
    if (!form.clinical_indication.trim()) errs.clinical_indication = t('Wajib diisi');
    if (!form.started_at) errs.started_at = t('Wajib diisi');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const num = (v) => (v === '' ? undefined : Number(v));
      const s = await api('/sessions', { method: 'POST', body: {
        patient_id: num(form.patient_id), doctor_id: num(form.doctor_id), nurse_id: num(form.nurse_id), device_id: num(form.device_id),
        target_duration_hours: Number(form.target_duration_hours), sync_interval_sec: Number(form.sync_interval_sec),
        started_at: fromLocalInput(form.started_at), clinical_indication: form.clinical_indication, notes: form.notes || undefined,
      } });
      toast({ title: t('Sesi dimulai'), text: `${s.patient.full_name} • #${s.code}` });
      reloadStats();
      navigate(`/sesi/${s.code}`);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: t('Sesi tidak dapat dimulai'), text: err.message === 'Some fields are not valid' ? t('Periksa kembali isian yang ditandai.') : err.message });
    } finally { setSaving(false); }
  }

  const patientOptions = (patients.data?.data || []).map((p) => ({
    value: p.id, disabled: !!p.running_session,
    label: `${t('{name} — RM: {mrn} ({age} Thn)', { name: p.full_name, mrn: p.mrn, age: p.age })}${p.running_session ? t(' • sesi berjalan') : ''}`,
  }));
  const doctorOptions = (doctors.data?.data || []).map((d) => ({
    value: d.id, label: `${d.full_name}${d.specialty_label ? ` - ${d.specialty_label.split('•').pop().trim()}` : ''}${d.quota_state === 'near_full' ? t(' (kuota hampir penuh)') : ''}`,
  }));

  return (
    <form onSubmit={start} noValidate>
      <PageHeader title={t('Tambah Sesi Pemeriksaan')} code={<CodeTag>{t('#SESI-BARU')}</CodeTag>}
        actions={<Button type="submit" variant="tertiary" icon={Check} loading={saving}>{t('Mulai Sesi')}</Button>} />
      <div className="space-y-4">
        <SectionCard icon={SquareUserRound} title={t('Data Pasien & Tim Medis')}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Select upper label={t('Pasien')} required value={form.patient_id} onChange={set('patient_id')} error={errors.patient_id}
              placeholder={patients.loading ? t('Memuat pasien…') : t('Pilih Pasien Terdaftar...')} options={patientOptions}
              hint={<>{t('Pasien belum terdaftar?')} <Link to="/master/pasien/baru" className="font-semibold text-primary hover:underline">{t('Daftarkan pasien')}</Link></>} />
            <Select upper label={t('Dokter DPJP (Spesialis Jantung)')} required value={form.doctor_id} onChange={set('doctor_id')} error={errors.doctor_id}
              placeholder={doctors.loading ? t('Memuat dokter…') : t('Pilih Dokter Penanggung Jawab...')} options={doctorOptions} />
            {user.role === 'admin' ? (
              <Select upper label={t('Perawat Pemasang')} value={form.nurse_id} onChange={set('nurse_id')} error={errors.nurse_id}
                placeholder={t('Tanpa perawat')} options={(nurses.data?.data || []).map((n) => ({ value: n.id, label: `${n.full_name}${n.unit_name ? ` — ${n.unit_name}` : ''}` }))} />
            ) : user.role === 'nurse' ? (
              <Input upper label={t('Perawat Pemasang')} value={user.profile?.full_name || user.name} disabled icon={Lock} />
            ) : null}
          </div>
        </SectionCard>

        <SectionCard icon={MonitorCog} title={t('Konfigurasi Peranti & Protokol Holter')}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Select upper label={t('Target Durasi Perekaman')} required value={form.target_duration_hours} onChange={set('target_duration_hours')} options={DURATIONS.map((o) => ({ ...o, label: t(o.label) }))} />
            <Input upper label={t('Tanggal & Waktu Mulai')} required type="datetime-local" value={form.started_at} onChange={set('started_at')} error={errors.started_at} hint={t('Waktu WIB')} />
            <Select upper label={t('Interval Sinkronisasi Cloud')} required value={form.sync_interval_sec} onChange={set('sync_interval_sec')} options={INTERVALS.map((o) => ({ ...o, label: t(o.label) }))} />
            <Input upper label={t('Frekuensi Sampling & Sadapan')} value={t('Lead II (250 Hz - Standar AAMI/AHA)')} disabled icon={Lock} mono />
            <Select upper label={t('Perangkat Holter')} value={form.device_id} onChange={set('device_id')} error={errors.device_id}
              placeholder={devices.data?.data?.length === 0 ? t('Tidak ada perangkat tersedia') : t('Pilih perangkat (opsional)')}
              options={(devices.data?.data || []).map((d) => ({ value: d.id, label: `${d.serial_number} — ${d.model}` }))}
              hint={t('Perangkat yang dipilih akan ditandai sedang dipakai')} />
            <div className="flex items-end gap-2 pb-6 text-xs text-outline sm:col-span-1">
              <CloudCog className="size-4" /> <Clock className="size-4" /> {t('Data dikirim perangkat sesuai interval di atas.')}
            </div>
          </div>
        </SectionCard>

        <SectionCard icon={BriefcaseMedical} title={t('Indikasi Klinis & Catatan Pemeriksaan')}>
          <div className="grid gap-5">
            <Input upper label={t('Indikasi Klinis Pemeriksaan')} required value={form.clinical_indication} onChange={set('clinical_indication')} error={errors.clinical_indication}
              placeholder={t('Contoh: Evaluasi Atrial Fibrilasi atau Sinkop')} />
            <Textarea upper label={t('Catatan Khusus untuk Pasien / Perawat')} rows={4} value={form.notes} onChange={set('notes')}
              placeholder={t('Tambahkan instruksi penanganan elektrode atau catatan alergi kontak...')} />
          </div>
        </SectionCard>
      </div>
    </form>
  );
}
