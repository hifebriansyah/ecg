import { Card, Checkbox, EmptyState, ErrorBlock, LoadingBlock, Pagination, cx } from './ui.jsx';
import { SearchX } from 'lucide-react';
import { t } from '../lib/i18n.jsx';

// Flat clinical table from the designs. columns: [{ key, label, className, render(row) }]
export default function DataTable({ list, columns, rowKey = (r) => r.id, onRowClick, selectable, empty, minWidth = 640 }) {
  const { rows, loading, error, reload, data, selected, toggle, selectAll, allOn, someOn, filtered, setSearch, setFilters } = list;
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left" style={{ minWidth }}>
          <thead>
            <tr className="border-b border-outline-variant/20 bg-surface-container-low/40 text-xs">
              {selectable && (
                <th className="w-12 px-4 py-4 text-center sm:px-6">
                  <Checkbox checked={allOn} indeterminate={!allOn && someOn} onChange={(on) => selectAll(on, rowKey)} label={t('Pilih semua')} />
                </th>
              )}
              {columns.map((c) => <th key={c.key} className={cx('px-4 py-4 font-mono font-semibold uppercase tracking-wider text-on-surface', c.className)}>{t(c.label)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/20 text-sm">
            {rows.map((r) => {
              const k = rowKey(r);
              return (
                <tr key={k} onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cx('group transition-colors', onRowClick && 'cursor-pointer hover:bg-surface-container-low/60', selected.has(k) && 'bg-surface-container-low/70')}>
                  {selectable && (
                    <td className="px-4 py-5 text-center sm:px-6" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(k)} onChange={(on) => toggle(k, on)} label={t('Pilih baris')} />
                    </td>
                  )}
                  {columns.map((c) => <td key={c.key} className={cx('px-4 py-5', c.className)}>{c.render(r)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {loading && !data && <LoadingBlock />}
      {error && <ErrorBlock error={error} onRetry={() => reload()} />}
      {!loading && !error && data && rows.length === 0 && (
        filtered
          ? <EmptyState icon={SearchX} title={empty?.filteredTitle || t('Data Tidak Ditemukan')} text={empty?.filteredText || t('Tidak ada data yang cocok dengan kata kunci atau filter saat ini.')}
              action={<button type="button" onClick={() => { setSearch(''); setFilters({}); }} className="text-sm font-semibold text-primary hover:underline">{t(empty?.resetLabel || 'Tampilkan semua data')}</button>} />
          : <EmptyState icon={empty?.icon} title={empty?.title || t('Belum ada data')} text={empty?.text} action={empty?.action} />
      )}
      <Pagination page={list.page} limit={list.limit} total={list.total} onPage={list.setPage} />
    </Card>
  );
}
