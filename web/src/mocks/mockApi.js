// Mock of the DETAKITA API (worker/api.js) for Storybook. Answers fetch() calls to API_URL with sample data shaped
// exactly like the real responses, so page stories render without a login. The role comes from the toolbar.
import { API_URL } from '../lib/api.js';
import { DOCTORS, NURSES, PATIENTS, SESSIONS, LOOKUPS, NOTES, DEVICES, USERS, ANALYSIS, telemetryFor } from './fixtures.js';

let role = 'admin';
export const setMockRole = (r) => { role = r; };
export const getMockRole = () => role;

const PERMISSIONS = {
  admin: ['users.manage', 'master.write', 'patients.write', 'sessions.create', 'sessions.edit', 'sessions.complete', 'sessions.archive', 'sessions.delete', 'notes.write', 'ai.run'],
  nurse: ['patients.write', 'sessions.create', 'sessions.edit', 'sessions.complete', 'sessions.archive', 'notes.write', 'ai.run'],
  doctor: ['sessions.edit', 'sessions.complete', 'notes.write', 'ai.run'],
};
const me = () => {
  const u = USERS[role];
  const profile = role === 'doctor' ? DOCTORS[0] : role === 'nurse' ? NURSES[0] : null;
  return { ...u, profile, permissions: PERMISSIONS[role], session_scope: role === 'doctor' ? 'own' : 'all' };
};

const page = (rows, url) => {
  const limit = Number(url.searchParams.get('limit') || 20); const p = Number(url.searchParams.get('page') || 1);
  return { data: rows.slice((p - 1) * limit, p * limit), total: rows.length, page: p, limit };
};
const search = (rows, url, cols) => {
  const q = (url.searchParams.get('q') || '').toLowerCase();
  let out = q ? rows.filter((r) => cols.some((c) => String(r[c] ?? '').toLowerCase().includes(q))) : rows;
  for (const [param, col] of [['status', 'status'], ['sex', 'sex'], ['subspecialty', 'subspecialty_code'], ['quota', 'quota_state'], ['unit_id', 'unit_id'], ['shift', 'shift'], ['lead', 'lead'], ['sync_interval', 'sync_interval_sec']]) {
    const v = url.searchParams.get(param);
    if (v) out = out.filter((r) => v.split(',').includes(String(r[col])));
  }
  return out;
};
const byKey = (rows, key, col) => rows.find((r) => String(r.id) === key || r[col] === key);
const ownSessions = () => (role === 'doctor' ? SESSIONS.filter((s) => s.doctor_id === DOCTORS[0].id) : SESSIONS);

// Synthetic Lead II beat (µV) — same model as tools/seed_demo.py.
const WAVES = [[-0.2, 0.025, 150], [-0.035, 0.01, -120], [0, 0.011, 1150], [0.035, 0.012, -280], [0.26, 0.045, 320]];
function ecg(from, to, bpm) {
  const hz = 250; const rr = 60 / bpm; const n = Math.floor(((to - from) / 1000) * hz); const samples = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = from / 1000 + i / hz; const bt = t - (Math.floor(t / rr) + 0.5) * rr;
    samples[i] = Math.round(WAVES.reduce((v, [mu, s, a]) => v + a * Math.exp(-((bt - mu) ** 2) / (2 * s * s)), 0) + 35 * Math.sin(2 * Math.PI * 0.25 * t));
  }
  return { lead: 'II', sampling_hz: hz, from, to, chunks: [{ started_at: from, samples }] };
}

function detail(s) {
  const p = PATIENTS.find((x) => x.id === s.patient_id);
  return {
    ...s, ends_at: s.started_at + s.target_duration_hours * 3600000,
    remaining_ms: s.status === 'running' ? Math.max(0, s.started_at + s.target_duration_hours * 3600000 - Date.now()) : 0,
    patient: p, doctor: { ...DOCTORS.find((d) => d.id === s.doctor_id), subspecialty_name: 'Aritmia & Elektrofisiologi Klinis (PERKI)' },
    nurse: NURSES.find((n) => n.id === s.nurse_id) || null, device: DEVICES.find((d) => d.id === s.device_id) || null,
    emergency_contact: { name: p.emergency_contact_name, relation: p.emergency_contact_relation, phone: p.emergency_contact_phone },
    latest_telemetry: telemetryFor(s), latest_analysis: s.code === SESSIONS[0].code ? ANALYSIS : null,
  };
}

