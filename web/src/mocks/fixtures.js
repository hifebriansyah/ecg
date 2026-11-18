// Sample records for Storybook, taken from the screens in ecg/design. Shaped like the API responses.
const H = 3600000;
const now = Date.now();

export const USERS = {
  admin: { id: 1, name: 'Inara', email: 'inara@detakita.med.id', role: 'admin', role_label: 'Admin', language: 'id', doctor_id: null, nurse_id: null },
  doctor: { id: 2, name: 'Andi Pratama', email: 'dokter@detakita.med.id', role: 'doctor', role_label: 'Dokter', language: 'id', doctor_id: 1, nurse_id: null },
  nurse: { id: 3, name: 'Siti Rahmawati', email: 'perawat@detakita.med.id', role: 'nurse', role_label: 'Perawat', language: 'id', doctor_id: null, nurse_id: 1 },
};

export const LOOKUPS = {
  subspecialties: [
    { code: 'aritmia', name: 'Aritmia & Elektrofisiologi Klinis (PERKI)', short_name: 'Aritmia' },
    { code: 'intervensi', name: 'Kardiologi Intervensi & Kateterisasi', short_name: 'Intervensi' },
    { code: 'ekokardiografi', name: 'Ekokardiografi & Pencitraan Kardiovaskular', short_name: 'Ekokardiografi' },
    { code: 'pediatrik', name: 'Kardiologi Pediatrik & Penyakit Jantung Bawaan', short_name: 'Pediatrik' },
    { code: 'rehabilitasi', name: 'Rehabilitasi & Prevensi Kardiovaskular', short_name: 'Rehabilitasi' },
  ],
  units: ['Poli Jantung & Rawat Inap', 'Stasiun Telemetri Sentral', 'Poli Diagnostik Non-Invasif', 'ICU Kardiovaskular', 'Poli Aritmia'].map((name, i) => ({ id: i + 1, name })),
  roles: [{ code: 'admin', label: 'Admin' }, { code: 'doctor', label: 'Dokter' }, { code: 'nurse', label: 'Perawat' }],
  target_durations: [24, 48, 72], sync_intervals: [5, 1],
};

const doc = (id, code, full_name, sub, specialty_label, active_patients, status = 'active') => ({
  id, code, full_name, nik: `31710419820500${String(id).padStart(2, '0')}`, str_number: `31.1.1.100.2.21.1458${90 + id}`, sip_number: `446/12${id}9/IDI/2024`,
  subspecialty_code: sub, specialty_label, email: `${code.toLowerCase()}@rs-jantung.co.id`, whatsapp: `+62 811-9824-77${10 + id}`,
  status, patient_quota: 10, active_patients, quota_state: active_patients >= 8 ? 'near_full' : 'available',
});
export const DOCTORS = [
  doc(1, 'DOC-042-ANDI', 'dr. Andi Pratama, Sp.JP (K)', 'aritmia', 'Spesialis Jantung & Pembuluh Darah • Aritmia', 8),
  doc(2, 'DOC-043-RINA', 'dr. Rina Kartika, Sp.JP, FIHA', 'intervensi', 'Kardiologi Intervensi & Telemetri', 5),
  doc(3, 'DOC-044-HENDRA', 'dr. Hendra Wijaya, Sp.JP (K)', 'pediatrik', 'Kardiologi Pediatrik & Kongenital', 3),
  doc(4, 'DOC-045-MAYA', 'dr. Maya Anggraini, Sp.PD-KKV', 'rehabilitasi', 'Penyakit Dalam - Kardiovaskular', 0, 'inactive'),
  doc(5, 'DOC-046-BAMBANG', 'dr. Bambang Sutrisno, Sp.JP (K)', 'aritmia', 'Aritmia & Pacing Kardio', 6),
];

const nurse = (id, code, full_name, position, unit_id, active_patients, status = 'active') => ({
  id, code, full_name, nik: `32730165089400${String(id).padStart(2, '0')}`, nira: `31740000${id}`, sipp_number: `446/208${id}/SIPP/2023`,
  str_number: `31.2.1.200.3.22.18940${id}`, position, unit_id, unit_name: LOOKUPS.units[unit_id - 1].name, shift: 'morning',
  email: `${code.toLowerCase()}@rs-jantung.co.id`, whatsapp: `+62 812-7744-90${20 + id}`, status, active_patients,
});
export const NURSES = [
  nurse(1, 'NRS-018-SITI', 'Ns. Siti Sarah, S.Kep', 'Koordinator Perawat Telemetri', 1, 6),
  nurse(2, 'NRS-019-RIZKY', 'Ns. Rizky Ananda, S.Kep', null, 2, 5),
  nurse(3, 'NRS-020-DEWI', 'Ns. Dewi Wulandari, A.Md.Kep', null, 3, 4),
  nurse(4, 'NRS-021-FAJAR', 'Ns. Fajar Pratama, S.Kep', null, 4, 0, 'inactive'),
  nurse(5, 'NRS-022-NURUL', 'Ns. Nurul Hidayah, S.Kep', null, 5, 3),
];

