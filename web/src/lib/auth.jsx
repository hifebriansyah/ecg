import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';

// Roles from the API, with the labels the UI shows.
export const ROLES = [
  { code: 'admin', label: 'Admin' },
  { code: 'doctor', label: 'Dokter' },
  { code: 'nurse', label: 'Perawat' },
];
export const roleLabel = (code) => ROLES.find((r) => r.code === code)?.label || code;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(getToken() ? 'loading' : 'guest'); // loading | guest | signed-in

  // On start: if a token is stored, check it is still valid.
  useEffect(() => {
    if (!getToken()) return;
    const ctrl = new AbortController();
    api('/me', { signal: ctrl.signal })
      .then((me) => { setUser(me); setStatus('signed-in'); })
      .catch((e) => { if (e.name === 'AbortError') return; setToken(null); setStatus('guest'); });
    return () => ctrl.abort();
  }, []);

  // `role` is what the user picked on the login screen; the account must have that role.
  const login = useCallback(async ({ email, password, role, remember }) => {
    const res = await api('/auth/login', { method: 'POST', body: { email, password }, token: null });
    if (role && res.user.role !== role) {
      await api('/auth/logout', { method: 'POST', token: res.token }).catch(() => {});
      const err = new Error(`Akun ini terdaftar sebagai ${roleLabel(res.user.role)}, bukan ${roleLabel(role)}.`);
      err.code = 'wrong_role';
      throw err;
    }
    setToken(res.token, remember);
    setUser(res.user);
    setStatus('signed-in');
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    setUser(null);
    setStatus('guest');
  }, []);

  const value = useMemo(() => ({
    user, status, login, logout,
    can: (perm) => !!user?.permissions?.includes(perm),
  }), [user, status, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
