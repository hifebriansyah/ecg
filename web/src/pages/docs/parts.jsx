import { Link } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { Card, cx } from '../../components/ui.jsx';
import { t } from '../../lib/i18n.jsx';

// Building blocks shared by the document pages (Dokumen menu). Pass Indonesian keys through t() yourself
// when you give these components text; they only translate their own fixed labels.

// Title card at the top: back link, print button, title block.
export function DocHeader({ eyebrow, title, subtitle, badge, children }) {
  return (
    <Card className="mb-4 p-5 sm:p-8 print:border-0 print:p-0">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-container"><ArrowLeft className="size-4" />{t('Kembali ke Dashboard')}</Link>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-4 py-2 font-headline text-sm font-semibold hover:bg-surface-container-low">
          <Printer className="size-4" />{t('Cetak Dokumen')}
        </button>
      </div>
      {eyebrow && <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-outline">{eyebrow}</p>}
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-headline text-2xl font-bold tracking-tight sm:text-[28px]">{title}</h1>
        {badge && <span className="rounded-full bg-surface-container px-2.5 py-0.5 font-mono text-xs font-semibold text-primary">{badge}</span>}
      </div>
      {subtitle && <p className="mt-2 text-sm text-on-surface-variant">{subtitle}</p>}
      {children}
    </Card>
  );
}

// A numbered section card ("1. Akses Portal ...").
export function DocSection({ id, title, children, className }) {
  return (
    <Card id={id} className={cx('mb-4 p-5 sm:p-8 print:break-inside-avoid-page print:border-0 print:p-0', className)}>
      <h2 className="mb-5 border-b border-outline-variant/30 pb-4 font-headline text-lg font-semibold">{title}</h2>
      <div className="space-y-4 text-sm leading-relaxed text-on-surface-variant">{children}</div>
    </Card>
  );
}

export const DocH3 = ({ children }) => <h3 className="pt-2 font-headline text-base font-semibold text-on-surface">{children}</h3>;
export const DocP = ({ children, className }) => <p className={cx('text-sm leading-relaxed text-on-surface-variant', className)}>{children}</p>;
export const DocList = ({ children, ordered }) => (ordered
  ? <ol className="list-decimal space-y-1.5 pl-5 text-sm text-on-surface-variant">{children}</ol>
  : <ul className="list-disc space-y-1.5 pl-5 text-sm text-on-surface-variant">{children}</ul>);

const TONES = {
  info: 'border-primary-container/30 bg-surface-container-low',
  ok: 'border-tertiary/30 bg-tertiary/5',
  warn: 'border-amber-500/40 bg-amber-50',
  danger: 'border-error/30 bg-error-container/40',
};
// Highlighted note box. tone: info | ok | warn | danger
export function Callout({ tone = 'info', title, children }) {
  return (
    <div className={cx('rounded-lg border px-4 py-3 text-sm text-on-surface-variant', TONES[tone])}>
      {title && <p className="mb-1 font-headline font-semibold text-on-surface">{title}</p>}
      {children}
    </div>
  );
}

// Table. head: array of header cells; rows: array of arrays of cells (strings or nodes); `cellClass(r, c)` is optional.
export function DocTable({ head, rows, cellClass, className }) {
  return (
    <div className={cx('rounded-lg border border-outline-variant/30', className)}>
      <table className="w-full text-left text-sm">
        <thead className="bg-surface-container-low"><tr>{head.map((h, i) => <th key={i} className="px-3 py-2.5 font-headline text-xs font-semibold uppercase tracking-wide text-on-surface">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-outline-variant/20 align-top">
              {r.map((c, ci) => <td key={ci} className={cx('px-3 py-2.5 text-on-surface-variant', ci === 0 && 'font-medium text-on-surface', cellClass && cellClass(ri, ci))}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Numbered step list item for workflows.
export function DocStep({ n, title, children }) {
  return (
    <li className="flex gap-4">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-container font-mono text-sm font-bold text-on-primary">{n}</span>
      <div><p className="font-headline font-semibold text-on-surface">{title}</p><div className="mt-1 text-sm text-on-surface-variant">{children}</div></div>
    </li>
  );
}
