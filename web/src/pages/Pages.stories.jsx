// Every screen from ecg/design, rendered against the mock API. Switch the role (Admin / Dokter / Perawat) in the toolbar.
import { PageStory } from '../mocks/PageStory.jsx';
import Login from './Login.jsx';
import Dashboard from './Dashboard.jsx';
import Settings from './Settings.jsx';
import SessionList from './sessions/SessionList.jsx';
import NewSession from './sessions/NewSession.jsx';
import SessionDetail from './sessions/SessionDetail.jsx';
import { DoctorForm, DoctorList } from './master/Doctors.jsx';
import { NurseForm, NurseList } from './master/Nurses.jsx';
import { PatientForm, PatientList } from './master/Patients.jsx';

export default { title: 'Halaman', parameters: { page: true, layout: 'fullscreen' } };

export const Masuk = { render: () => <PageStory guest shell={false} url="/login" element={<Login />} /> };
export const Dashboard_ = { name: 'Dashboard', render: () => <PageStory url="/" element={<Dashboard />} /> };
export const SesiBerjalan = { name: 'Sesi Pemeriksaan / Berjalan', render: () => <PageStory url="/sesi/berjalan" element={<SessionList view="berjalan" />} /> };
export const SesiSelesai = { name: 'Sesi Pemeriksaan / Selesai', render: () => <PageStory url="/sesi/selesai" element={<SessionList view="selesai" />} /> };
export const SesiArsip = { name: 'Sesi Pemeriksaan / Arsip', render: () => <PageStory url="/sesi/arsip" element={<SessionList view="arsip" />} /> };
export const DetailSesi = { name: 'Sesi Pemeriksaan / Detail Sesi', render: () => <PageStory url="/sesi/a7f3b9c" path="/sesi/:code" element={<SessionDetail />} /> };
export const DetailSesiTanpaSinyal = { name: 'Sesi Pemeriksaan / Detail Sesi (belum ada sinyal)', render: () => <PageStory url="/sesi/e78e7ce" path="/sesi/:code" element={<SessionDetail />} /> };
export const TambahSesi = { name: 'Tambah Sesi', render: () => <PageStory url="/sesi/baru" element={<NewSession />} /> };
export const DaftarDokter = { name: 'Master Data / Daftar Dokter', render: () => <PageStory url="/master/dokter" element={<DoctorList />} /> };
export const EditDokter = { name: 'Master Data / Edit Dokter', render: () => <PageStory url="/master/dokter/DOC-042-ANDI" path="/master/dokter/:key" element={<DoctorForm />} /> };
export const TambahDokter = { name: 'Master Data / Tambah Dokter', render: () => <PageStory url="/master/dokter/baru" element={<DoctorForm />} /> };
export const DaftarPerawat = { name: 'Master Data / Daftar Perawat', render: () => <PageStory url="/master/perawat" element={<NurseList />} /> };
export const EditPerawat = { name: 'Master Data / Edit Perawat', render: () => <PageStory url="/master/perawat/NRS-018-SITI" path="/master/perawat/:key" element={<NurseForm />} /> };
export const DaftarPasien = { name: 'Master Data / Daftar Pasien', render: () => <PageStory url="/master/pasien" element={<PatientList />} /> };
export const EditPasien = { name: 'Master Data / Edit Pasien', render: () => <PageStory url="/master/pasien/CC-2026-0982" path="/master/pasien/:key" element={<PatientForm />} /> };
export const TambahPasien = { name: 'Master Data / Tambah Pasien', render: () => <PageStory url="/master/pasien/baru" element={<PatientForm />} /> };
export const Setting = { render: () => <PageStory url="/pengaturan" element={<Settings />} /> };
