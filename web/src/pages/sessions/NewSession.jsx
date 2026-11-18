import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { BriefcaseMedical, Check, Clock, CloudCog, Lock, MonitorCog, SquareUserRound } from 'lucide-react';
import { api } from '../../lib/api.js';
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
    if (!form.patient_id) errs.patient_id = 'Pilih pasien';
    if (!form.doctor_id) errs.doctor_id = 'Pilih dokter DPJP';
    if (!form.clinical_indication.trim()) errs.clinical_indication = 'Wajib diisi';
    if (!form.started_at) errs.started_at = 'Wajib diisi';
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
      toast({ title: 'Sesi dimulai', text: `${s.patient.full_name} • #${s.code}` });
      reloadStats();
      navigate(`/sesi/${s.code}`);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast({ tone: 'error', title: 'Sesi tidak dapat dimulai', text: err.message === 'Some fields are not valid' ? 'Periksa kembali isian yang ditandai.' : err.message });
    } finally { setSaving(false); }
  }

  const patientOptions = (patients.data?.data || []).map((p) => ({
    value: p.id, disabled: !!p.running_session,
    label: `${p.full_name} — RM: ${p.mrn} (${p.age} Thn)${p.running_session ? ' • sesi berjalan' : ''}`,
  }));
  const doctorOptions = (doctors.data?.data || []).map((d) => ({
    value: d.id, label: `${d.full_name}${d.specialty_label ? ` - ${d.specialty_label.split('•').pop().trim()}` : ''}${d.quota_state === 'near_full' ? ' (kuota hampir penuh)' : ''}`,
  }));

  return (
    <form onSubmit={start} noValidate>
      <PageHeader title="Tambah Sesi Pemeriksaan" code={<CodeTag>#SESI-BARU</CodeTag>}
        actions={<Button type="submit" variant="tertiary" icon={Check} loading={saving}>Mulai Sesi</Button>} />
      <div className="space-y-4">
        <SectionCard icon={SquareUserRound} title="Data Pasien & Tim Medis">
          <div className="grid gap-5 sm:grid-cols-2">
            <Select upper label="Pasien" required value={form.patient_id} onChange={set('patient_id')} error={errors.patient_id}
              placeholder={patients.loading ? 'Memuat pasien…' : 'Pilih Pasien Terdaftar...'} options={patientOptions}
              hint={<>Pasien belum terdaftar? <Link to="/master/pasien/baru" className="font-semibold text-primary hover:underline">Daftarkan pasien</Link></>} />
            <Select upper label="Dokter DPJP (Spesialis Jantung)" required value={form.doctor_id} onChange={set('doctor_id')} error={errors.doctor_id}
              placeholder={doctors.loading ? 'Memuat dokter…' : 'Pilih Dokter Penanggung Jawab...'} options={doctorOptions} />
            {user.role === 'admin' ? (
              <Select upper label="Perawat Pemasang" value={form.nurse_id} onChange={set('nurse_id')} error={errors.nurse_id}
                placeholder="Tanpa perawat" options={(nurses.data?.data || []).map((n) => ({ value: n.id, label: `${n.full_name}${n.unit_name ? ` — ${n.unit_name}` : ''}` }))} />
            ) : user.role === 'nurse' ? (
              <Input upper label="Perawat Pemasang" value={user.profile?.full_name || user.name} disabled icon={Lock} />
            ) : null}
          </div>
        </SectionCard>

        <SectionCard icon={MonitorCog} title="Konfigurasi Peranti & Protokol Holter">
          <div className="grid gap-5 sm:grid-cols-2">
            <Select upper label="Target Durasi Perekaman" required value={form.target_duration_hours} onChange={set('target_duration_hours')} options={DURATIONS} />
            <Input upper label="Tanggal & Waktu Mulai" required type="datetime-local" value={form.started_at} onChange={set('started_at')} error={errors.started_at} hint="Waktu WIB" />
            <Select upper label="Interval Sinkronisasi Cloud" required value={form.sync_interval_sec} onChange={set('sync_interval_sec')} options={INTERVALS} />
            <Input upper label="Frekuensi Sampling & Sadapan" value="Lead II (250 Hz - Standar AAMI/AHA)" disabled icon={Lock} mono />
            <Select upper label="Perangkat Holter" value={form.device_id} onChange={set('device_id')} error={errors.device_id}
              placeholder={devices.data?.data?.length === 0 ? 'Tidak ada perangkat tersedia' : 'Pilih perangkat (opsional)'}
              options={(devices.data?.data || []).map((d) => ({ value: d.id, label: `${d.serial_number} — ${d.model}` }))}
              hint="Perangkat yang dipilih akan ditandai sedang dipakai" />
            <div className="flex items-end gap-2 pb-6 text-xs text-outline sm:col-span-1">
              <CloudCog className="size-4" /> <Clock className="size-4" /> Data dikirim perangkat sesuai interval di atas.
            </div>
          </div>
        </SectionCard>

        <SectionCard icon={BriefcaseMedical} title="Indikasi Klinis & Catatan Pemeriksaan">
          <div className="grid gap-5">
            <Input upper label="Indikasi Klinis Pemeriksaan" required value={form.clinical_indication} onChange={set('clinical_indication')} error={errors.clinical_indication}
              placeholder="Contoh: Evaluasi Atrial Fibrilasi atau Sinkop" />
            <Textarea upper label="Catatan Khusus untuk Pasien / Perawat" rows={4} value={form.notes} onChange={set('notes')}
              placeholder="Tambahkan instruksi penanganan elektrode atau catatan alergi kontak..." />
          </div>
        </SectionCard>
      </div>
    </form>
  );
}
