import { useState } from 'react';
import { Copy, KeyRound, Wand2 } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { locale, t } from '../lib/i18n.jsx';
import { useApi } from '../lib/useApi.js';
import { Button, Input, SectionCard, fieldErrors, useToast } from './ui.jsx';

const COPY = {
  doctors: { who: 'dokter', how: 'Dokter masuk ke web dengan email profil dan kata sandi ini.' },
  nurses: { who: 'perawat', how: 'Perawat masuk ke web dengan email profil dan kata sandi ini.' },
  patients: { who: 'pasien', how: 'Pasien tidak punya login web; kata sandi ini dipakai di aplikasi pasien (APK).' },
};
const fmt = (ms) => new Date(ms).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });
const randomPassword = () => Array.from(crypto.getRandomValues(new Uint8Array(14)), (b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');

// "Kata Sandi" card on the Edit Dokter / Perawat / Pasien pages. `path` is 'doctors' | 'nurses' | 'patients'.
// Shown only to users with the users.manage permission.
export default function PasswordCard({ path, id }) {
  const { can } = useAuth();
  const toast = useToast();
  const info = useApi(can('users.manage') ? `/${path}/${id}/login` : null);
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  if (!can('users.manage')) return null;
  const c = COPY[path];
  const d = info.data;

  async function save() {
    const errs = {};
    if (pw.password.length < 10) errs.password = t('Minimal 10 karakter');
    if (pw.password !== pw.confirm) errs.confirm = t('Tidak sama dengan kata sandi baru');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const res = await api(`/${path}/${id}/password`, { method: 'POST', body: { password: pw.password } });
      setPw({ password: '', confirm: '' }); setShow(false);
      info.reload(true);
      toast({ title: res.created ? t('Akun login dibuat') : t('Kata sandi diganti'), text: path === 'patients' ? t('Kata sandi aplikasi pasien diperbarui.') : t('Sesi login lama pengguna ini dikeluarkan.') });
    } catch (err) { setErrors(fieldErrors(err)); toast({ tone: 'error', title: t('Gagal mengganti kata sandi'), text: err.message }); } finally { setSaving(false); }
  }

  function generate() {
    const p = randomPassword();
    setPw({ password: p, confirm: p }); setShow(true); setErrors({});
  }

  return (
    // not a <form>: this card sits inside the Edit page's own form. Enter saves the password here, not the profile.
    <div onKeyDown={(e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); save(); } }}>
      <SectionCard icon={KeyRound} title={t('Kata Sandi')} subtitle={t(c.how)}>
        {d && (
          <p className="mb-5 text-sm text-on-surface-variant">
            {path === 'patients'
              ? (d.has_login ? t('Kata sandi aplikasi terakhir diganti {time}.', { time: fmt(d.password_updated_at) }) : t('Belum ada kata sandi aplikasi untuk pasien ini.'))
              : d.has_login
                ? <>{t('Akun login:')} <span className="font-mono text-on-surface">{d.email}</span>{d.last_login_at ? ` • ${t('terakhir masuk {time}', { time: fmt(d.last_login_at) })}` : ` • ${t('belum pernah masuk')}`}.</>
                : d.profile_email
                  ? <>{t('Belum ada akun login. Menyimpan kata sandi akan membuat akun dengan email')} <span className="font-mono text-on-surface">{d.profile_email}</span>.</>
                  : t('Belum ada akun login dan profil belum punya email. Isi email di atas dan simpan dulu.')}
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2">
          <Input label={t('Kata Sandi Baru')} type={show ? 'text' : 'password'} autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} error={errors.password} hint={t('Minimal 10 karakter')} />
          <Input label={t('Ulangi Kata Sandi Baru')} type={show ? 'text' : 'password'} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={errors.confirm} />
        </div>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" icon={Wand2} onClick={generate}>{t('Buat Otomatis')}</Button>
          {show && pw.password && <Button type="button" variant="secondary" icon={Copy} onClick={() => navigator.clipboard?.writeText(pw.password).then(() => toast({ title: t('Disalin'), text: t('Berikan kepada {who} yang bersangkutan.', { who: t(c.who) }) }))}>{t('Salin')}</Button>}
          <Button type="button" icon={KeyRound} onClick={save} loading={saving}>{d && !d.has_login && path !== 'patients' ? t('Buat Akun & Simpan') : t('Ganti Kata Sandi')}</Button>
        </div>
      </SectionCard>
    </div>
  );
}
