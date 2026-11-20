import { useEffect, useMemo, useState } from 'react';
import { Check, Lock, ShieldCheck, UserCog } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { t } from '../../lib/i18n.jsx';
import { Button, Checkbox, ErrorBlock, LoadingBlock, PageHeader, SectionCard, Select, useToast, cx } from '../../components/ui.jsx';

// Konfigurasi > Izin: which group may do what, and per-user exceptions on top of the group.
export default function Permissions() {
  const toast = useToast();
  const catalog = useApi('/config/permissions');
  const groups = useApi('/groups');

  const sections = useMemo(() => {
    const map = new Map();
    for (const p of catalog.data?.data || []) map.set(p.group, [...(map.get(p.group) || []), p]);
    return [...map.entries()];
  }, [catalog.data]);

  async function toggle(g, code, on) {
    const next = on ? [...g.permissions, code] : g.permissions.filter((c) => c !== code);
    groups.setData((d) => ({ data: d.data.map((x) => (x.id === g.id ? { ...x, permissions: next } : x)) })); // optimistic
    try {
      await api(`/groups/${g.id}`, { method: 'PATCH', body: { permissions: next } });
    } catch (err) {
      groups.reload(true);
      toast({ tone: 'error', title: t('Gagal menyimpan izin'), text: err.message });
    }
  }

  if ((catalog.loading && !catalog.data) || (groups.loading && !groups.data)) return <LoadingBlock />;
  if (catalog.error || groups.error) return <ErrorBlock error={catalog.error || groups.error} onRetry={() => { catalog.reload(); groups.reload(); }} />;
  const gs = groups.data.data;

  return (
    <>
      <PageHeader title={t('Izin')} badge={t('Konfigurasi')} />
      <div className="space-y-4">
        <SectionCard icon={ShieldCheck} title={t('Izin per Grup')} subtitle={t('Centang untuk memberi izin. Perubahan tersimpan otomatis dan berlaku pada permintaan berikutnya.')}>
          <div className="-mx-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-outline-variant/30 text-left">
                  <th className="px-2 py-3 font-headline font-semibold">{t('Izin')}</th>
                  {gs.map((g) => (
                    <th key={g.id} className="px-3 py-3 text-center font-headline font-semibold">
                      <span className="inline-flex items-center gap-1">{t(g.name)}{g.locked && <Lock className="size-3.5 text-outline" aria-label={t('Terkunci')} />}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sections.map(([section, perms]) => (
                  <PermissionRows key={section} section={section} perms={perms} gs={gs} onToggle={toggle} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-outline">{t('Grup Admin selalu memiliki semua izin agar tidak ada yang terkunci dari sistem. Izin "sesi sendiri" membatasi pengguna pada sesi tempat dia menjadi DPJP.')}</p>
        </SectionCard>
        <UserOverrides catalog={sections} />
      </div>
    </>
  );
}

function PermissionRows({ section, perms, gs, onToggle }) {
  return (
    <>
      <tr><td colSpan={gs.length + 1} className="bg-surface-container-low px-2 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-outline">{t(section)}</td></tr>
      {perms.map((p) => (
        <tr key={p.code} className="border-b border-outline-variant/20 last:border-0">
          <td className="px-2 py-2.5"><span className="block">{t(p.label)}</span><span className="font-mono text-[11px] text-outline">{p.code}</span></td>
          {gs.map((g) => (
            <td key={g.id} className="px-3 py-2.5 text-center">
              {g.locked
                ? <Checkbox checked disabled label={`${t(p.label)} (${t(g.name)})`} onChange={() => {}} />
                : <Checkbox checked={g.permissions.includes(p.code)} onChange={(on) => onToggle(g, p.code, on)} label={`${t(p.label)} (${t(g.name)})`} />}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// Per-user exceptions: "follow the group", always allow, or always deny.
function UserOverrides({ catalog }) {
  const toast = useToast();
  const users = useApi('/users?limit=100');
  const [userId, setUserId] = useState('');
  const access = useApi(userId ? `/users/${userId}/access` : null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (access.data) setDraft(Object.fromEntries(access.data.overrides.map((o) => [o.permission, o.effect])));
  }, [access.data]);

  const inGroup = useMemo(() => {
    const g = (access.data && access.data.group) || null;
    return g ? g.id : null;
  }, [access.data]);
  const groups = useApi(inGroup ? '/groups' : null);
  const groupPerms = new Set(groups.data?.data.find((g) => g.id === inGroup)?.permissions || []);
  const locked = access.data?.group?.code === 'admin';

  async function save() {
    setSaving(true);
    try {
      const res = await api(`/users/${userId}/access`, { method: 'PUT', body: { overrides: draft } });
      access.setData(res);
      toast({ title: t('Pengecualian disimpan'), text: res.user.name });
    } catch (err) { toast({ tone: 'error', title: t('Gagal menyimpan'), text: err.message }); } finally { setSaving(false); }
  }

  const options = (users.data?.data || []).map((u) => ({ value: String(u.id), label: `${u.name} — ${u.group_name ? t(u.group_name) : u.role_label}` }));
  const effective = new Set(access.data?.permissions || []);

  return (
    <SectionCard icon={UserCog} title={t('Pengecualian per Pengguna')} subtitle={t('Tambah atau cabut izin untuk satu pengguna, di atas izin grupnya')}>
      <div className="max-w-md">
        <Select label={t('Pengguna')} value={userId} onChange={(e) => setUserId(e.target.value)} placeholder={t('Pilih pengguna…')} options={options} />
      </div>
      {userId && access.loading && !access.data && <LoadingBlock />}
      {userId && access.data && (
        <>
          {locked && <p className="mt-4 rounded-lg bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">{t('Pengguna di grup Admin selalu memiliki semua izin; pengecualian tidak berlaku.')}</p>}
          <div className="mt-5 space-y-5">
            {catalog.map(([section, perms]) => (
              <div key={section}>
                <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-outline">{t(section)}</p>
                <ul className="divide-y divide-outline-variant/20 rounded-lg border border-outline-variant/30">
                  {perms.map((p) => {
                    const ov = draft[p.code] || '';
                    const base = locked || groupPerms.has(p.code);
                    return (
                      <li key={p.code} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                        <span className="min-w-0 text-sm">
                          <span className={cx(ov === 'deny' && 'line-through opacity-60')}>{t(p.label)}</span>
                          <span className="ml-2 font-mono text-[11px] text-outline">{base ? t('grup: ya') : t('grup: tidak')}</span>
                        </span>
                        <select
                          disabled={locked} value={ov} aria-label={t(p.label)}
                          onChange={(e) => setDraft((d) => { const n = { ...d }; if (e.target.value) n[p.code] = e.target.value; else delete n[p.code]; return n; })}
                          className={cx('rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-2.5 py-1.5 text-sm', ov === 'allow' && 'border-tertiary text-tertiary', ov === 'deny' && 'border-error text-error')}
                        >
                          <option value="">{t('Ikuti grup')}</option>
                          <option value="allow">{t('Selalu izinkan')}</option>
                          <option value="deny">{t('Selalu tolak')}</option>
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-center justify-between gap-3">
            <p className="text-xs text-outline">{t('Izin berlaku sekarang: {n} dari {total}', { n: effective.size, total: catalog.reduce((n, [, p]) => n + p.length, 0) })}</p>
            {!locked && <Button icon={Check} onClick={save} loading={saving}>{t('Simpan Pengecualian')}</Button>}
          </div>
        </>
      )}
    </SectionCard>
  );
}
