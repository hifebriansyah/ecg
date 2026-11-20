import { useState } from 'react';
import { Check, KeyRound, UserRound } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { t } from '../lib/i18n.jsx';
import { Button, Input, PageHeader, SectionCard, Select, fieldErrors, useToast } from '../components/ui.jsx';
import DEMO_LOGINS from '../demo-logins.json';

const DEMO_EMAILS = Object.values(DEMO_LOGINS).map((l) => l.email);

// "Setting" from the user menu: own name, language, password.
export default function Settings() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(user.name);
  const [language, setLanguage] = useState(user.language);
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(null);

  async function saveProfile(e) {
    e.preventDefault();
    setSaving('profile');
    try {
      await api('/me', { method: 'PATCH', body: { name, language } });
      await refreshUser();
      toast({ title: t('Profil disimpan') });
    } catch (err) { toast({ tone: 'error', title: t('Gagal menyimpan'), text: err.message }); } finally { setSaving(null); }
  }

  async function savePassword(e) {
    e.preventDefault();
    const errs = {};
    if (!pw.current_password) errs.current_password = t('Wajib diisi');
    if (pw.new_password.length < 10) errs.new_password = t('Minimal 10 karakter');
    if (pw.new_password !== pw.confirm) errs.confirm = t('Tidak sama dengan kata sandi baru');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving('password');
    try {
      await api('/me', { method: 'PATCH', body: { current_password: pw.current_password, new_password: pw.new_password } });
      setPw({ current_password: '', new_password: '', confirm: '' });
      toast({ title: t('Kata sandi diganti'), text: t('Perangkat lain yang masuk dengan akun ini telah dikeluarkan.') });
    } catch (err) {
      setErrors(err.status === 403 ? { current_password: t('Kata sandi saat ini salah') } : fieldErrors(err));
      toast({ tone: 'error', title: t('Gagal mengganti kata sandi'), text: err.status === 403 ? t('Kata sandi saat ini salah.') : err.message });
    } finally { setSaving(null); }
  }

  return (
    <>
      <PageHeader title={t('Setting')} badge={t(user.role_label)} />
      <div className="space-y-4">
        <form onSubmit={saveProfile} noValidate>
          <SectionCard icon={UserRound} title={t('Profil Akun')} subtitle={user.email}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input label={t('Nama Tampilan')} value={name} onChange={(e) => setName(e.target.value)} />
              <Select label={t('Bahasa')} value={language} onChange={(e) => setLanguage(e.target.value)} options={[{ value: 'id', label: 'Bahasa Indonesia' }, { value: 'en', label: 'English' }]} />
              {user.profile && <Input label={user.role === 'doctor' ? t('Profil Dokter') : t('Profil Perawat')} value={`${user.profile.full_name} (${user.profile.code})`} disabled />}
            </div>
            <div className="mt-6 flex justify-end"><Button type="submit" icon={Check} loading={saving === 'profile'}>{t('Simpan Profil')}</Button></div>
          </SectionCard>
        </form>
        {DEMO_EMAILS.includes(user.email) ? (
          <SectionCard icon={KeyRound} title={t('Ganti Kata Sandi')} subtitle={t('Akun demo')}>
            <p className="text-sm text-on-surface-variant">{t('Ini akun demo dengan kata sandi publik, jadi kata sandinya tidak dapat diganti.')}</p>
          </SectionCard>
        ) : (
        <form onSubmit={savePassword} noValidate>
          <SectionCard icon={KeyRound} title={t('Ganti Kata Sandi')} subtitle={t('Minimal 10 karakter')}>
            <div className="grid gap-5 sm:grid-cols-3">
              <Input label={t('Kata Sandi Saat Ini')} type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} error={errors.current_password} />
              <Input label={t('Kata Sandi Baru')} type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} error={errors.new_password} />
              <Input label={t('Ulangi Kata Sandi Baru')} type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={errors.confirm} />
            </div>
            <div className="mt-6 flex justify-end"><Button type="submit" icon={KeyRound} loading={saving === 'password'}>{t('Ganti Kata Sandi')}</Button></div>
          </SectionCard>
        </form>
        )}
      </div>
    </>
  );
}
