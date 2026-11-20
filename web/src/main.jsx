import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import './index.css';
import { AuthProvider } from './lib/auth.jsx';
import { LangGate } from './lib/i18n.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Layout from './components/Layout.jsx';
import { ToastProvider } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Home from './pages/Home.jsx';
import Permissions from './pages/config/Permissions.jsx';
import Groups from './pages/config/Groups.jsx';
import Simulator from './pages/config/Simulator.jsx';
import TestingGuide from './pages/docs/TestingGuide.jsx';
import RiskManagement from './pages/docs/RiskManagement.jsx';
import Settings from './pages/Settings.jsx';
import SessionList from './pages/sessions/SessionList.jsx';
import NewSession from './pages/sessions/NewSession.jsx';
import SessionDetail from './pages/sessions/SessionDetail.jsx';
import { DoctorForm, DoctorList } from './pages/master/Doctors.jsx';
import { NurseForm, NurseList } from './pages/master/Nurses.jsx';
import { PatientForm, PatientList } from './pages/master/Patients.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <LangGate>
      <ToastProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="pengaturan" element={<Settings />} />
                <Route path="sesi" element={<Navigate to="/sesi/berjalan" replace />} />
                <Route element={<RequireAuth perm="sessions.create" />}>
                  <Route path="sesi/baru" element={<NewSession />} />
                </Route>
                <Route element={<RequireAuth perm="patients.write" />}>
                  <Route path="master/pasien/baru" element={<PatientForm />} />
                </Route>
                <Route element={<RequireAuth perm={['sessions.read_own', 'sessions.read_all']} />}>
                  <Route path="sesi/berjalan" element={<SessionList key="berjalan" view="berjalan" />} />
                  <Route path="sesi/selesai" element={<SessionList key="selesai" view="selesai" />} />
                  <Route path="sesi/arsip" element={<SessionList key="arsip" view="arsip" />} />
                  <Route path="sesi/:code" element={<SessionDetail />} />
                </Route>
                <Route path="master" element={<Navigate to="/master/dokter" replace />} />
                <Route element={<RequireAuth perm="master.read" />}>
                  <Route path="master/dokter" element={<DoctorList />} />
                  <Route path="master/perawat" element={<NurseList />} />
                  <Route path="master/perawat/:key" element={<NurseForm />} />
                </Route>
                <Route element={<RequireAuth perm="master.write" />}>
                  <Route path="master/dokter/baru" element={<DoctorForm />} />
                </Route>
                <Route element={<RequireAuth perm="master.read" />}>
                  <Route path="master/dokter/:key" element={<DoctorForm />} />
                </Route>
                <Route element={<RequireAuth perm="patients.read" />}>
                  <Route path="master/pasien" element={<PatientList />} />
                  <Route path="master/pasien/:key" element={<PatientForm />} />
                </Route>
                <Route path="dokumen" element={<Navigate to="/dokumen/panduan-pengujian" replace />} />
                <Route path="dokumen/panduan-pengujian" element={<TestingGuide />} />
                <Route path="dokumen/manajemen-risiko" element={<RiskManagement />} />
                <Route path="konfigurasi" element={<Navigate to="/konfigurasi/izin" replace />} />
                <Route element={<RequireAuth perm="config.manage" />}>
                  <Route path="konfigurasi/izin" element={<Permissions />} />
                  <Route path="konfigurasi/grup" element={<Groups />} />
                  <Route path="konfigurasi/simulator" element={<Simulator />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
      </LangGate>
    </AuthProvider>
  </StrictMode>,
);
