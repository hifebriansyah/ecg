import { useEffect, useMemo, useState } from 'react';
import { useApi, useDebounced, withQuery } from './useApi.js';

// List state shared by the list screens: search box, filter chips, page, row selection.
export function useList(path, { defaults = {}, limit = 20, poll } = {}) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());
  const q = useDebounced(search.trim());

  useEffect(() => { setPage(1); setSelected(new Set()); }, [q, filters, path]);

  const url = useMemo(() => withQuery(path, { q, page, limit, ...filters }), [path, q, page, limit, filters]);
  const res = useApi(url, { poll });
  const rows = res.data?.data || [];

  const toggle = (key, on) => setSelected((s) => { const n = new Set(s); on ? n.add(key) : n.delete(key); return n; });
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.__key ?? r.id));
  const someOn = rows.some((r) => selected.has(r.__key ?? r.id));

  return {
    ...res, rows, total: res.data?.total ?? 0, page, limit, setPage,
    search, setSearch, filters, setFilters, filtered: !!(q || Object.values(filters).some((v) => v !== undefined && v !== '')),
    selected, toggle, clearSelection: () => setSelected(new Set()),
    selectAll: (on, keyOf = (r) => r.id) => setSelected(on ? new Set(rows.map(keyOf)) : new Set()),
    allOn, someOn,
  };
}
