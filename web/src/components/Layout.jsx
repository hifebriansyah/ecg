import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import {
  ChevronDown, ChevronsUpDown, CirclePlus, Database, Languages, LayoutGrid, FileText, LogOut, Menu, Settings, Activity, X,
} from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { Logo, Modal, cx, useToast } from './ui.jsx';
import { initials } from '../lib/format.js';
import { t } from '../lib/i18n.jsx';

// Sidebar counts (Berjalan / Selesai), refreshed every 30 s and after actions that change them.
const StatsContext = createContext({ stats: null, reloadStats: () => {} });
export const useStats = () => useContext(StatsContext);

const linkCls = ({ isActive }) => cx(
  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
  isActive ? 'bg-primary-container font-semibold text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
);
const subLinkCls = ({ isActive }) => cx(
  'flex items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors',
  isActive ? 'bg-primary-container font-semibold text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
);

function Count({ n, strong }) {
  if (n == null) return null;
  return <span className={cx('rounded-full px-2 py-0.5 font-mono text-xs font-bold', strong ? 'bg-surface-container-high text-primary' : 'bg-surface-container-low text-secondary')}>{n}</span>;
}

function Group({ icon: Icon, label, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="pt-1">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-low">
        <span className="flex items-center gap-3"><Icon className="size-5" />{label}</span>
        <ChevronDown className={cx('size-4 text-outline transition-transform', !open && '-rotate-90')} />
      </button>
      {open && <div className="ml-5 mt-0.5 space-y-0.5 border-l border-outline-variant/40 pl-3">{children}</div>}
    </div>
  );
}

