import { HeartPulse, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';

// Placeholder landing page after login, until the dashboard and session screens are built.
export default function Home() {
  const { user, logout } = useAuth();
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <header className="flex items-center justify-between rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary-container text-on-primary"><HeartPulse className="size-6" /></div>
          <div>
            <p className="font-headline text-xl font-bold">Halo, {user.name}</p>
            <p className="font-mono text-xs text-outline">{user.email} • {user.role_label}</p>
          </div>
        </div>
        <button onClick={logout} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-error hover:bg-error-container">
          <LogOut className="size-4" /> Logout
        </button>
      </header>
      {user.profile && (
        <p className="mt-4 text-sm text-on-surface-variant">Profil: <span className="font-semibold text-on-surface">{user.profile.full_name}</span></p>
      )}
      <p className="mt-4 text-sm text-on-surface-variant">
        Akses {user.role_label}: {user.session_scope === 'own' ? 'hanya sesi pasien DPJP Anda.' : 'semua sesi.'}
      </p>
    </div>
  );
}
