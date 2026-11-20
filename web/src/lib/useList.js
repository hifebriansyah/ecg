import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApi, useDebounced, withQuery } from './useApi.js';

// List state shared by the list screens: search box, filter chips, row selection, and infinite scroll.
// Pages of `limit` rows are fetched one after another and added below the rows already shown; the table
// calls loadMore() when its last row comes into view. A new search or filter starts again from page 1.
// `poll` reloads the newest page quietly (rows already shown are updated in place, matched by id).
export function useList(path, { defaults = {}, limit = 20, poll } = {}) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const q = useDebounced(search.trim());

  useEffect(() => { setPage(1); setItems([]); setSelected(new Set()); }, [q, filters, path]);

  const url = useMemo(() => withQuery(path, { q, page, limit, ...filters }), [path, q, page, limit, filters]);
  const res = useApi(url, { poll });

  // Merge each answer into the rows shown: page 1 replaces them, later pages are appended (no duplicates,
  // e.g. when a row moved between pages because something was added meanwhile).
  useEffect(() => {
    const d = res.data;
    if (!d) return;
    setItems((cur) => {
      if (d.page === 1) {
        const fresh = new Map(d.data.map((r) => [r.id, r]));
        // keep later pages already scrolled into when page 1 is polled again
        return cur.length > d.data.length ? [...d.data, ...cur.filter((r) => !fresh.has(r.id))] : d.data;
      }
      const byId = new Map(cur.map((r, i) => [r.id, i]));
      const next = [...cur];
      for (const r of d.data) {
        if (byId.has(r.id)) next[byId.get(r.id)] = r; else next.push(r);
      }
      return next;
    });
  }, [res.data]);

  const total = res.data?.total ?? 0;
  const hasMore = items.length < total && (res.data?.data?.length ?? 0) > 0;
  const loadingMore = res.loading && page > 1;
  const loadMore = useCallback(() => {
    if (!res.loading && hasMore) setPage((p) => p + 1);
  }, [res.loading, hasMore]);
  // after an action (complete, delete, ...): start again from the top
  const reload = useCallback((quiet) => {
    if (page === 1) res.reload(quiet); else { setItems([]); setPage(1); }
  }, [page, res]);

  const rows = items;
  const toggle = (key, on) => setSelected((s) => { const n = new Set(s); on ? n.add(key) : n.delete(key); return n; });
  const allOn = rows.length > 0 && rows.every((r) => selected.has(r.__key ?? r.id));
  const someOn = rows.some((r) => selected.has(r.__key ?? r.id));

  return {
    ...res, reload, rows, total, page, limit, hasMore, loadMore, loadingMore,
    search, setSearch, filters, setFilters, filtered: !!(q || Object.values(filters).some((v) => v !== undefined && v !== '')),
    selected, toggle, clearSelection: () => setSelected(new Set()),
    selectAll: (on, keyOf = (r) => r.id) => setSelected(on ? new Set(rows.map(keyOf)) : new Set()),
    allOn, someOn,
  };
}
