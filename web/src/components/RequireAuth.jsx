import { Navigate, Outlet, useLocation } from 'react-router';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';

// Guards the pages behind the login. `roles` limits a page to some roles (e.g. ['admin']).
export default function RequireAuth({ roles }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-outline">
        <LoaderCircle className="size-6 animate-spin" aria-label="Memuat" />
      </div>
    );
  }
  if (status !== 'signed-in') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
