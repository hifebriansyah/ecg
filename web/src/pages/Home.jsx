import { Navigate } from 'react-router';
import { useAuth } from '../lib/auth.jsx';
import Dashboard from './Dashboard.jsx';

// "/" shows the dashboard, or sends a user without the dashboard permission to the first page they may open.
export default function Home() {
  const { can } = useAuth();
  if (can('dashboard.view')) return <Dashboard />;
  if (can('sessions.read_all') || can('sessions.read_own')) return <Navigate to="/sesi/berjalan" replace />;
  if (can('patients.read')) return <Navigate to="/master/pasien" replace />;
  return <Navigate to="/pengaturan" replace />;
}