function LanguageDialog({ open, onClose }) {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function pick(language) {
    setBusy(true);
    try {
      await api('/me', { method: 'PATCH', body: { language } });
      await refreshUser();
      toast({ title: t('Bahasa disimpan'), text: language === 'en' ? t('English dipilih.') : t('Bahasa Indonesia dipilih.') });
      onClose();
    } catch (e) { toast({ tone: 'error', title: t('Gagal menyimpan'), text: e.message }); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} title={t('Bahasa')} icon={Languages} size="sm">
      <div className="grid gap-2">
        {[['id', 'Bahasa Indonesia'], ['en', 'English']].map(([code, label]) => (
          <button key={code} type="button" disabled={busy} onClick={() => pick(code)}
            className={cx('flex items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-medium',
              user?.language === code ? 'border-primary-container bg-surface-container-low text-primary' : 'border-outline-variant/50 hover:bg-surface-container-low')}>
            {label}<span className="font-mono text-xs uppercase text-outline">{code}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const item = 'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface';
  return (
    <div className="relative border-t border-outline-variant/20 p-3" ref={ref}>
      {open && (
        <div className="absolute inset-x-3 bottom-full z-50 mb-2 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-1.5 shadow-lg">
          <div className="mb-1 border-b border-outline-variant/20 px-3 py-2">
            <p className="font-headline text-sm font-semibold">{user.name}</p>
            <p className="truncate font-mono text-xs text-outline">{user.email}</p>
          </div>
          <button type="button" className={item} onClick={() => { setOpen(false); setLang(true); }}>
            <Languages className="size-4.5" />{t('Bahasa')}<span className="ml-auto font-mono text-xs uppercase text-outline">{user.language}</span>
          </button>
          <button type="button" className={item} onClick={() => { setOpen(false); navigate('/pengaturan'); }}><Settings className="size-4.5" />{t('Setting')}</button>
          <div className="my-1 border-t border-outline-variant/20" />
          <button type="button" className={cx(item, '!text-error hover:!bg-error-container')} onClick={logout}><LogOut className="size-4.5" />{t('Logout')}</button>
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl border border-outline-variant/20 p-2 text-left hover:bg-surface-container-low">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-sm font-bold text-on-primary">{initials(user.name)}</span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-headline text-sm font-semibold">{user.name}</span>
            <span className="font-mono text-xs text-outline">{t(user.role_label)}</span>
          </span>
        </span>
        <ChevronsUpDown className="size-4.5 text-outline" />
      </button>
      <LanguageDialog open={lang} onClose={() => setLang(false)} />
    </div>
  );
}

function Sidebar({ stats, onNavigate }) {
  const { can } = useAuth();
  const s = stats?.sessions;
  return (
    <div className="flex h-full flex-col bg-surface-container-lowest">
      <div className="flex h-16 items-center gap-3 border-b border-outline-variant/20 px-6">
        <Logo className="size-9" />
        <div>
          <p className="font-headline text-base font-bold leading-none tracking-tight">DETAKITA</p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-outline">Telecardiology OS</p>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3" onClick={onNavigate}>
        <NavLink to="/" end className={linkCls}><LayoutGrid className="size-5" />{t('Dashboard')}</NavLink>
        {can('sessions.create') && <NavLink to="/sesi/baru" className={linkCls}><CirclePlus className="size-5" />{t('Tambah Sesi')}</NavLink>}
        {(can('sessions.read_all') || can('sessions.read_own')) && (
          <Group icon={Activity} label={t('Sesi Pemeriksaan')}>
            <NavLink to="/sesi/berjalan" className={subLinkCls}><span>{t('Berjalan')}</span><Count n={s?.running} strong /></NavLink>
            <NavLink to="/sesi/selesai" className={subLinkCls}><span>{t('Selesai')}</span><Count n={s?.completed} /></NavLink>
            <NavLink to="/sesi/arsip" className={subLinkCls}><span>{t('Arsip')}</span></NavLink>
          </Group>
        )}
        {(can('master.read') || can('patients.read')) && (
          <Group icon={Database} label={t('Master Data')}>
            {can('master.read') && <NavLink to="/master/dokter" className={subLinkCls}><span>{t('Dokter')}</span></NavLink>}
            {can('master.read') && <NavLink to="/master/perawat" className={subLinkCls}><span>{t('Perawat')}</span></NavLink>}
            {can('patients.read') && <NavLink to="/master/pasien" className={subLinkCls}><span>{t('Pasien')}</span></NavLink>}
          </Group>
        )}
        <Group icon={FileText} label={t('Dokumen')}>
          <NavLink to="/dokumen/panduan-pengujian" className={subLinkCls}><span>{t('Panduan Pengujian')}</span></NavLink>
          <NavLink to="/dokumen/manajemen-risiko" className={subLinkCls}><span>{t('Manajemen Risiko')}</span></NavLink>
        </Group>
        {can('config.manage') && (
          <Group icon={Settings} label={t('Konfigurasi')}>
            <NavLink to="/konfigurasi/izin" className={subLinkCls}><span>{t('Izin')}</span></NavLink>
            <NavLink to="/konfigurasi/grup" className={subLinkCls}><span>{t('Grup')}</span></NavLink>
            <NavLink to="/konfigurasi/simulator" className={subLinkCls}><span>{t('Simulator')}</span></NavLink>
          </Group>
        )}
      </nav>
      <UserMenu />
    </div>
  );
}

export default function Layout() {
  const { can } = useAuth();
  const { data: stats, reload } = useApi(can('dashboard.view') || can('sessions.read_own') || can('sessions.read_all') ? '/stats' : null, { poll: 30000 });
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  useEffect(() => { setDrawer(false); }, [location.pathname]);

  return (
    <StatsContext.Provider value={{ stats, reloadStats: () => reload(true) }}>
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-outline-variant/30 lg:block">
        <Sidebar stats={stats} />
      </aside>
      {/* mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-outline-variant/30 bg-surface-container-lowest px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <Logo className="size-8" />
          <span className="font-headline font-bold">DETAKITA</span>
        </div>
        <button type="button" onClick={() => setDrawer(true)} className="rounded-lg p-2 hover:bg-surface-container-low" aria-label={t('Buka menu')}><Menu className="size-5" /></button>
      </header>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 cursor-pointer bg-inverse-surface/40" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">
            <Sidebar stats={stats} />
            <button type="button" onClick={() => setDrawer(false)} className="absolute right-3 top-4 rounded-md p-1.5 text-outline hover:bg-surface-container-low" aria-label={t('Tutup menu')}><X className="size-5" /></button>
          </div>
        </div>
      )}
      <main className="min-h-screen p-4 sm:p-6 lg:pl-[calc(18rem+1.5rem)]">
        <Outlet />
      </main>
    </StatsContext.Provider>
  );
}
