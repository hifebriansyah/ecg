import { Navigate, Outlet, useLocation } from 'react-router';
import { LoaderCircle } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { t } from '../lib/i18n.jsx';

// Guards the pages behind the login. `perm` limits a page to users who have a permission (a code, or a list where one is enough);
// `roles` limits it to some roles.
export default function RequireAuth({ roles, perm }) {
  const { status, user, can } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-outline">
        <LoaderCircle className="size-6 animate-spin" aria-label={t('Memuat')} />
      </div>
    );
  }
  if (status !== 'signed-in') return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  if (perm && ![].concat(perm).some(can)) return <Navigate to="/" replace />;
  return <Outlet />;
}