function route(method, url, body) {
  const path = url.pathname.replace(/^\/api/, '');
  const m = (re) => path.match(re);
  let x;
  if (path === '/auth/login') return [200, { token: 'storybook-mock', expires_at: Date.now() + 864e5, user: me() }];
  if (path === '/auth/logout') return [200, { ok: true }];
  if (path === '/me') return [200, method === 'PATCH' ? { ...me(), ...body } : me()];
  if (path === '/lookups') return [200, LOOKUPS];
  if (path === '/stats') {
    const s = ownSessions();
    return [200, { sessions: { running: s.filter((r) => r.status === 'running' && !r.archived_at).length, completed: s.filter((r) => r.status === 'completed' && !r.archived_at).length, archived: s.filter((r) => r.archived_at).length }, patients: PATIENTS.length, doctors: DOCTORS.length, nurses: NURSES.length }];
  }
  if (path === '/sessions' && method === 'GET') {
    const view = url.searchParams.get('view') || 'running';
    let rows = ownSessions().filter((s) => (view === 'running' ? s.status === 'running' && !s.archived_at : view === 'completed' ? s.status === 'completed' && !s.archived_at : view === 'archived' ? s.archived_at : true));
    rows = search(rows, url, ['patient_name', 'patient_mrn', 'code']);
    return [200, page(rows, url)];
  }
  if (path === '/sessions' && method === 'POST') return [201, detail({ ...SESSIONS[0], code: 'b3d1e09', started_at: Date.now() })];
  if (path === '/sessions/bulk') return [200, { action: body.action, done: body.codes, not_found: [] }];
  if ((x = m(/^\/sessions\/([^/]+)\/ecg$/))) {
    const s = SESSIONS.find((r) => r.code === x[1]); const to = Number(url.searchParams.get('to') || Date.now());
    return [200, s?.has_signal === false ? { lead: 'II', sampling_hz: 250, from: to - 10000, to, chunks: [] } : ecg(Number(url.searchParams.get('from') || to - 10000), to, s?.last_bpm || 75)];
  }
  if ((x = m(/^\/sessions\/([^/]+)\/notes$/))) {
    if (method === 'POST') return [201, { id: Date.now(), author_role: role === 'admin' ? 'admin' : role, author_name: me().profile?.full_name || me().name, kind: body.kind, body: body.body, occurred_at: Date.now() }];
    const before = Number(url.searchParams.get('before') || Infinity);
    const rows = NOTES.filter((n) => n.occurred_at < before);
    return [200, { data: rows.slice(0, 10), has_more: rows.length > 10 }];
  }
  if ((x = m(/^\/sessions\/([^/]+)\/analyses$/))) return method === 'POST' ? [201, { ...ANALYSIS, id: 99, status: 'queued', summary: null, findings: null, created_at: Date.now() }] : [200, { data: [ANALYSIS] }];
  if ((x = m(/^\/sessions\/([^/]+)\/(complete|archive|unarchive)$/))) {
    const s = SESSIONS.find((r) => r.code === x[1]);
    return [200, detail({ ...s, status: 'completed', ended_at: s.ended_at || Date.now(), archived_at: x[2] === 'archive' ? Date.now() : x[2] === 'unarchive' ? null : s.archived_at })];
  }
  if ((x = m(/^\/sessions\/([^/]+)$/))) {
    const s = ownSessions().find((r) => r.code === x[1]);
    if (!s) return [404, { error: { code: 'not_found', message: 'Session not found' } }];
    return method === 'DELETE' ? [200, { deleted: true }] : [200, detail(s)];
  }
  for (const [name, rows, col, cols] of [
    ['doctors', DOCTORS, 'code', ['full_name', 'specialty_label', 'code']],
    ['nurses', NURSES, 'code', ['full_name', 'nira', 'unit_name', 'position']],
    ['patients', PATIENTS, 'mrn', ['full_name', 'mrn', 'nik']],
    ['devices', DEVICES, 'serial_number', ['serial_number']],
  ]) {
    if (path === `/${name}`) return method === 'POST' ? [201, { ...rows[0], ...body, id: 999, code: 'NEW-999', mrn: 'CC-2026-0999' }] : [200, page(search(rows, url, cols), url)];
    if ((x = m(new RegExp(`^/${name}/([^/]+)/sessions$`)))) {
      const p = byKey(rows, x[1], col);
      return [200, page(SESSIONS.filter((s) => s.patient_id === p?.id), url)];
    }
    if ((x = m(new RegExp(`^/${name}/([^/]+)$`)))) {
      const r = byKey(rows, x[1], col);
      if (!r) return [404, { error: { code: 'not_found', message: 'Not found' } }];
      if (method === 'DELETE') return [409, { error: { code: 'conflict', message: 'Has exam sessions; set the status to inactive instead' } }];
      return [200, method === 'PATCH' ? { ...r, ...body } : r];
    }
  }
  return [404, { error: { code: 'not_found', message: `Mock has no ${method} ${path}` } }];
}

export function installMockApi() {
  if (window.__detakitaMock) return;
  window.__detakitaMock = true;
  try { sessionStorage.setItem('detakita.token', 'storybook-mock'); } catch { /* storage blocked */ }
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    if (!url.href.startsWith(API_URL)) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : undefined;
    await new Promise((r) => setTimeout(r, 120));
    const [status, data] = route(method, new URL(url.href.replace(API_URL, 'http://mock')), body);
    return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  };
}
