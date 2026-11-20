import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { AlertCircle, Eye, EyeOff, HeartPulse, KeyRound, LoaderCircle, Lock, Mail, ShieldCheck, Stethoscope, UserCog } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { getLang, setLang, t } from '../lib/i18n.jsx';
import DEMO_LOGINS from '../demo-logins.json';

const ROLE_OPTIONS = [
  { code: 'admin', label: 'Admin', icon: UserCog, hint: 'Kelola master data & akun' },
  { code: 'doctor', label: 'Dokter', icon: Stethoscope, hint: 'Pantau pasien DPJP Anda' },
  { code: 'nurse', label: 'Perawat', icon: HeartPulse, hint: 'Intake & pemantauan sesi' },
];

// Public demo logins, one per role (src/demo-logins.json, created by tools/create_demo_logins.py).
// Clicking a role fills in its email and password. This is a demo site: these passwords are meant to be public,
// and the API stops demo accounts from changing passwords or other logins.


// Decorative Lead II strip for the brand panel.
function EcgLine() {
  return (
    <svg viewBox="0 0 600 120" className="w-full" fill="none" aria-hidden="true">
      <path
        d="M0 70 H90 l10 -8 l10 8 H140 l6 10 l12 -70 l12 85 l8 -25 H230 l14 -12 l14 12 H330 l6 10 l12 -70 l12 85 l8 -25 H420 l14 -12 l14 12 H520 l6 10 l12 -70 l12 85 l8 -25 H600"
        stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
      />
    </svg>
  );
}