const patient = (id, mrn, full_name, age, sex, phone, running_session = null) => ({
  id, mrn, full_name, nik: `31710419086800${String(id).padStart(2, '0')}`, birth_date: `${new Date().getFullYear() - age}-08-19`, age, sex, phone,
  emergency_contact_name: 'Ny. Ratna', emergency_contact_relation: 'Istri', emergency_contact_phone: '+62 811-9876-5432',
  address: 'Jl. Margonda Raya No. 42, Pondok Cina, Beji, Kota Depok, Jawa Barat 16424',
  medical_history: 'Hipertensi Derajat 1, Tidak ada riwayat alergi perekat elektrode', status: 'active', running_session,
});
export const PATIENTS = [
  patient(1, 'CC-2026-0982', 'Budi Santoso', 58, 'M', '+62 812-3456-7890', 'a7f3b9c'),
  patient(2, 'CC-2026-1044', 'Siti Rahmawati', 62, 'F', '+62 811-9876-5432', 'c8b26e7'),
  patient(3, 'CC-2026-1089', 'Ahmad Dahlan', 45, 'M', '+62 813-2211-4455', '7834144'),
  patient(4, 'CC-2026-1102', 'Hendra Wijaya', 51, 'M', '+62 856-7788-9900', '1a7f421'),
  patient(5, 'CC-2026-1120', 'Nurul Aini', 67, 'F', '+62 818-4455-6677', 'e78e7ce'),
  patient(6, 'CC-2026-0814', 'Siti Aminah', 64, 'F', '+62 811-9876-5400'),
];

export const DEVICES = [1, 2, 3, 4, 5, 6].map((i) => ({ id: i, serial_number: `DK-K1-2026-04${i + 1}`, model: 'Telemetri DETAKITA K1', firmware: '1.4.2', status: i <= 5 ? 'in_use' : 'available' }));

const sess = (i, code, pid, doctor_id, hoursAgo, last_bpm, last_rhythm, status = 'running', extra = {}) => {
  const p = PATIENTS.find((x) => x.id === pid);
  const started_at = now - hoursAgo * H;
  return {
    id: i, code, status, archived_at: null, started_at, ended_at: status === 'running' ? null : started_at + 24 * H, target_duration_hours: 24,
    sync_interval_sec: 5, lead: 'II', lead_config: '3-lead Einthoven', sampling_hz: 250, filter_low_hz: 0.5, filter_high_hz: 40,
    last_bpm, last_rhythm, last_seen_at: status === 'running' ? now : started_at + 24 * H, clinical_indication: 'Evaluasi Sinkop Berulang & Palpitasi Paroksismal',
    notes: i === 1 ? 'Edukasi tombol oranye Holter saat berdebar. Pasien memiliki riwayat alergi perekat elektrode minimal.' : null,
    patient_id: pid, patient_name: p.full_name, patient_mrn: p.mrn.replace('CC-', 'RM-'), patient_sex: p.sex, patient_age: p.age,
    doctor_id, doctor_name: DOCTORS[doctor_id - 1].full_name, nurse_id: 1, nurse_name: NURSES[0].full_name, device_id: i <= 5 ? i : null,
    device_serial: i <= 5 ? DEVICES[i - 1].serial_number : null, ...extra,
  };
};
export const SESSIONS = [
  sess(1, 'a7f3b9c', 1, 1, 5.7, 76, 'Normal Sinus'),
  sess(2, 'c8b26e7', 2, 2, 5.0, 84, 'Stabil 250Hz'),
  sess(3, '7834144', 3, 1, 3.4, 54, 'Sinus Brady'),
  sess(4, '1a7f421', 4, 5, 2.6, 108, 'Elevated'),
  sess(5, 'e78e7ce', 5, 2, 1.2, 74, 'Normal Sinus', 'running', { has_signal: false, last_bpm: null, last_rhythm: null }),
  sess(6, '34aaa37', 6, 1, 30, 70, 'Normal Sinus', 'completed'),
  sess(7, 'c271062', 6, 2, 80, 72, 'Normal Sinus', 'completed', { archived_at: now - 20 * H }),
];

export const telemetryFor = (s) => (s.has_signal === false ? null : {
  recorded_at: now, bpm: s.last_bpm, rhythm: s.last_rhythm === 'Normal Sinus' ? 'Irama Sinus Normal' : s.last_rhythm, pr_ms: 162, qrs_ms: 88,
  battery_pct: 84, battery_hours_left: 52, signal_quality_pct: 99.8, rssi_dbm: -62, packet_loss_pct: 0, electrode_ok: 1,
});

export const NOTES = [
  { id: 3, author_role: 'patient', author_name: 'Budi Santoso', kind: 'symptom', bpm_at_event: null, occurred_at: now - 0.3 * H,
    body: 'Menekan tombol keluhan (Dada berdebar mendadak saat berjalan santai). AI mencatat takikardia transient 118 BPM.' },
  { id: 2, author_role: 'doctor', author_name: 'dr. Andi Pratama, Sp.JP (K)', kind: 'instruction', occurred_at: now - 4.4 * H,
    body: 'Pasien diinstruksikan menjaga elektrode tetap kering dan mencatat aktivitas harian di log book.' },
  { id: 1, author_role: 'nurse', author_name: 'Perawat Siti (Fast Intake)', kind: 'intake', occurred_at: now - 5.7 * H,
    body: 'Pemasangan elektrode 3-lead selesai, impedansi kulit terverifikasi 98% optimal. Sesi 24 jam dimulai.' },
];

export const ANALYSIS = {
  id: 1, model_version: 'v2.4', status: 'done', created_at: now - 0.2 * H, finished_at: now - 0.19 * H,
  summary: 'Irama sinus dominan. 1 episode takikardia supraventrikular singkat (18 detik) bersamaan dengan keluhan pasien.',
  findings: [{ type: 'SVT', bpm: 118, at: now - 0.3 * H }, { type: 'PVC', at: now - 2 * H }],
};
