import { useState } from 'react';
import { Check, KeyRound, Languages, UserRound } from 'lucide-react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Button, Input, PageHeader, SectionCard, Select, fieldErrors, useToast } from '../components/ui.jsx';

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
      toast({ title: 'Profil disimpan' });
    } catch (err) { toast({ tone: 'error', title: 'Gagal menyimpan', text: err.message }); } finally { setSaving(null); }
  }

  async function savePassword(e) {
    e.preventDefault();
    const errs = {};
    if (!pw.current_password) errs.current_password = 'Wajib diisi';
    if (pw.new_password.length < 10) errs.new_password = 'Minimal 10 karakter';
    if (pw.new_password !== pw.confirm) errs.confirm = 'Tidak sama dengan kata sandi baru';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving('password');
    try {
      await api('/me', { method: 'PATCH', body: { current_password: pw.current_password, new_password: pw.new_password } });
      setPw({ current_password: '', new_password: '', confirm: '' });
      toast({ title: 'Kata sandi diganti', text: 'Perangkat lain yang masuk dengan akun ini telah dikeluarkan.' });
    } catch (err) {
      setErrors(err.status === 403 ? { current_password: 'Kata sandi saat ini salah' } : fieldErrors(err));
      toast({ tone: 'error', title: 'Gagal mengganti kata sandi', text: err.status === 403 ? 'Kata sandi saat ini salah.' : err.message });
    } finally { setSaving(null); }
  }

  return (
    <>
      <PageHeader title="Setting" badge={user.role_label} />
      <div className="space-y-4">
        <form onSubmit={saveProfile} noValidate>
          <SectionCard icon={UserRound} title="Profil Akun" subtitle={user.email}>
            <div className="grid gap-5 sm:grid-cols-2">
              <Input label="Nama Tampilan" value={name} onChange={(e) => setName(e.target.value)} />
              <Select label="Bahasa" value={language} onChange={(e) => setLanguage(e.target.value)} options={[{ value: 'id', label: 'Bahasa Indonesia' }, { value: 'en', label: 'English' }]}
                hint={<span className="inline-flex items-center gap-1"><Languages className="size-3.5" />Tampilan saat ini tersedia dalam Bahasa Indonesia.</span>} />
              {user.profile && <Input label={user.role === 'doctor' ? 'Profil Dokter' : 'Profil Perawat'} value={`${user.profile.full_name} (${user.profile.code})`} disabled />}
            </div>
            <div className="mt-6 flex justify-end"><Button type="submit" icon={Check} loading={saving === 'profile'}>Simpan Profil</Button></div>
          </SectionCard>
        </form>
        <form onSubmit={savePassword} noValidate>
          <SectionCard icon={KeyRound} title="Ganti Kata Sandi" subtitle="Minimal 10 karakter">
            <div className="grid gap-5 sm:grid-cols-3">
              <Input label="Kata Sandi Saat Ini" type="password" autoComplete="current-password" value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} error={errors.current_password} />
              <Input label="Kata Sandi Baru" type="password" autoComplete="new-password" value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} error={errors.new_password} />
              <Input label="Ulangi Kata Sandi Baru" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={errors.confirm} />
            </div>
            <div className="mt-6 flex justify-end"><Button type="submit" icon={KeyRound} loading={saving === 'password'}>Ganti Kata Sandi</Button></div>
          </SectionCard>
        </form>
      </div>
    </>
  );
}