export default function Login() {
  const { status, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [, bump] = useState(0);
  const [role, setRole] = useState('admin');
  const [email, setEmail] = useState(DEMO_LOGINS.admin?.email || '');
  const [password, setPassword] = useState(DEMO_LOGINS.admin?.password || '');
  const demo = DEMO_LOGINS[role];
  const autofilled = !!demo && email === demo.email && password === demo.password;

  function pickRole(code) {
    setRole(code);
    setFormError('');
    const login = DEMO_LOGINS[code];
    if (login) { setEmail(login.email); setPassword(login.password); setErrors({}); }
  }
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (status === 'signed-in') return <Navigate to={location.state?.from || '/'} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    const next = {};
    if (!email.trim()) next.email = t('Email wajib diisi');
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = t('Format email tidak valid');
    if (!password) next.password = t('Kata sandi wajib diisi');
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await login({ email: email.trim(), password, role, remember });
      navigate(location.state?.from || '/', { replace: true });
    } catch (err) {
      if (err.code === 'wrong_role') setFormError(err.message);
      else if (err.status === 401) setFormError(t('Email atau kata sandi salah, atau akun tidak aktif.'));
      else setFormError(err.message || t('Terjadi kesalahan. Coba lagi.'));
    } finally {
      setBusy(false);
    }
  }

  const inputBase = 'w-full rounded-lg border bg-surface-container-lowest py-2.5 pl-10 pr-3 text-sm text-on-surface placeholder:text-outline transition-colors focus:outline-none focus:ring-2 focus:ring-primary-container/20';

  function switchLang(l) { setLang(l); bump((n) => n + 1); }

  return (
    <div key={getLang()} className="contents">
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-primary text-on-primary lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="relative flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary-container">
            <HeartPulse className="size-6" />
          </div>
          <div>
            <p className="font-headline text-lg font-bold tracking-tight">DETAKITA</p>
            <p className="font-mono text-xs text-primary-fixed-dim">Telecardiology OS</p>
          </div>
        </div>

        <div className="relative space-y-6">
          <div className="text-tertiary-fixed-dim"><EcgLine /></div>
          <h1 className="font-headline text-4xl font-bold leading-tight tracking-tight">
            {t('Pemantauan Holter EKG')}<br />{t('dari mana saja.')}
          </h1>
          <p className="max-w-md text-primary-fixed-dim">
            {t('Satu ruang kerja untuk perawat, dokter DPJP, dan admin: mulai sesi, pantau irama jantung secara langsung, dan tinjau analisis aritmia AI.')}
          </p>
        </div>

        <div className="relative flex items-center gap-2 font-mono text-xs text-primary-fixed-dim">
          <ShieldCheck className="size-4" /> {t('Akses terenkripsi • Data pasien dilindungi')}
        </div>
      </aside>

      {/* Form */}
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="relative w-full max-w-md">
          <div className="absolute -top-2 right-0 flex items-center gap-0.5 rounded-lg border border-outline-variant/50 p-0.5 font-mono text-xs font-semibold lg:-top-6" role="group" aria-label={t('Bahasa')}>
            {[['id', 'ID'], ['en', 'EN']].map(([code, label]) => (
              <button key={code} type="button" onClick={() => switchLang(code)} aria-pressed={getLang() === code}
                className={`rounded-md px-2 py-1 transition-colors ${getLang() === code ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'}`}>{label}</button>
            ))}
          </div>
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary-container text-on-primary">
              <HeartPulse className="size-5" />
            </div>
            <span className="font-headline text-lg font-bold tracking-tight">DETAKITA</span>
          </div>

          <h2 className="font-headline text-2xl font-bold tracking-tight sm:text-3xl">{t('Masuk ke akun Anda')}</h2>
          <p className="mt-1.5 text-sm text-on-surface-variant">{t('Pilih peran Anda, lalu masukkan email dan kata sandi.')}</p>

          <form className="mt-8 space-y-5" onSubmit={onSubmit} noValidate>
            <fieldset>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-outline">{t('Masuk sebagai')}</legend>
              <div className="grid grid-cols-3 gap-2" role="radiogroup">
                {ROLE_OPTIONS.map(({ code, label, icon: Icon, hint }) => {
                  const active = role === code;
                  return (
                    <button
                      key={code} type="button" role="radio" aria-checked={active} title={t(hint)}
                      onClick={() => pickRole(code)}
                      className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-semibold transition-colors ${
                        active
                          ? 'border-primary-container bg-primary-container text-on-primary'
                          : 'border-outline-variant/50 bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low'
                      }`}
                    >
                      <Icon className="size-5" />
                      {t(label)}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-outline">
                {t(ROLE_OPTIONS.find((r) => r.code === role).hint)}
                {autofilled && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-surface-container px-2 py-0.5 font-mono text-[11px] font-medium text-tertiary">
                    <KeyRound className="size-3" /> {t('Akun demo terisi otomatis')}
                  </span>
                )}
              </p>
            </fieldset>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4.5 -translate-y-1/2 text-outline" />
                <input
                  id="email" type="email" autoComplete="username" placeholder="nama@rs-jantung.co.id"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={!!errors.email} aria-describedby={errors.email ? 'email-error' : undefined}
                  className={`${inputBase} ${errors.email ? 'border-error' : 'border-outline-variant/60 focus:border-primary-container'}`}
                />
              </div>
              {errors.email && <p id="email-error" className="mt-1.5 text-xs text-error">{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">{t('Kata Sandi')}</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4.5 -translate-y-1/2 text-outline" />
                <input
                  id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!errors.password} aria-describedby={errors.password ? 'password-error' : undefined}
                  className={`${inputBase} pr-10 ${errors.password ? 'border-error' : 'border-outline-variant/60 focus:border-primary-container'}`}
                />
                <button
                  type="button" onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('Sembunyikan kata sandi') : t('Tampilkan kata sandi')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-outline hover:bg-surface-container-low hover:text-on-surface"
                >
                  {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
                </button>
              </div>
              {errors.password && <p id="password-error" className="mt-1.5 text-xs text-error">{errors.password}</p>}
            </div>

            <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-on-surface-variant">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 rounded accent-primary-container" />
              {t('Ingat saya selama 7 hari')}
            </label>

            {formError && (
              <div role="alert" className="flex items-start gap-2 rounded-lg bg-error-container px-3 py-2.5 text-sm text-on-error-container">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <button
              type="submit" disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-4 py-2.5 font-headline text-sm font-semibold text-on-primary transition-colors hover:bg-primary disabled:opacity-60"
            >
              {busy && <LoaderCircle className="size-4 animate-spin" />}
              {busy ? t('Memproses…') : t('Masuk')}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-outline">
            {t('Lupa kata sandi? Hubungi admin untuk mengatur ulang akun Anda.')}
          </p>
        </div>
      </main>
    </div>
    </div>
  );
}
