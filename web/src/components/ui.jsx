// Shared building blocks in the DETAKITA design language (ecg/design): white cards with a soft outline,
// teal primary actions, Plus Jakarta Sans headings, JetBrains Mono for codes and numbers.
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertCircle, ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, LoaderCircle, Search,
  SlidersHorizontal, X,
} from 'lucide-react';
import { initials } from '../lib/format.js';
import { t } from '../lib/i18n.jsx';

export const cx = (...c) => c.filter(Boolean).join(' ');

// ─── layout ───────────────────────────────────────────────────────────────────
export function Card({ className, children, ...rest }) {
  return <div className={cx('rounded-xl border border-outline-variant/30 bg-surface-container-lowest', className)} {...rest}>{children}</div>;
}

export function PageHeader({ title, badge, back, code, actions }) {
  return (
    <Card className="mb-4 flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
        {back && (
          <>
            <Link to={back.to} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-container">
              <ArrowLeft className="size-4" /> {back.label}
            </Link>
            {(code || title) && <span className="size-1 rounded-full bg-outline-variant" />}
          </>
        )}
        {title && <h1 className="font-headline text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>}
        {code}
        {badge && <span className="rounded-full bg-surface-container px-2.5 py-0.5 font-mono text-xs font-semibold text-primary">{badge}</span>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </Card>
  );
}

export function CodeTag({ children, icon: Icon }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-outline-variant/40 bg-surface-container-low px-2 py-0.5 font-mono text-xs font-semibold text-primary">
      {Icon && <Icon className="size-3.5" />}{children}
    </span>
  );
}

export function SectionCard({ icon: Icon, title, subtitle, children, className }) {
  return (
    <Card className={cx('p-5 sm:p-8', className)}>
      <div className="mb-6 flex items-center gap-3 border-b border-outline-variant/30 pb-5">
        {Icon && <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-container-low text-primary"><Icon className="size-5" /></div>}
        <div>
          <h2 className="font-headline text-lg font-semibold">{title}</h2>
          {subtitle && <p className="text-xs text-outline">{subtitle}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

// ─── buttons ──────────────────────────────────────────────────────────────────
const BTN = {
  primary: 'bg-primary-container text-on-primary hover:bg-primary',
  secondary: 'border border-outline-variant/50 bg-surface-container-lowest text-on-surface hover:bg-surface-container-low',
  ghost: 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
  danger: 'bg-error text-white hover:bg-on-error-container',
  tertiary: 'bg-tertiary text-white hover:brightness-110',
};
export function Button({ variant = 'primary', icon: Icon, loading, children, className, ...rest }) {
  return (
    <button
      type="button" {...rest} disabled={loading || rest.disabled}
      className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-headline text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55', BTN[variant], className)}
    >
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : Icon && <Icon className="size-4.5" />}
      {children}
    </button>
  );
}
export function ButtonLink({ to, variant = 'primary', icon: Icon, children, className, title }) {
  return (
    <Link to={to} title={title} className={cx('inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-headline text-sm font-semibold transition-colors', BTN[variant], className)}>
      {Icon && <Icon className="size-4.5" />}{children}
    </Link>
  );
}

// ─── small display pieces ─────────────────────────────────────────────────────
const AVATAR_TONES = ['bg-primary-container text-on-primary', 'bg-secondary text-white', 'bg-tertiary text-white', 'bg-surface-container-high text-primary', 'bg-primary text-on-primary'];
export function Avatar({ name, index = 0, size = 'md', muted }) {
  const s = size === 'lg' ? 'size-14 text-lg' : size === 'sm' ? 'size-8 text-xs' : 'size-10 text-sm';
  return (
    <div className={cx('flex shrink-0 items-center justify-center rounded-full font-headline font-bold', s, muted ? 'bg-surface-container-high text-outline' : AVATAR_TONES[index % AVATAR_TONES.length])}>
      {initials(name)}
    </div>
  );
}

const PILL = {
  active: 'bg-surface-container text-tertiary', running: 'bg-[#e3f8f1] text-tertiary', completed: 'bg-surface-container text-primary',
  leave: 'bg-[#fff1df] text-[#9a5a12]', inactive: 'bg-surface-container-high text-outline', archived: 'bg-surface-container-high text-outline',
  warn: 'bg-[#fff1df] text-[#9a5a12]', error: 'bg-error-container text-on-error-container',
};
const DOT = { active: 'bg-tertiary', running: 'bg-tertiary animate-pulse', completed: 'bg-primary', leave: 'bg-[#e07a2f]', inactive: 'bg-outline', archived: 'bg-outline', warn: 'bg-[#e07a2f]', error: 'bg-error' };
export function StatusPill({ tone, children, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium', PILL[tone] || PILL.inactive, className)}>
      <span className={cx('size-1.5 rounded-full', DOT[tone] || DOT.inactive)} />{children}
    </span>
  );
}

export function Spinner({ className }) {
  return <LoaderCircle className={cx('size-5 animate-spin text-outline', className)} aria-label={t('Memuat')} />;
}
export function LoadingBlock({ label = 'Memuat data…' }) {
  return <div className="flex items-center justify-center gap-2 py-16 text-sm text-outline"><Spinner />{t(label)}</div>;
}
export function ErrorBlock({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 py-14 text-center">
      <AlertCircle className="size-8 text-error" />
      <p className="text-sm text-on-surface-variant">{error?.message || t('Gagal memuat data.')}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>{t('Coba lagi')}</Button>}
    </div>
  );
}
export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      {Icon && <div className="mb-2 flex size-14 items-center justify-center rounded-full bg-surface-container-low text-outline"><Icon className="size-7" /></div>}
      <p className="font-headline text-lg font-semibold">{t(title)}</p>
      {text && <p className="max-w-sm text-sm text-outline">{t(text)}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function Pagination({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  if (total <= limit) return null;
  return (
    <div className="flex items-center justify-between border-t border-outline-variant/20 px-4 py-3 text-sm text-outline sm:px-6">
      <span>{t('{from}–{to} dari {total}', { from: (page - 1) * limit + 1, to: Math.min(page * limit, total), total })}</span>
      <div className="flex items-center gap-1">
        <button className="rounded-md p-1.5 hover:bg-surface-container-low disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('Halaman sebelumnya')}><ChevronLeft className="size-4" /></button>
        <span className="px-2 font-mono text-xs">{page} / {pages}</span>
        <button className="rounded-md p-1.5 hover:bg-surface-container-low disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('Halaman berikutnya')}><ChevronRight className="size-4" /></button>
      </div>
    </div>
  );
}

export function Checkbox({ checked, indeterminate, onChange, label, disabled }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <input
      ref={ref} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className="size-4 cursor-pointer rounded border-outline-variant accent-primary-container"
    />
  );
}

// ─── search + filter menu + chips (lists) ─────────────────────────────────────
// filters: [{ key, label, chip, options: [{ value, label }] }]; value: { [key]: value }
export function SearchFilterBar({ search, onSearch, placeholder, filters = [], value = {}, onChange }) {
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState(null);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) { setOpen(false); setSub(null); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const active = filters.filter((f) => value[f.key] !== undefined && value[f.key] !== '');
  const hasAny = active.length || search;

  return (
    <Card className="mb-4 flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4.5 -translate-y-1/2 text-outline" />
          <input
            type="search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder}
            className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest py-2 pl-10 pr-3 text-sm placeholder:text-outline focus:border-primary-container focus:outline-none"
          />
        </div>
        {filters.length > 0 && (
          <div className="relative" ref={ref}>
            <button
              type="button" onClick={() => { setOpen((o) => !o); setSub(null); }} title={t('Filter')} aria-expanded={open}
              className="flex size-10 items-center justify-center rounded-lg border border-outline-variant/40 text-on-surface-variant hover:bg-surface-container-low"
            >
              <SlidersHorizontal className="size-4.5" />
            </button>
            {open && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-64 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-2 shadow-lg">
                {!sub ? (
                  <>
                    <p className="mb-1 border-b border-outline-variant/20 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-outline">{t('Pilih Kriteria Filter')}</p>
                    {filters.map((f) => (
                      <button key={f.key} type="button" onClick={() => setSub(f)} className="block w-full rounded-lg p-2 text-left hover:bg-surface-container-low">
                        <span className="flex items-center justify-between text-sm font-medium">{t(f.label)}<ChevronRight className="size-4 text-outline" /></span>
                        <span className="text-xs text-outline">{f.options.slice(0, 3).map((o) => t(o.label)).join(', ')}</span>
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => setSub(null)} className="mb-1 flex w-full items-center gap-1 border-b border-outline-variant/20 px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-outline">
                      <ChevronLeft className="size-3.5" />{t(sub.label)}
                    </button>
                    {sub.options.map((o) => {
                      const on = String(value[sub.key]) === String(o.value);
                      return (
                        <button
                          key={o.value} type="button"
                          onClick={() => { onChange({ ...value, [sub.key]: on ? undefined : o.value }); setOpen(false); setSub(null); }}
                          className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-container-low"
                        >
                          {t(o.label)}{on && <Check className="size-4 text-primary" />}
                        </button>
                      );
                    })}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {hasAny ? (
        <div className="flex flex-wrap items-center gap-2">
          {active.map((f) => (
            <span key={f.key} className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant/30 bg-surface-container px-3 py-1 text-xs font-medium">
              <span className="text-outline">{t(f.chip || f.label)}:</span>
              <span>{t(f.options.find((o) => String(o.value) === String(value[f.key]))?.label ?? value[f.key])}</span>
              <button type="button" onClick={() => onChange({ ...value, [f.key]: undefined })} title={t('Hapus filter')} className="text-outline hover:text-on-surface"><X className="size-3.5" /></button>
            </span>
          ))}
          <button type="button" onClick={() => { onSearch(''); onChange({}); }} className="px-1 text-sm font-medium text-secondary hover:text-primary">{t('Reset')}</button>
        </div>
      ) : null}
    </Card>
  );
}

// ─── form fields ──────────────────────────────────────────────────────────────
const inputCls = (error, extra) => cx(
  'w-full rounded-lg border bg-surface-container-lowest px-3.5 py-2.5 text-sm text-on-surface placeholder:text-outline transition-colors focus:outline-none focus:ring-2 focus:ring-primary-container/15 disabled:cursor-not-allowed disabled:bg-surface-container-low disabled:text-on-surface-variant',
  error ? 'border-error' : 'border-outline-variant/60 focus:border-primary-container', extra,
);

export function Field({ label, required, error, hint, children, className, upper }) {
  const id = useId();
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className={cx('mb-1.5 block font-medium', upper ? 'text-xs uppercase tracking-wider text-on-surface-variant' : 'text-sm')}>
          {label}{required && <span className="ml-0.5 text-error">*</span>}
        </label>
      )}
      {children(id, error)}
      {error ? <p className="mt-1.5 text-xs text-error">{error}</p> : hint ? <p className="mt-1.5 text-xs text-outline">{hint}</p> : null}
    </div>
  );
}

export function Input({ label, required, error, hint, className, icon: Icon, mono, upper, ...rest }) {
  return (
    <Field label={label} required={required} error={error} hint={hint} className={className} upper={upper}>
      {(id) => (
        <div className="relative">
          <input id={id} {...rest} aria-invalid={!!error} className={inputCls(error, cx(Icon && 'pr-10', mono && 'font-mono'))} />
          {Icon && <Icon className="pointer-events-none absolute right-3 top-1/2 size-4.5 -translate-y-1/2 text-outline" />}
        </div>
      )}
    </Field>
  );
}

export function Select({ label, required, error, hint, className, options, placeholder, upper, ...rest }) {
  return (
    <Field label={label} required={required} error={error} hint={hint} className={className} upper={upper}>
      {(id) => (
        <div className="relative">
          <select id={id} {...rest} aria-invalid={!!error} className={inputCls(error, 'appearance-none pr-10')}>
            {placeholder !== undefined && <option value="">{t(placeholder)}</option>}
            {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{t(o.label)}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4.5 -translate-y-1/2 text-outline" />
        </div>
      )}
    </Field>
  );
}

export function Textarea({ label, required, error, hint, className, upper, ...rest }) {
  return (
    <Field label={label} required={required} error={error} hint={hint} className={className} upper={upper}>
      {(id) => <textarea id={id} rows={3} {...rest} aria-invalid={!!error} className={inputCls(error, 'resize-y')} />}
    </Field>
  );
}

export function Toggle({ checked, onChange, label, disabled }) {
  return (
    <label className={cx('inline-flex select-none items-center gap-2 text-sm font-medium', disabled ? 'opacity-60' : 'cursor-pointer')}>
      <button
        type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-tertiary' : 'bg-outline-variant')}
      >
        <span className={cx('absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5.5' : 'translate-x-0.5')} />
      </button>
      {label}
    </label>
  );
}

// ─── dialogs & toasts ─────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, icon: Icon, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-inverse-surface/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className={cx('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface-container-lowest shadow-2xl sm:rounded-2xl', size === 'sm' ? 'sm:max-w-sm' : 'sm:max-w-lg')}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-outline-variant/30 px-6 py-4">
            <div className="flex items-center gap-3">
              {Icon && <div className="flex size-9 items-center justify-center rounded-lg bg-surface-container-low text-primary"><Icon className="size-5" /></div>}
              <h2 className="font-headline text-lg font-semibold">{title}</h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-1.5 text-outline hover:bg-surface-container-low" aria-label={t('Tutup')}><X className="size-5" /></button>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-outline-variant/30 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, text, confirmLabel = 'Hapus', danger = true, loading, icon: Icon = AlertCircle }) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <div className={cx('flex size-12 items-center justify-center rounded-full', danger ? 'bg-error-container text-error' : 'bg-surface-container text-primary')}><Icon className="size-6" /></div>
        <h2 className="font-headline text-lg font-semibold">{title}</h2>
        <p className="text-sm text-on-surface-variant">{text}</p>
        <div className="mt-3 grid w-full grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>{t('Batal')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{t(confirmLabel)}</Button>
        </div>
      </div>
    </Modal>
  );
}

const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((item) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((all) => [...all, { id, tone: 'success', ...item }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), item.duration || 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[70] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
        {toasts.map((n) => (
          <div key={n.id} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-4 shadow-lg">
            {n.tone === 'error' ? <AlertCircle className="mt-0.5 size-5 shrink-0 text-error" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-tertiary" />}
            <div className="min-w-0 flex-1">
              <p className="font-headline text-sm font-semibold">{t(n.title)}</p>
              {n.text && <p className="mt-0.5 text-xs text-on-surface-variant">{t(n.text)}</p>}
            </div>
            <button type="button" onClick={() => setToasts((all) => all.filter((x) => x.id !== n.id))} className="text-outline hover:text-on-surface" aria-label={t('Tutup')}><X className="size-4" /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);

// API validation errors ({fields}) -> { field: 'pesan' } in Indonesian.
const FIELD_MSG = {
  required: 'Wajib diisi', 'already used': 'Sudah dipakai', 'must be 16 digits': 'Harus 16 digit angka',
  'must be an email address': 'Format email tidak valid', 'must be a phone number': 'Format nomor tidak valid',
  'must be YYYY-MM-DD': 'Tanggal tidak valid', 'not found': 'Tidak ditemukan',
};
export function fieldErrors(err) {
  if (!err?.fields) return {};
  return Object.fromEntries(Object.entries(err.fields).map(([k, v]) => [k, t(FIELD_MSG[v] || v)]));
}
