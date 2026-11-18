import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import './index.css';
import { AuthProvider } from './lib/auth.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Layout from './components/Layout.jsx';
import { ToastProvider } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
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
      <ToastProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<RequireAuth />}>
              <Route element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="pengaturan" element={<Settings />} />
                <Route path="sesi" element={<Navigate to="/sesi/berjalan" replace />} />
                <Route element={<RequireAuth roles={['admin', 'nurse']} />}>
                  <Route path="sesi/baru" element={<NewSession />} />
                  <Route path="master/pasien/baru" element={<PatientForm />} />
                </Route>
                <Route path="sesi/berjalan" element={<SessionList key="berjalan" view="berjalan" />} />
                <Route path="sesi/selesai" element={<SessionList key="selesai" view="selesai" />} />
                <Route path="sesi/arsip" element={<SessionList key="arsip" view="arsip" />} />
                <Route path="sesi/:code" element={<SessionDetail />} />
                <Route path="master" element={<Navigate to="/master/dokter" replace />} />
                <Route path="master/dokter" element={<DoctorList />} />
                <Route element={<RequireAuth roles={['admin']} />}>
                  <Route path="master/dokter/baru" element={<DoctorForm />} />
                </Route>
                <Route path="master/dokter/:key" element={<DoctorForm />} />
                <Route path="master/perawat" element={<NurseList />} />
                <Route path="master/perawat/:key" element={<NurseForm />} />
                <Route path="master/pasien" element={<PatientList />} />
                <Route path="master/pasien/:key" element={<PatientForm />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  </StrictMode>,
);
