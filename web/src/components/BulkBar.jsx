import { LoaderCircle, X } from 'lucide-react';
import { cx } from './ui.jsx';

// Floating dark action bar for selected rows (session list design). actions: [{ key, icon, label, onClick, danger, title }]
export default function BulkBar({ count, onClear, actions, busy }) {
  if (!count) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 lg:left-[calc(50%+9rem)]">
      <div className="flex items-center gap-1 rounded-2xl bg-inverse-surface px-3 py-2.5 text-sm text-white shadow-2xl">
        <span className="flex size-7 items-center justify-center rounded-full bg-primary-container font-mono text-xs font-bold">{count}</span>
        <span className="mx-2 h-5 w-px bg-white/20" />
        {actions.map((a) => (
          <button key={a.key} type="button" onClick={a.onClick} disabled={busy} title={a.title || a.label}
            className={cx('flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition-colors disabled:opacity-50', a.danger ? 'text-[#ffb4ab] hover:bg-white/10' : 'hover:bg-white/10')}>
            {busy === a.key ? <LoaderCircle className="size-4 animate-spin" /> : <a.icon className="size-4" />}
            {a.label && <span className="hidden sm:inline">{a.label}</span>}
          </button>
        ))}
        <span className="mx-2 h-5 w-px bg-white/20" />
        <button type="button" onClick={onClear} className="rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Batalkan pilihan"><X className="size-4" /></button>
      </div>
    </div>
  );
}
