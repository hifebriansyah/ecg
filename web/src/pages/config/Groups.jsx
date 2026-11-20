import { useState } from 'react';
import { Check, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { t } from '../../lib/i18n.jsx';
import {
  Button, Card, ConfirmDialog, ErrorBlock, Input, LoadingBlock, Modal, PageHeader, SectionCard, Select, StatusPill, Textarea, fieldErrors, useToast,
} from '../../components/ui.jsx';

// Konfigurasi > Grup: create / rename / delete groups and move users between them.
export default function Groups() {
  const toast = useToast();
  const groups = useApi('/groups');
  const users = useApi('/users?limit=100');
  const [edit, setEdit] = useState(null); // null | {} (new) | group
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api(`/groups/${del.id}`, { method: 'DELETE' });
      toast({ title: t('Grup dihapus'), text: t(del.name) });
      setDel(null); groups.reload(true);
    } catch (err) { toast({ tone: 'error', title: t('Tidak dapat dihapus'), text: err.message }); setDel(null); } finally { setBusy(false); }
  }

  async function move(u, groupId) {
    try {
      await api(`/users/${u.id}`, { method: 'PATCH', body: { group_id: Number(groupId) } });
      toast({ title: t('Grup pengguna diubah'), text: u.name });
      users.reload(true); groups.reload(true);
    } catch (err) { toast({ tone: 'error', title: t('Gagal memindahkan'), text: err.message }); }
  }

  if ((groups.loading && !groups.data) || (users.loading && !users.data)) return <LoadingBlock />;
  if (groups.error || users.error) return <ErrorBlock error={groups.error || users.error} onRetry={() => { groups.reload(); users.reload(); }} />;
  const gs = groups.data.data;
  const groupOptions = gs.map((g) => ({ value: String(g.id), label: t(g.name) }));

  return (
    <>
      <PageHeader title={t('Grup')} badge={t('Konfigurasi')} actions={<Button icon={Plus} onClick={() => setEdit({})}>{t('Tambah Grup')}</Button>} />
      <div className="space-y-4">
        <SectionCard icon={Users} title={t('Daftar Grup')} subtitle={t('Setiap pengguna berada di satu grup; izin grup diatur di menu Izin')}>
          <ul className="divide-y divide-outline-variant/20">
            {gs.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-headline font-semibold">{t(g.name)}{g.is_system && <StatusPill tone="neutral">{t('Bawaan')}</StatusPill>}</p>
                  <p className="text-sm text-on-surface-variant">{g.description ? t(g.description) : '—'}</p>
                  <p className="mt-1 font-mono text-xs text-outline">{t('{members} anggota • {perms} izin', { members: g.members, perms: g.permissions.length })}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" icon={Pencil} onClick={() => setEdit(g)}>{t('Ubah')}</Button>
                  {!g.is_system && <Button variant="secondary" icon={Trash2} onClick={() => setDel(g)} className="!px-3" title={t('Hapus grup')}><span className="sr-only">{t('Hapus')}</span></Button>}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard icon={Users} title={t('Anggota')} subtitle={t('Pindahkan pengguna ke grup lain')}>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead><tr className="border-b border-outline-variant/30 text-left"><th className="px-4 py-3 font-headline font-semibold">{t('Pengguna')}</th><th className="px-4 py-3 font-headline font-semibold">{t('Peran')}</th><th className="px-4 py-3 font-headline font-semibold">{t('Grup')}</th></tr></thead>
              <tbody>
                {users.data.data.map((u) => (
                  <tr key={u.id} className="border-b border-outline-variant/20 last:border-0">
                    <td className="px-4 py-2.5"><span className="block font-medium">{u.name}</span><span className="font-mono text-xs text-outline">{u.email}</span></td>
                    <td className="px-4 py-2.5 text-on-surface-variant">{u.role_label}</td>
                    <td className="px-4 py-2.5">
                      <Select aria-label={t('Grup {name}', { name: u.name })} value={String(u.group_id || gs.find((g) => g.code === u.role)?.id || '')} onChange={(e) => move(u, e.target.value)} options={groupOptions} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </SectionCard>
      </div>

      <GroupDialog group={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); groups.reload(true); }} />
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} title={t('Hapus grup?')} text={del ? t('Grup "{name}" akan dihapus. Grup yang masih punya anggota tidak dapat dihapus.', { name: t(del.name) }) : ''} />
    </>
  );
}

function GroupDialog({ group, onClose, onSaved }) {
  const toast = useToast();
  const isNew = group && !group.id;
  const [form, setForm] = useState({ name: '', description: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [key, setKey] = useState(null);
  if (group && key !== (group.id || 'new')) { setKey(group.id || 'new'); setForm({ name: group.name || '', description: group.description || '' }); setErrors({}); }
  if (!group && key !== null) setKey(null);

  async function save() {
    if (!form.name.trim()) { setErrors({ name: t('Wajib diisi') }); return; }
    setSaving(true);
    try {
      const body = { name: form.name.trim(), description: form.description.trim() || null };
      await api(isNew ? '/groups' : `/groups/${group.id}`, { method: isNew ? 'POST' : 'PATCH', body });
      toast({ title: isNew ? t('Grup dibuat') : t('Grup disimpan'), text: body.name });
      onSaved();
    } catch (err) { setErrors(fieldErrors(err)); toast({ tone: 'error', title: t('Gagal menyimpan'), text: err.message }); } finally { setSaving(false); }
  }

  return (
    <Modal open={!!group} onClose={onClose} title={isNew ? t('Tambah Grup') : t('Ubah Grup')} icon={Users}
      footer={<><Button variant="secondary" onClick={onClose}>{t('Batal')}</Button><Button icon={Check} onClick={save} loading={saving}>{t('Simpan')}</Button></>}>
      <div className="space-y-4">
        <Input label={t('Nama Grup')} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} placeholder={t('Contoh: Koordinator Telemetri')} />
        <Textarea label={t('Deskripsi')} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        {isNew && <p className="text-xs text-outline">{t('Grup baru dimulai tanpa izin. Atur izinnya di menu Izin.')}</p>}
      </div>
    </Modal>
  );
}
