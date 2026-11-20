// DETAKITA REST API (Cloudflare Worker + D1 "ecg"). Built from the screens in ecg/design/.
// Endpoints and the role rules (admin / doctor = dokter / nurse = perawat) are in ecg/README.md. Deploy: python3 ecg/tools/deploy_worker.py
//
// Auth
//   * People: POST /auth/login -> { token }. Send it as "Authorization: Bearer <token>".
//   * Holter device / mobile app: header "X-Ingest-Key: <INGEST_TOKEN secret>", only on the ingest routes
//     (telemetry, ECG chunks, patient notes, AI results).
// Times are ms since 1970 (UTC). Errors: { error: { code, message, fields? } }.

const DAY = 86400000;
const TOKEN_TTL = 7 * DAY;
const PBKDF2_ITER = 100000;

// ─── small helpers ────────────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(status, code, message, fields) { super(message); this.status = status; this.code = code; this.fields = fields; }
}
const bad = (message, fields) => new HttpError(400, 'invalid', message, fields);
const notFound = (what) => new HttpError(404, 'not_found', `${what} not found`);
const conflict = (message) => new HttpError(409, 'conflict', message);

function cors(env, req) {
  const allowed = (env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const origin = req.headers.get('Origin') || '';
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,X-Ingest-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

async function body(req) {
  try { const b = await req.json(); if (b && typeof b === 'object') return b; } catch { /* fall through */ }
  throw bad('Body must be a JSON object');
}

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));
async function sha256(text) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
}

// Password format (same as tools/create_admin.py): pbkdf2$<iterations>$<salt b64>$<hash b64>, SHA-256, 32 bytes.
async function verifyPassword(password, stored) {
  const [kind, iter, salt, hash] = String(stored).split('$');
  if (kind !== 'pbkdf2') return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: +iter }, key, 256);
  return safeEqual(b64(new Uint8Array(bits)), hash);
}
async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256);
  return `pbkdf2$${PBKDF2_ITER}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

function paging(url) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 100);
  const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10) || 1, 1);
  return { limit, page, offset: (page - 1) * limit };
}
const like = (q) => `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
const pad = (n, w) => String(n).padStart(w, '0');

// "dr. Andi Pratama, Sp.JP (K)" -> "ANDI" (for codes like DOC-042-ANDI)
function firstName(full) {
  const word = String(full).split(',')[0].split(/\s+/).find((w) => w && !w.endsWith('.')) || 'X';
  return word.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 12) || 'X';
}

// Patient age in whole years, from 'YYYY-MM-DD'.
const AGE_SQL = (col) => `(CAST(strftime('%Y','now') AS INTEGER) - CAST(substr(${col},1,4) AS INTEGER) - (strftime('%m-%d','now') < substr(${col},6,5)))`;

// ─── field validation ─────────────────────────────────────────────────────────
// spec: { type: 'text'|'int'|'num'|'date'|'enum'|'nik'|'email'|'phone'|'bool', max?, values?, min?, maxv? }
function clean(input, specs, required, partial) {
  const out = {}; const errors = {};
  for (const [name, spec] of Object.entries(specs)) {
    if (!(name in input)) { if (!partial && required.includes(name)) errors[name] = 'required'; continue; }
    let v = input[name];
    if (v === null || v === '') {
      if (required.includes(name)) errors[name] = 'required'; else out[name] = null;
      continue;
    }
    switch (spec.type) {
      case 'int': case 'num':
        v = Number(v);
        if (!Number.isFinite(v) || (spec.type === 'int' && !Number.isInteger(v))) { errors[name] = 'must be a number'; continue; }
        if (spec.min != null && v < spec.min) { errors[name] = `must be ≥ ${spec.min}`; continue; }
        if (spec.maxv != null && v > spec.maxv) { errors[name] = `must be ≤ ${spec.maxv}`; continue; }
        if (spec.values && !spec.values.includes(v)) { errors[name] = `must be one of ${spec.values.join(', ')}`; continue; }
        break;
      case 'bool': v = v ? 1 : 0; break;
      case 'enum':
        if (!spec.values.includes(v)) { errors[name] = `must be one of ${spec.values.join(', ')}`; continue; }
        break;
      case 'date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) { errors[name] = 'must be YYYY-MM-DD'; continue; }
        break;
      case 'nik':
        v = String(v).replace(/\s/g, '');
        if (!/^\d{16}$/.test(v)) { errors[name] = 'must be 16 digits'; continue; }
        break;
      case 'email':
        v = String(v).trim();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || v.length > 200) { errors[name] = 'must be an email address'; continue; }
        break;
      case 'phone':
        v = String(v).trim();
        if (!/^\+?[\d\s\-()]{7,24}$/.test(v)) { errors[name] = 'must be a phone number'; continue; }
        break;
      default:
        v = String(v).trim();
        if (v.length > (spec.max || 500)) { errors[name] = `max ${spec.max || 500} characters`; continue; }
        if (!v && required.includes(name)) { errors[name] = 'required'; continue; }
    }
    out[name] = v;
  }
  if (Object.keys(errors).length) throw bad('Some fields are not valid', errors);
  return out;
}

// SQLite constraint errors -> 409 with the field that clashed.
function dbError(e) {
  const m = String(e && e.message || e);
  const u = m.match(/UNIQUE constraint failed: \w+\.(\w+)/);
  if (u) return new HttpError(409, 'duplicate', `${u[1]} is already used`, { [u[1]]: 'already used' });
  if (/FOREIGN KEY constraint failed/.test(m)) return conflict('Linked record is missing or still in use');
  if (/CHECK constraint failed/.test(m)) return bad('A value is not allowed');
  return null;
}

// ─── master data (doctors, nurses, patients, devices) ────────────────────────
const MASTER = {
  doctors: {
    table: 'doctors', view: 'v_doctor_list', label: 'Doctor', codePrefix: 'DOC',
    fields: {
      full_name: { type: 'text', max: 200 }, nik: { type: 'nik' }, str_number: { type: 'text', max: 60 },
      sip_number: { type: 'text', max: 60 }, subspecialty_code: { type: 'text', max: 40 }, specialty_label: { type: 'text', max: 200 },
      email: { type: 'email' }, whatsapp: { type: 'phone' },
      status: { type: 'enum', values: ['active', 'leave', 'inactive'] }, patient_quota: { type: 'int', min: 0, maxv: 1000 },
    },
    required: ['full_name', 'nik', 'str_number', 'sip_number', 'subspecialty_code', 'email', 'whatsapp'],
    search: ['full_name', 'specialty_label', 'str_number', 'code'],
    filters: { status: 'status', subspecialty: 'subspecialty_code', quota: 'quota_state' },
    order: 'full_name',
    inUse: 'SELECT 1 FROM exam_sessions WHERE doctor_id = ? LIMIT 1',
  },
  nurses: {
    table: 'nurses', view: 'v_nurse_list', label: 'Nurse', codePrefix: 'NRS',
    fields: {
      full_name: { type: 'text', max: 200 }, nik: { type: 'text', max: 30 }, nira: { type: 'text', max: 40 },
      sipp_number: { type: 'text', max: 60 }, str_number: { type: 'text', max: 60 }, position: { type: 'text', max: 200 },
      unit_id: { type: 'int', min: 1 }, shift: { type: 'enum', values: ['morning', 'afternoon', 'night'] },
      email: { type: 'email' }, whatsapp: { type: 'phone' }, status: { type: 'enum', values: ['active', 'inactive'] },
    },
    required: ['full_name', 'nik'],
    search: ['full_name', 'nira', 'unit_name', 'position', 'code'],
    filters: { status: 'status', unit_id: 'unit_id', shift: 'shift' },
    order: 'full_name',
    inUse: 'SELECT 1 FROM exam_sessions WHERE nurse_id = ? LIMIT 1',
  },
  patients: {
    table: 'patients', label: 'Patient', codeColumn: 'mrn',
    view: `(SELECT p.*, ${AGE_SQL('p.birth_date')} AS age,
             (SELECT code FROM exam_sessions s WHERE s.patient_id = p.id AND s.status = 'running' AND s.archived_at IS NULL LIMIT 1) AS running_session
            FROM patients p)`,
    fields: {
      mrn: { type: 'text', max: 40 }, full_name: { type: 'text', max: 200 }, nik: { type: 'nik' }, birth_date: { type: 'date' },
      sex: { type: 'enum', values: ['M', 'F'] }, phone: { type: 'phone' },
      emergency_contact_name: { type: 'text', max: 200 }, emergency_contact_relation: { type: 'text', max: 60 },
      emergency_contact_phone: { type: 'phone' }, address: { type: 'text', max: 1000 }, medical_history: { type: 'text', max: 4000 },
      status: { type: 'enum', values: ['active', 'inactive'] },
    },
    required: ['full_name', 'nik', 'birth_date', 'sex', 'phone', 'emergency_contact_phone'],
    search: ['full_name', 'mrn', 'nik'],
    filters: { status: 'status', sex: 'sex' },
    order: 'full_name',
    inUse: 'SELECT 1 FROM exam_sessions WHERE patient_id = ? LIMIT 1',
  },
  devices: {
    table: 'devices', label: 'Device', codeColumn: 'serial_number',
    fields: {
      serial_number: { type: 'text', max: 60 }, model: { type: 'text', max: 100 }, firmware: { type: 'text', max: 40 },
      status: { type: 'enum', values: ['available', 'in_use', 'maintenance', 'retired'] },
    },
    required: ['serial_number'],
    search: ['serial_number', 'model'],
    filters: { status: 'status' },
    order: 'serial_number',
    inUse: "SELECT 1 FROM exam_sessions WHERE device_id = ? AND status = 'running' LIMIT 1",
  },
};

async function findMaster(env, m, key) {
  const col = /^\d+$/.test(key) ? 'id' : (m.codeColumn || 'code');
  const row = await env.DB.prepare(`SELECT * FROM ${m.view || m.table} WHERE ${col} = ?`).bind(key).first();
  if (!row) throw notFound(m.label);
  return row;
}

async function listMaster(env, m, url) {
  const { limit, page, offset } = paging(url);
  const where = []; const args = [];
  const q = (url.searchParams.get('q') || '').trim();
  if (q) { where.push('(' + m.search.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ') + ')'); m.search.forEach(() => args.push(like(q))); }
  for (const [param, col] of Object.entries(m.filters)) {
    const vals = url.searchParams.getAll(param).flatMap((v) => v.split(',')).filter(Boolean);
    if (vals.length) { where.push(`${col} IN (${vals.map(() => '?').join(',')})`); args.push(...vals); }
  }
  const from = `FROM ${m.view || m.table} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`;
  const [rows, total] = await env.DB.batch([
    env.DB.prepare(`SELECT * ${from} ORDER BY ${m.order} LIMIT ? OFFSET ?`).bind(...args, limit, offset),
    env.DB.prepare(`SELECT COUNT(*) AS n ${from}`).bind(...args),
  ]);
  return { data: rows.results, total: total.results[0].n, page, limit };
}

async function createMaster(env, m, input) {
  const data = clean(input, m.fields, m.required, false);
  const now = Date.now();
  if (m.table === 'doctors' || m.table === 'nurses') data.code = 'TMP-' + b64url(randomBytes(8));
  if (m.table === 'patients' && !data.mrn) data.mrn = 'TMP-' + b64url(randomBytes(8));
  data.created_at = now; data.updated_at = now;
  const cols = Object.keys(data);
  let id;
  try {
    const r = await env.DB.prepare(`INSERT INTO ${m.table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
      .bind(...cols.map((c) => data[c])).run();
    id = r.meta.last_row_id;
    // human codes from the designs: DOC-042-ANDI, NRS-018-SITI, CC-2026-0982
    if (m.codePrefix) await env.DB.prepare(`UPDATE ${m.table} SET code = ? WHERE id = ?`).bind(`${m.codePrefix}-${pad(id, 3)}-${firstName(data.full_name)}`, id).run();
    if (m.table === 'patients' && data.mrn.startsWith('TMP-'))
      await env.DB.prepare('UPDATE patients SET mrn = ? WHERE id = ?').bind(`CC-${new Date(now).getUTCFullYear()}-${pad(id, 4)}`, id).run();
  } catch (e) { throw dbError(e) || e; }
  return findMaster(env, m, String(id));
}

async function updateMaster(env, m, key, input) {
  const row = await findMaster(env, m, key);
  const data = clean(input, m.fields, m.required, true);
  if (!Object.keys(data).length) throw bad('Nothing to update');
  data.updated_at = Date.now();
  const cols = Object.keys(data);
  try {
    await env.DB.prepare(`UPDATE ${m.table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map((c) => data[c]), row.id).run();
  } catch (e) { throw dbError(e) || e; }
  return findMaster(env, m, String(row.id));
}

async function deleteMaster(env, m, key) {
  const row = await findMaster(env, m, key);
  if (await env.DB.prepare(m.inUse).bind(row.id).first()) throw conflict(`${m.label} has exam sessions; set the status to inactive instead`);
  await env.DB.prepare(`DELETE FROM ${m.table} WHERE id = ?`).bind(row.id).run();
  return { deleted: true };
}

// ─── exam sessions ────────────────────────────────────────────────────────────
const SESSION_FIELDS = {
  patient_id: { type: 'int', min: 1 }, doctor_id: { type: 'int', min: 1 }, nurse_id: { type: 'int', min: 1 }, device_id: { type: 'int', min: 1 },
  target_duration_hours: { type: 'int', values: [24, 48, 72] }, started_at: { type: 'int', min: 0 },
  sync_interval_sec: { type: 'int', values: [1, 5] }, lead: { type: 'text', max: 10 }, lead_config: { type: 'text', max: 60 },
  sampling_hz: { type: 'int', min: 50, maxv: 2000 }, filter_low_hz: { type: 'num', min: 0 }, filter_high_hz: { type: 'num', min: 0 },
  clinical_indication: { type: 'text', max: 500 }, notes: { type: 'text', max: 4000 },
};
const SESSION_REQUIRED = ['patient_id', 'doctor_id', 'clinical_indication'];
// Only these can change once the session has started.
const SESSION_EDITABLE = ['nurse_id', 'target_duration_hours', 'sync_interval_sec', 'clinical_indication', 'notes', 'filter_low_hz', 'filter_high_hz'];

const SESSION_LIST_SQL = `
  SELECT s.id, s.code, s.status, s.archived_at, s.started_at, s.ended_at, s.target_duration_hours, s.sync_interval_sec,
         s.lead, s.sampling_hz, s.last_bpm, s.last_rhythm, s.last_seen_at, s.clinical_indication,
         p.id AS patient_id, p.full_name AS patient_name, p.mrn AS patient_mrn, p.sex AS patient_sex, ${AGE_SQL('p.birth_date')} AS patient_age,
         d.id AS doctor_id, d.full_name AS doctor_name, n.full_name AS nurse_name, v.serial_number AS device_serial
  FROM exam_sessions s
  JOIN patients p ON p.id = s.patient_id
  JOIN doctors d ON d.id = s.doctor_id
  LEFT JOIN nurses n ON n.id = s.nurse_id
  LEFT JOIN devices v ON v.id = s.device_id`;

async function getSession(env, code) {
  const s = await env.DB.prepare('SELECT * FROM exam_sessions WHERE code = ?').bind(String(code).replace(/^#/, '')).first();
  if (!s) throw notFound('Session');
  return s;
}

async function listSessions(env, url, auth) {
  const { limit, page, offset } = paging(url);
  const where = []; const args = [];
  if (auth && auth.user) {
    const scope = sessionScope(auth.user);
    if (scope === 'none') throw forbidden();
    if (scope === 'own') { where.push('s.doctor_id = ?'); args.push(auth.user.doctor_id ?? -1); }
  }
  const view = url.searchParams.get('view') || 'running';
  if (view === 'running') where.push("s.status = 'running' AND s.archived_at IS NULL");
  else if (view === 'completed') where.push("s.status = 'completed' AND s.archived_at IS NULL");
  else if (view === 'archived') where.push('s.archived_at IS NOT NULL');
  else if (view !== 'all') throw bad('view must be running, completed, archived or all');
  const q = (url.searchParams.get('q') || '').trim();
  if (q) { where.push("(p.full_name LIKE ? ESCAPE '\\' OR p.mrn LIKE ? ESCAPE '\\' OR s.code LIKE ? ESCAPE '\\')"); args.push(like(q), like(q), like(q)); }
  for (const [param, col] of [['lead', 's.lead'], ['sync_interval', 's.sync_interval_sec'], ['doctor_id', 's.doctor_id'], ['nurse_id', 's.nurse_id'], ['patient_id', 's.patient_id']]) {
    const vals = url.searchParams.getAll(param).flatMap((v) => v.split(',')).filter(Boolean);
    if (vals.length) { where.push(`${col} IN (${vals.map(() => '?').join(',')})`); args.push(...vals); }
  }
  const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const [rows, total] = await env.DB.batch([
    env.DB.prepare(`${SESSION_LIST_SQL}${w} ORDER BY s.started_at DESC LIMIT ? OFFSET ?`).bind(...args, limit, offset),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM exam_sessions s JOIN patients p ON p.id = s.patient_id${w}`).bind(...args),
  ]);
  return { data: rows.results, total: total.results[0].n, page, limit };
}

async function sessionDetail(env, code) {
  const s = await getSession(env, code);
  const [patient, doctor, nurse, device, telemetry, analysis] = await env.DB.batch([
    env.DB.prepare(`SELECT *, ${AGE_SQL('birth_date')} AS age FROM patients WHERE id = ?`).bind(s.patient_id),
    env.DB.prepare('SELECT d.*, sp.name AS subspecialty_name FROM doctors d LEFT JOIN subspecialties sp ON sp.code = d.subspecialty_code WHERE d.id = ?').bind(s.doctor_id),
    env.DB.prepare('SELECT n.*, u.name AS unit_name FROM nurses n LEFT JOIN units u ON u.id = n.unit_id WHERE n.id = ?').bind(s.nurse_id),
    env.DB.prepare('SELECT * FROM devices WHERE id = ?').bind(s.device_id),
    env.DB.prepare('SELECT * FROM telemetry WHERE session_id = ? ORDER BY recorded_at DESC LIMIT 1').bind(s.id),
    env.DB.prepare('SELECT * FROM ai_analyses WHERE session_id = ? ORDER BY created_at DESC LIMIT 1').bind(s.id),
  ]);
  const p = patient.results[0];
  const endsAt = s.started_at + s.target_duration_hours * 3600000;
  return {
    ...s,
    ends_at: endsAt,
    remaining_ms: s.status === 'running' ? Math.max(0, endsAt - Date.now()) : 0,
    patient: p,
    doctor: doctor.results[0] || null,
    nurse: nurse.results[0] || null,
    device: device.results[0] || null,
    emergency_contact: p ? { name: p.emergency_contact_name, relation: p.emergency_contact_relation, phone: p.emergency_contact_phone } : null,
    latest_telemetry: telemetry.results[0] || null,
    latest_analysis: parseAnalysis(analysis.results[0]) || null,
  };
}

async function createSession(env, user, input) {
  if (user && user.role === 'nurse' && !input.nurse_id) input = { ...input, nurse_id: user.nurse_id }; // the nurse doing the intake
  const data = clean(input, SESSION_FIELDS, SESSION_REQUIRED, false);
  const [patient, doctor, nurse, device, running] = await env.DB.batch([
    env.DB.prepare('SELECT id, status FROM patients WHERE id = ?').bind(data.patient_id),
    env.DB.prepare('SELECT id, status FROM doctors WHERE id = ?').bind(data.doctor_id),
    env.DB.prepare('SELECT id, status FROM nurses WHERE id = ?').bind(data.nurse_id ?? 0),
    env.DB.prepare('SELECT id, status FROM devices WHERE id = ?').bind(data.device_id ?? 0),
    env.DB.prepare("SELECT code FROM exam_sessions WHERE patient_id = ? AND status = 'running' LIMIT 1").bind(data.patient_id),
  ]);
  const errors = {};
  const p = patient.results[0], d = doctor.results[0], n = nurse.results[0], v = device.results[0];
  if (!p) errors.patient_id = 'not found'; else if (p.status !== 'active') errors.patient_id = 'patient is inactive';
  if (!d) errors.doctor_id = 'not found'; else if (d.status !== 'active') errors.doctor_id = 'doctor is not active';
  if (data.nurse_id && !n) errors.nurse_id = 'not found'; else if (n && n.status !== 'active') errors.nurse_id = 'nurse is not active';
  if (data.device_id && !v) errors.device_id = 'not found'; else if (v && v.status !== 'available') errors.device_id = `device is ${v.status}`;
  if (Object.keys(errors).length) throw bad('Some fields are not valid', errors);
  if (running.results[0]) throw conflict(`Patient already has a running session (#${running.results[0].code})`);

  const now = Date.now();
  const row = { ...data, code: [...randomBytes(4)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 7),
    started_at: data.started_at ?? now, status: 'running', created_by: user ? user.id : null, created_at: now, updated_at: now };
  if (row.filter_low_hz != null && row.filter_high_hz != null && row.filter_low_hz >= row.filter_high_hz) throw bad('filter_low_hz must be below filter_high_hz');
  const cols = Object.keys(row).filter((c) => row[c] !== undefined && row[c] !== null);
  const stmts = [env.DB.prepare(`INSERT INTO exam_sessions (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map((c) => row[c]))];
  if (row.device_id) stmts.push(env.DB.prepare("UPDATE devices SET status = 'in_use', updated_at = ? WHERE id = ?").bind(now, row.device_id));
  try { await env.DB.batch(stmts); } catch (e) {
    if (/exam_sessions\.device_id|exam_sessions_device_running/.test(String(e.message))) throw conflict('Device is already recording another session');
    throw dbError(e) || e;
  }
  return sessionDetail(env, row.code);
}

async function updateSession(env, code, input) {
  const s = await getSession(env, code);
  const editable = Object.fromEntries(SESSION_EDITABLE.map((k) => [k, SESSION_FIELDS[k]]));
  const extra = Object.keys(input).filter((k) => !(k in editable));
  if (extra.length) throw bad(`These fields cannot be changed after the session starts: ${extra.join(', ')}`);
  const data = clean(input, editable, ['clinical_indication'], true);
  if (!Object.keys(data).length) throw bad('Nothing to update');
  data.updated_at = Date.now();
  const cols = Object.keys(data);
  try { await env.DB.prepare(`UPDATE exam_sessions SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map((c) => data[c]), s.id).run(); }
  catch (e) { throw dbError(e) || e; }
  return sessionDetail(env, s.code);
}

// "Tandai Selesai", "Arsip", "Hapus" — one session or many (the list's bulk bar).
function sessionAction(env, s, action, now) {
  const free = s.device_id ? [env.DB.prepare("UPDATE devices SET status = 'available', updated_at = ? WHERE id = ? AND status = 'in_use'").bind(now, s.device_id)] : [];
  switch (action) {
    case 'complete':
      if (s.status !== 'running') return [];
      return [env.DB.prepare("UPDATE exam_sessions SET status = 'completed', ended_at = ?, updated_at = ? WHERE id = ?").bind(Math.max(now, s.started_at), now, s.id), ...free];
    case 'archive': // archiving a running session also completes it
      return [env.DB.prepare("UPDATE exam_sessions SET status = 'completed', ended_at = COALESCE(ended_at, ?), archived_at = COALESCE(archived_at, ?), updated_at = ? WHERE id = ?")
        .bind(Math.max(now, s.started_at), now, now, s.id), ...(s.status === 'running' ? free : [])];
    case 'unarchive':
      return [env.DB.prepare('UPDATE exam_sessions SET archived_at = NULL, updated_at = ? WHERE id = ?').bind(now, s.id)];
    case 'delete': // permanent; telemetry, ECG, notes and AI runs go with it (ON DELETE CASCADE)
      return [...(s.status === 'running' ? free : []), env.DB.prepare('DELETE FROM exam_sessions WHERE id = ?').bind(s.id)];
    default: throw bad('action must be complete, archive, unarchive or delete');
  }
}

const SESSION_ACTION_PERM = { complete: 'sessions.complete', archive: 'sessions.archive', unarchive: 'sessions.archive', delete: 'sessions.delete' };

async function bulkSessions(env, input, user) {
  const codes = Array.isArray(input.codes) ? [...new Set(input.codes.map((c) => String(c).replace(/^#/, '')))] : [];
  if (!codes.length || codes.length > 200) throw bad('codes must be a list of 1-200 session codes');
  if (!SESSION_ACTION_PERM[input.action]) throw bad('action must be complete, archive, unarchive or delete');
  if (!can(user, SESSION_ACTION_PERM[input.action])) throw forbidden();
  let { results } = await env.DB.prepare(`SELECT * FROM exam_sessions WHERE code IN (${codes.map(() => '?').join(',')})`).bind(...codes).all();
  if (sessionScope(user) === 'own') results = results.filter((s) => s.doctor_id === user.doctor_id);
  else if (sessionScope(user) === 'none') results = [];
  const now = Date.now();
  const stmts = results.flatMap((s) => sessionAction(env, s, input.action, now));
  if (stmts.length) await env.DB.batch(stmts);
  const found = new Set(results.map((s) => s.code));
  return { action: input.action, done: [...found], not_found: codes.filter((c) => !found.has(c)) };
}

// ─── telemetry, ECG, notes, AI ────────────────────────────────────────────────
const TELEMETRY_FIELDS = {
  recorded_at: { type: 'int', min: 0 }, bpm: { type: 'int', min: 0, maxv: 400 }, rhythm: { type: 'text', max: 100 },
  pr_ms: { type: 'int', min: 0, maxv: 2000 }, qrs_ms: { type: 'int', min: 0, maxv: 2000 },
  battery_pct: { type: 'int', min: 0, maxv: 100 }, battery_hours_left: { type: 'num', min: 0 },
  signal_quality_pct: { type: 'num', min: 0, maxv: 100 }, rssi_dbm: { type: 'int', min: -150, maxv: 0 },
  packet_loss_pct: { type: 'num', min: 0, maxv: 100 }, electrode_ok: { type: 'bool' },
};

async function addTelemetry(env, code, input) {
  const s = await getSession(env, code);
  if (s.status !== 'running') throw conflict('Session is not running');
  const list = Array.isArray(input.readings) ? input.readings : [input];
  if (!list.length || list.length > 500) throw bad('Send 1-500 readings');
  const now = Date.now();
  const rows = list.map((r) => ({ ...clean(r, TELEMETRY_FIELDS, [], false), recorded_at: r.recorded_at ? Number(r.recorded_at) : now }));
  const stmts = rows.map((r) => {
    const cols = Object.keys(r);
    return env.DB.prepare(`INSERT INTO telemetry (session_id,${cols.join(',')}) VALUES (?,${cols.map(() => '?').join(',')})`).bind(s.id, ...cols.map((c) => r[c]));
  });
  const last = rows.reduce((a, b) => (b.recorded_at >= a.recorded_at ? b : a));
  if (!s.last_seen_at || last.recorded_at >= s.last_seen_at)
    stmts.push(env.DB.prepare('UPDATE exam_sessions SET last_bpm = COALESCE(?, last_bpm), last_rhythm = COALESCE(?, last_rhythm), last_seen_at = ? WHERE id = ?')
      .bind(last.bpm ?? null, last.rhythm ?? null, last.recorded_at, s.id));
  await env.DB.batch(stmts);
  return { stored: rows.length, live: { type: 'live', telemetry: last } };
}

async function listTelemetry(env, code, url) {
  const s = await getSession(env, code);
  const since = Number(url.searchParams.get('since') || 0);
  const limit = Math.min(Number(url.searchParams.get('limit') || 60) || 60, 1000);
  const { results } = await env.DB.prepare('SELECT * FROM telemetry WHERE session_id = ? AND recorded_at > ? ORDER BY recorded_at DESC LIMIT ?').bind(s.id, since, limit).all();
  return { data: results.reverse() };
}

// Samples: int16 little-endian. Accepts { samples: [int, ...] } or { samples_b64 }.
async function addEcg(env, code, input) {
  const s = await getSession(env, code);
  if (s.status !== 'running') throw conflict('Session is not running');
  const startedAt = Number(input.started_at);
  if (!Number.isFinite(startedAt) || startedAt <= 0) throw bad('started_at is required', { started_at: 'required' });
  let bytes;
  if (Array.isArray(input.samples)) {
    if (!input.samples.length || input.samples.length > 60000) throw bad('samples must have 1-60000 values');
    const arr = new Int16Array(input.samples.map((x) => Math.max(-32768, Math.min(32767, Math.round(Number(x) || 0)))));
    bytes = new Uint8Array(arr.buffer);
  } else if (typeof input.samples_b64 === 'string') {
    try { bytes = unb64(input.samples_b64); } catch { throw bad('samples_b64 is not base64'); }
    if (!bytes.length || bytes.length % 2 || bytes.length > 120000) throw bad('samples_b64 must hold 1-60000 int16 values');
  } else throw bad('Send samples (array) or samples_b64');
  const lead = String(input.lead || s.lead).slice(0, 10);
  try {
    await env.DB.prepare('INSERT INTO ecg_chunks (session_id, lead, started_at, sample_count, samples) VALUES (?,?,?,?,?)')
      .bind(s.id, lead, startedAt, bytes.length / 2, bytes).run();
  } catch (e) {
    if (/UNIQUE/.test(String(e.message))) return { stored: 0, duplicate: true }; // device re-sent a chunk after a blackout
    throw e;
  }
  const u8 = Uint8Array.from(bytes);
  return { stored: bytes.length / 2, live: { type: 'live', ecg: { started_at: startedAt, hz: s.sampling_hz, lead, samples: Array.from(new Int16Array(u8.buffer)) } } };
}

// Compatibility with the Android app of the older EKG system (the APK cannot be changed): same path, body and reply as
// ekg's POST /api/sessions/:session_id/data. Open (the APK sends no key), so it only accepts a RUNNING session and caps the size.
//   body { bpm: 72, ecg_waveform: [512, 514, ...] | "512,514,..." | "[512,514,...]" }  ->  201 { message: 'Data saved successfully', id }
// The chunk is taken to END now: its samples are placed backwards at the session's sampling rate.
async function addLegacyData(env, code, input) {
  const s = await getSession(env, code);
  if (s.status !== 'running') throw conflict('Session is not running');
  let w = input.ecg_waveform;
  if (typeof w === 'string') { try { w = JSON.parse(w); } catch { w = w.split(',').map(Number); } }
  if (!Array.isArray(w) || !w.length || w.length > 20000) throw bad('ecg_waveform must hold 1-20000 samples', { ecg_waveform: 'required' });
  const nums = w.map(Number);
  if (nums.some((x) => !Number.isFinite(x))) throw bad('ecg_waveform must be numbers', { ecg_waveform: 'numbers only' });
  const bpm = input.bpm === undefined || input.bpm === null || input.bpm === '' ? null : Math.round(Number(input.bpm));
  if (bpm !== null && !(bpm >= 0 && bpm <= 400)) throw bad('bpm must be 0-400', { bpm: '0-400' });
  const now = Date.now();
  let startedAt = Math.round(now - (nums.length / s.sampling_hz) * 1000);
  // Arrival times jitter, so placing every chunk by its arrival leaves little gaps/overlaps that break the trace. When the chunk
  // follows the previous one closely (within 2 s), continue exactly where the previous one ended.
  const prev = await env.DB.prepare('SELECT started_at, sample_count FROM ecg_chunks WHERE session_id = ? AND lead = ? ORDER BY started_at DESC LIMIT 1').bind(s.id, s.lead).first();
  if (prev) {
    const prevEnd = Math.round(prev.started_at + (prev.sample_count / s.sampling_hz) * 1000);
    if (Math.abs(startedAt - prevEnd) <= 2000) startedAt = prevEnd;
  }
  const arr = new Int16Array(nums.map((x) => Math.max(-32768, Math.min(32767, Math.round(x)))));
  const stmts = [env.DB.prepare('INSERT OR IGNORE INTO ecg_chunks (session_id, lead, started_at, sample_count, samples) VALUES (?,?,?,?,?)').bind(s.id, s.lead, startedAt, arr.length, new Uint8Array(arr.buffer))];
  if (bpm !== null) {
    stmts.push(env.DB.prepare('INSERT INTO telemetry (session_id, recorded_at, bpm) VALUES (?,?,?)').bind(s.id, now, bpm));
    stmts.push(env.DB.prepare('UPDATE exam_sessions SET last_bpm = ?, last_seen_at = ? WHERE id = ?').bind(bpm, now, s.id));
  } else stmts.push(env.DB.prepare('UPDATE exam_sessions SET last_seen_at = ? WHERE id = ?').bind(now, s.id));
  const res = await env.DB.batch(stmts);
  const live = { type: 'live', ecg: { started_at: startedAt, hz: s.sampling_hz, lead: s.lead, samples: Array.from(arr) }, ...(bpm !== null ? { telemetry: { recorded_at: now, bpm } } : {}) };
  return { message: 'Data saved successfully', id: res[0].meta.last_row_id, live };
}

async function getEcg(env, code, url) {
  const s = await getSession(env, code);
  const lead = url.searchParams.get('lead') || s.lead;
  const to = Number(url.searchParams.get('to') || Date.now());
  const from = Number(url.searchParams.get('from') || to - 10000); // default: the last 10 s, like the strip
  if (!(to > from) || to - from > 10 * 60000) throw bad('from/to must span 0-10 minutes');
  const { results } = await env.DB.prepare(
    'SELECT started_at, sample_count, samples FROM ecg_chunks WHERE session_id = ? AND lead = ? AND started_at < ? AND started_at >= ? ORDER BY started_at LIMIT 600'
  ).bind(s.id, lead, to, from - 60000).all();
  const hz = s.sampling_hz;
  const chunks = results
    .filter((c) => c.started_at + (c.sample_count / hz) * 1000 > from)
    .map((c) => {
      const u8 = c.samples instanceof ArrayBuffer ? new Uint8Array(c.samples) : Uint8Array.from(c.samples);
      return { started_at: c.started_at, samples: Array.from(new Int16Array(u8.buffer, u8.byteOffset, u8.byteLength / 2)) };
    });
  return { lead, sampling_hz: hz, from, to, chunks };
}

const NOTE_FIELDS = {
  author_role: { type: 'enum', values: ['patient', 'doctor', 'nurse', 'admin', 'system'] },
  kind: { type: 'enum', values: ['note', 'symptom', 'instruction', 'intake'] },
  body: { type: 'text', max: 4000 }, bpm_at_event: { type: 'int', min: 0, maxv: 400 }, occurred_at: { type: 'int', min: 0 },
  doctor_id: { type: 'int', min: 1 }, nurse_id: { type: 'int', min: 1 },
};
const NOTE_SELECT = `
  SELECT sn.*, CASE sn.author_role
           WHEN 'patient' THEN p.full_name WHEN 'doctor' THEN d.full_name WHEN 'nurse' THEN n.full_name
           WHEN 'admin' THEN u.name ELSE 'Sistem' END AS author_name
  FROM session_notes sn
  JOIN exam_sessions s ON s.id = sn.session_id
  JOIN patients p ON p.id = s.patient_id
  LEFT JOIN doctors d ON d.id = sn.doctor_id
  LEFT JOIN nurses n ON n.id = sn.nurse_id
  LEFT JOIN users u ON u.id = sn.user_id`;

async function listNotes(env, code, url) {
  const s = await getSession(env, code);
  const before = Number(url.searchParams.get('before') || 8.64e15); // "Memuat catatan riwayat sebelumnya": pass the oldest occurred_at
  const limit = Math.min(Number(url.searchParams.get('limit') || 20) || 20, 100);
  const { results } = await env.DB.prepare(`${NOTE_SELECT} WHERE sn.session_id = ? AND sn.occurred_at < ? ORDER BY sn.occurred_at DESC, sn.id DESC LIMIT ?`)
    .bind(s.id, before, limit + 1).all();
  return { data: results.slice(0, limit), has_more: results.length > limit };
}

async function addNote(env, code, input, auth) {
  const s = await getSession(env, code);
  // the author is whoever is logged in: a doctor writes as DOKTER DPJP, a nurse as PERAWAT
  const role = auth.user ? auth.user.role : null;
  if (!input.author_role) input = { ...input, author_role: auth.device ? 'patient' : role };
  const data = clean(input, NOTE_FIELDS, ['author_role', 'body'], false);
  if (auth.device && !['patient', 'system'].includes(data.author_role)) throw forbidden('Devices can only add patient or system notes');
  if (role === 'doctor' || role === 'nurse') {
    if (data.author_role !== role) throw forbidden(`You can only write notes as ${role}`);
    if (role === 'doctor') { data.doctor_id = auth.user.doctor_id; data.nurse_id = null; }
    else { data.nurse_id = auth.user.nurse_id; data.doctor_id = null; }
  }
  if (data.author_role === 'doctor') data.doctor_id = data.doctor_id || s.doctor_id;
  if (data.author_role === 'nurse') { data.nurse_id = data.nurse_id || s.nurse_id; if (!data.nurse_id) throw bad('nurse_id is required', { nurse_id: 'required' }); }
  const now = Date.now();
  const row = { session_id: s.id, kind: 'note', ...data, user_id: auth.user ? auth.user.id : null, occurred_at: data.occurred_at || now, created_at: now };
  const cols = Object.keys(row).filter((c) => row[c] !== undefined);
  let id;
  try { id = (await env.DB.prepare(`INSERT INTO session_notes (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map((c) => row[c])).run()).meta.last_row_id; }
  catch (e) { throw dbError(e) || e; }
  return env.DB.prepare(`${NOTE_SELECT} WHERE sn.id = ?`).bind(id).first();
}

function parseAnalysis(a) {
  if (!a) return a;
  let findings = null; try { findings = a.findings ? JSON.parse(a.findings) : null; } catch { findings = a.findings; }
  return { ...a, findings };
}

async function startAnalysis(env, code, input, user) {
  const s = await getSession(env, code);
  const busy = await env.DB.prepare("SELECT id FROM ai_analyses WHERE session_id = ? AND status IN ('queued','running') LIMIT 1").bind(s.id).first();
  if (busy) throw conflict(`An analysis is already in progress (id ${busy.id})`);
  const data = clean(input, { range_start: { type: 'int', min: 0 }, range_end: { type: 'int', min: 0 } }, [], false);
  const now = Date.now();
  const r = await env.DB.prepare('INSERT INTO ai_analyses (session_id, model_version, status, range_start, range_end, requested_by, created_at) VALUES (?,?,?,?,?,?,?)')
    .bind(s.id, env.AI_MODEL_VERSION || 'v2.4', 'queued', data.range_start ?? null, data.range_end ?? null, user ? user.id : null, now).run();
  // The analysis itself runs in the ML engine (ekg/ml_engine). It picks up 'queued' rows and reports back with PATCH /analyses/:id.
  return parseAnalysis(await env.DB.prepare('SELECT * FROM ai_analyses WHERE id = ?').bind(r.meta.last_row_id).first());
}

async function updateAnalysis(env, id, input) {
  const a = await env.DB.prepare('SELECT * FROM ai_analyses WHERE id = ?').bind(id).first();
  if (!a) throw notFound('Analysis');
  const data = clean(input, { status: { type: 'enum', values: ['queued', 'running', 'done', 'failed'] }, summary: { type: 'text', max: 4000 }, error: { type: 'text', max: 2000 } }, [], true);
  if ('findings' in input) data.findings = input.findings == null ? null : JSON.stringify(input.findings).slice(0, 200000);
  if (data.status === 'done' || data.status === 'failed') data.finished_at = Date.now();
  if (!Object.keys(data).length) throw bad('Nothing to update');
  const cols = Object.keys(data);
  await env.DB.prepare(`UPDATE ai_analyses SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map((c) => data[c]), a.id).run();
  return parseAnalysis(await env.DB.prepare('SELECT * FROM ai_analyses WHERE id = ?').bind(a.id).first());
}

// ─── auth & roles ─────────────────────────────────────────────────────────────
// Roles: admin, doctor (dokter), nurse (perawat). Doctors only see sessions where they are the DPJP.
const ROLES = ['admin', 'doctor', 'nurse'];
const ROLE_ALIASES = { admin: 'admin', doctor: 'doctor', dokter: 'doctor', nurse: 'nurse', perawat: 'nurse' };
const ROLE_LABELS = { admin: 'Admin', doctor: 'Dokter', nurse: 'Perawat' };
// What a login may do comes from its group (Konfigurasi > Grup / Izin) plus per-user allow/deny overrides.
// Defaults are seeded by db/schema.sql: Admin = everything, Dokter = dashboard + own sessions, Perawat = dashboard + all sessions + create.
const PERMISSION_CATALOG = [
  { code: 'dashboard.view', label: 'Melihat Dashboard', group: 'Dashboard' },
  { code: 'sessions.read_own', label: 'Melihat sesi yang ditugaskan kepadanya (DPJP)', group: 'Sesi Pemeriksaan' },
  { code: 'sessions.read_all', label: 'Melihat semua sesi', group: 'Sesi Pemeriksaan' },
  { code: 'sessions.create', label: 'Membuat sesi', group: 'Sesi Pemeriksaan' },
  { code: 'sessions.edit', label: 'Mengubah sesi', group: 'Sesi Pemeriksaan' },
  { code: 'sessions.complete', label: 'Menyelesaikan sesi', group: 'Sesi Pemeriksaan' },
  { code: 'sessions.archive', label: 'Mengarsipkan / memulihkan sesi', group: 'Sesi Pemeriksaan' },
  { code: 'sessions.delete', label: 'Menghapus sesi', group: 'Sesi Pemeriksaan' },
  { code: 'notes.write', label: 'Menulis catatan sesi', group: 'Sesi Pemeriksaan' },
  { code: 'ai.run', label: 'Menjalankan analisis AI', group: 'Sesi Pemeriksaan' },
  { code: 'patients.read', label: 'Melihat data pasien', group: 'Master Data' },
  { code: 'patients.write', label: 'Menambah / mengubah pasien', group: 'Master Data' },
  { code: 'master.read', label: 'Melihat data dokter, perawat, dan perangkat', group: 'Master Data' },
  { code: 'master.write', label: 'Menambah / mengubah / menghapus master data', group: 'Master Data' },
  { code: 'users.manage', label: 'Mengelola akun login dan kata sandi', group: 'Konfigurasi' },
  { code: 'config.manage', label: 'Mengelola grup dan izin', group: 'Konfigurasi' },
];
const ALL_PERMISSIONS = PERMISSION_CATALOG.map((p) => p.code);
const can = (user, perm) => !!user && Array.isArray(user.permissions) && user.permissions.includes(perm);
// 'all' = any session, 'own' = only sessions where the user is the DPJP, 'none'
const sessionScope = (user) => (can(user, 'sessions.read_all') ? 'all' : can(user, 'sessions.read_own') ? 'own' : 'none');

async function loadAccess(env, user) {
  const gid = '(SELECT id FROM user_groups WHERE id = ? OR (? IS NULL AND code = ?))';
  const [g, gp, up] = await env.DB.batch([
    env.DB.prepare(`SELECT * FROM user_groups WHERE id = ${gid}`).bind(user.group_id ?? null, user.group_id ?? null, user.role),
    env.DB.prepare(`SELECT permission FROM group_permissions WHERE group_id = ${gid}`).bind(user.group_id ?? null, user.group_id ?? null, user.role),
    env.DB.prepare('SELECT permission, effect FROM user_permissions WHERE user_id = ?').bind(user.id),
  ]);
  const group = g.results[0] || null;
  const set = new Set(group && group.code === 'admin' ? ALL_PERMISSIONS : gp.results.map((r) => r.permission));
  if (!group || group.code !== 'admin') for (const o of up.results) { if (o.effect === 'allow') set.add(o.permission); else set.delete(o.permission); }
  return { group, overrides: up.results, permissions: ALL_PERMISSIONS.filter((c) => set.has(c)) };
}
const forbidden = (msg = 'Your role cannot do this') => new HttpError(403, 'forbidden', msg);

// A doctor/nurse login only works while its profile exists and is not inactive (a doctor on leave can still log in).
const ACTIVE_USER_SQL = `u.is_active = 1
  AND (u.role <> 'doctor' OR EXISTS (SELECT 1 FROM doctors d WHERE d.id = u.doctor_id AND d.status <> 'inactive'))
  AND (u.role <> 'nurse'  OR EXISTS (SELECT 1 FROM nurses  n WHERE n.id = u.nurse_id  AND n.status = 'active'))`;

const publicUser = (u) => u && {
  id: u.id, name: u.name, email: u.email, role: u.role, role_label: ROLE_LABELS[u.role], language: u.language,
  doctor_id: u.doctor_id, nurse_id: u.nurse_id, doctor_name: u.doctor_name, nurse_name: u.nurse_name, group_id: u.group_id, group_name: u.group_name,
  is_active: !!u.is_active, last_login_at: u.last_login_at, created_at: u.created_at,
};

async function me(env, user) {
  if (!user.permissions) { const a = await loadAccess(env, user); user = { ...user, permissions: a.permissions, group_id: a.group && a.group.id, group_name: a.group && a.group.name }; }
  const profile = user.role === 'doctor'
    ? await env.DB.prepare('SELECT d.*, sp.name AS subspecialty_name FROM doctors d LEFT JOIN subspecialties sp ON sp.code = d.subspecialty_code WHERE d.id = ?').bind(user.doctor_id).first()
    : user.role === 'nurse'
      ? await env.DB.prepare('SELECT n.*, u.name AS unit_name FROM nurses n LEFT JOIN units u ON u.id = n.unit_id WHERE n.id = ?').bind(user.nurse_id).first()
      : null;
  return { ...publicUser(user), profile, permissions: user.permissions, session_scope: sessionScope(user) };
}

// ─── user accounts (admin only) ───────────────────────────────────────────────
const USER_SELECT = `SELECT u.*, d.full_name AS doctor_name, n.full_name AS nurse_name, g.name AS group_name FROM users u
  LEFT JOIN doctors d ON d.id = u.doctor_id LEFT JOIN nurses n ON n.id = u.nurse_id LEFT JOIN user_groups g ON g.id = COALESCE(u.group_id, (SELECT id FROM user_groups WHERE code = u.role))`;
const USER_FIELDS = {
  name: { type: 'text', max: 100 }, email: { type: 'email' }, role: { type: 'enum', values: ROLES },
  doctor_id: { type: 'int', min: 1 }, nurse_id: { type: 'int', min: 1 }, group_id: { type: 'int', min: 1 }, language: { type: 'enum', values: ['id', 'en'] }, is_active: { type: 'bool' },
};

async function findUser(env, id) {
  const u = await env.DB.prepare(`${USER_SELECT} WHERE u.id = ?`).bind(id).first();
  if (!u) throw notFound('User');
  return u;
}

async function listUsers(env, url) {
  const { limit, page, offset } = paging(url);
  const where = []; const args = [];
  const q = (url.searchParams.get('q') || '').trim();
  if (q) { where.push("(u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR d.full_name LIKE ? ESCAPE '\\' OR n.full_name LIKE ? ESCAPE '\\')"); args.push(like(q), like(q), like(q), like(q)); }
  const roles = url.searchParams.getAll('role').flatMap((v) => v.split(',')).map((r) => ROLE_ALIASES[r]).filter(Boolean);
  if (roles.length) { where.push(`u.role IN (${roles.map(() => '?').join(',')})`); args.push(...roles); }
  const groupId = url.searchParams.get('group_id');
  if (groupId) { where.push('COALESCE(u.group_id, (SELECT id FROM user_groups WHERE code = u.role)) = ?'); args.push(+groupId); }
  const active = url.searchParams.get('active');
  if (active === '1' || active === '0') { where.push('u.is_active = ?'); args.push(+active); }
  const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const [rows, total] = await env.DB.batch([
    env.DB.prepare(`${USER_SELECT}${w} ORDER BY u.name LIMIT ? OFFSET ?`).bind(...args, limit, offset),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM users u LEFT JOIN doctors d ON d.id = u.doctor_id LEFT JOIN nurses n ON n.id = u.nurse_id${w}`).bind(...args),
  ]);
  return { data: rows.results.map(publicUser), total: total.results[0].n, page, limit };
}

// role <-> profile: a doctor login needs doctor_id, a nurse login nurse_id, an admin neither.
async function checkUserLink(env, u) {
  const errors = {};
  if (u.role === 'doctor') {
    if (!u.doctor_id) errors.doctor_id = 'required for a doctor login';
    else if (!(await env.DB.prepare('SELECT 1 FROM doctors WHERE id = ?').bind(u.doctor_id).first())) errors.doctor_id = 'not found';
  }
  if (u.role === 'nurse') {
    if (!u.nurse_id) errors.nurse_id = 'required for a nurse login';
    else if (!(await env.DB.prepare('SELECT 1 FROM nurses WHERE id = ?').bind(u.nurse_id).first())) errors.nurse_id = 'not found';
  }
  if (Object.keys(errors).length) throw bad('Some fields are not valid', errors);
  if (u.role !== 'doctor') u.doctor_id = null;
  if (u.role !== 'nurse') u.nurse_id = null;
}

async function checkGroup(env, data) {
  if (data.group_id && !(await env.DB.prepare('SELECT 1 FROM user_groups WHERE id = ?').bind(data.group_id).first())) throw bad('Some fields are not valid', { group_id: 'not found' });
}

function passwordFrom(input) {
  if (input.password === undefined || input.password === null || input.password === '') return { password: b64url(randomBytes(12)), generated: true };
  const p = String(input.password);
  if (p.length < 10 || p.length > 200) throw bad('password must be 10-200 characters', { password: '10-200 characters' });
  return { password: p, generated: false };
}

async function createUser(env, input) {
  if (input.role) input = { ...input, role: ROLE_ALIASES[String(input.role).toLowerCase()] || input.role };
  const data = clean(input, USER_FIELDS, ['name', 'email', 'role'], false);
  await checkUserLink(env, data);
  await checkGroup(env, data);
  const { password, generated } = passwordFrom(input);
  const now = Date.now();
  const row = { ...data, password_hash: await hashPassword(password), created_at: now, updated_at: now };
  const cols = Object.keys(row).filter((c) => row[c] !== undefined);
  let id;
  try { id = (await env.DB.prepare(`INSERT INTO users (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).bind(...cols.map((c) => row[c])).run()).meta.last_row_id; }
  catch (e) {
    if (/users_doctor|users\.doctor_id/.test(String(e.message))) throw conflict('This doctor already has a login');
    if (/users_nurse|users\.nurse_id/.test(String(e.message))) throw conflict('This nurse already has a login');
    throw dbError(e) || e;
  }
  // a generated password is shown once, here, for the admin to hand over
  return { user: publicUser(await findUser(env, id)), ...(generated ? { temporary_password: password } : {}) };
}

// Demo accounts (DEMO_EMAILS in api.jsonc) have public passwords on the demo site. Someone logged in with one cannot
// change their own password or change/delete any login (so one visitor cannot lock the others or the real admin out).
// Only a non-demo admin (e.g. the private one from tools/create_admin.py) manages logins.
const isDemo = (env, email) => String(env.DEMO_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).includes(String(email).toLowerCase());
const demoLocked = () => forbidden('Akun demo tidak dapat diubah');

async function updateUser(env, id, input, actor) {
  if (isDemo(env, actor.email)) throw demoLocked();
  const u = await findUser(env, id);
  if (input.role) input = { ...input, role: ROLE_ALIASES[String(input.role).toLowerCase()] || input.role };
  const { password: _p, reset_password: reset, ...fields } = input;
  const data = clean(fields, USER_FIELDS, ['name', 'email', 'role'], true);
  if (u.id === actor.id && ((data.role && data.role !== 'admin') || data.is_active === 0)) throw conflict('You cannot remove your own admin access');
  await checkGroup(env, data);
  if (u.id === actor.id && 'group_id' in data && data.group_id !== null && !(await isAdminGroup(env, data.group_id))) throw conflict('You cannot remove your own admin access');
  const merged = { role: u.role, doctor_id: u.doctor_id, nurse_id: u.nurse_id, ...data };
  if ('role' in data || 'doctor_id' in data || 'nurse_id' in data) {
    await checkUserLink(env, merged);
    Object.assign(data, { role: merged.role, doctor_id: merged.doctor_id, nurse_id: merged.nurse_id });
  }
  let generated = null;
  if (reset || input.password) {
    const pw = passwordFrom(reset ? {} : input);
    data.password_hash = await hashPassword(pw.password);
    if (pw.generated) generated = pw.password;
  }
  if (!Object.keys(data).length) throw bad('Nothing to update');
  data.updated_at = Date.now();
  const cols = Object.keys(data);
  const stmts = [env.DB.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map((c) => data[c]), u.id)];
  // new password, new role or switched off: log the user out everywhere
  if (data.password_hash || data.is_active === 0 || (data.role && data.role !== u.role)) stmts.push(env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(u.id));
  try { await env.DB.batch(stmts); } catch (e) {
    if (/doctor_id/.test(String(e.message))) throw conflict('This doctor already has a login');
    if (/nurse_id/.test(String(e.message))) throw conflict('This nurse already has a login');
    throw dbError(e) || e;
  }
  return { user: publicUser(await findUser(env, u.id)), ...(generated ? { temporary_password: generated } : {}) };
}

const isAdminGroup = async (env, id) => !!(await env.DB.prepare("SELECT 1 FROM user_groups WHERE id = ? AND code = 'admin'").bind(id).first());

async function deleteUser(env, id, actor) {
  if (isDemo(env, actor.email)) throw demoLocked();
  const u = await findUser(env, id);
  if (u.id === actor.id) throw conflict('You cannot delete your own login');
  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(u.id).run();
  return { deleted: true };
}

// ─── Konfigurasi: groups, permissions, per-user overrides (config.manage) ─────
const GROUP_FIELDS = { name: { type: 'text', max: 60 }, description: { type: 'text', max: 200 } };
const slug = (t) => String(t).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'grup';
const cleanPerms = (list) => {
  if (!Array.isArray(list)) throw bad('permissions must be a list');
  const badOnes = list.filter((c) => !ALL_PERMISSIONS.includes(c));
  if (badOnes.length) throw bad('Unknown permission: ' + badOnes.join(', '), { permissions: 'unknown' });
  return [...new Set(list)];
};

async function listGroups(env) {
  const [g, p, m] = await env.DB.batch([
    env.DB.prepare('SELECT * FROM user_groups ORDER BY is_system DESC, id'),
    env.DB.prepare('SELECT group_id, permission FROM group_permissions'),
    env.DB.prepare("SELECT COALESCE(u.group_id, (SELECT id FROM user_groups WHERE code = u.role)) AS group_id, COUNT(*) AS n FROM users u GROUP BY 1"),
  ]);
  return g.results.map((x) => ({
    id: x.id, code: x.code, name: x.name, description: x.description, is_system: !!x.is_system, locked: x.code === 'admin',
    permissions: x.code === 'admin' ? ALL_PERMISSIONS : p.results.filter((r) => r.group_id === x.id).map((r) => r.permission),
    members: (m.results.find((r) => r.group_id === x.id) || {}).n || 0,
  }));
}
async function getGroup(env, id) {
  const g = (await listGroups(env)).find((x) => x.id === +id);
  if (!g) throw notFound('Group');
  return g;
}
async function saveGroup(env, id, input, actor) {
  if (isDemo(env, actor.email)) throw demoLocked();
  const data = clean(input, GROUP_FIELDS, id ? [] : ['name'], !!id);
  const perms = input.permissions !== undefined ? cleanPerms(input.permissions) : null;
  let gid = id ? +id : null;
  if (id) {
    const g = await getGroup(env, id);
    if (g.locked && perms) throw conflict('Grup Admin selalu memiliki semua izin');
    const stmts = [];
    if (Object.keys(data).length) stmts.push(env.DB.prepare(`UPDATE user_groups SET ${Object.keys(data).map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...Object.values(data), gid));
    if (perms) stmts.push(env.DB.prepare('DELETE FROM group_permissions WHERE group_id = ?').bind(gid), ...perms.map((c) => env.DB.prepare('INSERT INTO group_permissions (group_id, permission) VALUES (?,?)').bind(gid, c)));
    if (!stmts.length) throw bad('Nothing to update');
    await env.DB.batch(stmts);
  } else {
    let code = slug(data.name);
    for (let i = 2; await env.DB.prepare('SELECT 1 FROM user_groups WHERE code = ?').bind(code).first(); i++) code = `${slug(data.name)}-${i}`;
    gid = (await env.DB.prepare('INSERT INTO user_groups (code, name, description, is_system, created_at) VALUES (?,?,?,0,?)').bind(code, data.name, data.description ?? null, Date.now()).run()).meta.last_row_id;
    if (perms && perms.length) await env.DB.batch(perms.map((c) => env.DB.prepare('INSERT INTO group_permissions (group_id, permission) VALUES (?,?)').bind(gid, c)));
  }
  return getGroup(env, gid);
}
async function deleteGroup(env, id, actor) {
  if (isDemo(env, actor.email)) throw demoLocked();
  const g = await getGroup(env, id);
  if (g.is_system) throw conflict('Grup bawaan tidak dapat dihapus');
  if (g.members) throw conflict('Grup masih memiliki anggota; pindahkan mereka ke grup lain dulu');
  await env.DB.prepare('DELETE FROM user_groups WHERE id = ?').bind(g.id).run();
  return { deleted: true };
}

async function getUserAccess(env, id) {
  const u = await findUser(env, id);
  const a = await loadAccess(env, u);
  return { user: publicUser(u), group: a.group && { id: a.group.id, name: a.group.name, code: a.group.code }, overrides: a.overrides, permissions: a.permissions };
}
async function setUserOverrides(env, id, input, actor) {
  if (isDemo(env, actor.email)) throw demoLocked();
  const u = await findUser(env, id);
  const o = input.overrides;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw bad('overrides must be an object like {"sessions.create": "allow", "sessions.delete": "deny"}');
  const rows = Object.entries(o).filter(([, v]) => v === 'allow' || v === 'deny');
  cleanPerms(rows.map(([c]) => c));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM user_permissions WHERE user_id = ?').bind(u.id),
    ...rows.map(([c, v]) => env.DB.prepare('INSERT INTO user_permissions (user_id, permission, effect) VALUES (?,?,?)').bind(u.id, c, v)),
  ]);
  return getUserAccess(env, u.id);
}

// ─── passwords on the Edit Dokter / Perawat / Pasien pages (users.manage) ──────
// Doctors and nurses sign in to the web app through a `users` row (created here when it does not exist yet).
// Patients have no web login: the password is for the patient mobile app (stored in patient_credentials).
const PASSWORD_TARGETS = { doctors: 'doctor', nurses: 'nurse', patients: 'patient' };
async function loginInfo(env, path, key) {
  const m = MASTER[path]; const row = await findMaster(env, m, key); const kind = PASSWORD_TARGETS[path];
  if (kind === 'patient') {
    const c = await env.DB.prepare('SELECT updated_at FROM patient_credentials WHERE patient_id = ?').bind(row.id).first();
    return { kind, has_login: !!c, password_updated_at: c ? c.updated_at : null, email: null };
  }
  const u = await env.DB.prepare(`SELECT id, email, last_login_at, updated_at FROM users WHERE ${kind}_id = ?`).bind(row.id).first();
  return { kind, has_login: !!u, email: u ? u.email : row.email || null, profile_email: row.email || null, last_login_at: u ? u.last_login_at : null, password_updated_at: u ? u.updated_at : null };
}
async function setProfilePassword(env, path, key, input, actor) {
  if (isDemo(env, actor.email)) throw demoLocked();
  const m = MASTER[path]; const row = await findMaster(env, m, key); const kind = PASSWORD_TARGETS[path];
  const { password, generated } = passwordFrom(input);
  const hash = await hashPassword(password); const now = Date.now();
  let created = false;
  if (kind === 'patient') {
    await env.DB.prepare('INSERT INTO patient_credentials (patient_id, password_hash, updated_at) VALUES (?,?,?) ON CONFLICT(patient_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at').bind(row.id, hash, now).run();
  } else {
    const u = await env.DB.prepare(`SELECT id FROM users WHERE ${kind}_id = ?`).bind(row.id).first();
    if (u) {
      await env.DB.batch([
        env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(hash, now, u.id),
        env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(u.id), // logged out everywhere
      ]);
    } else {
      if (!row.email) throw bad('Isi email dulu: akun login dibuat dari email profil', { email: 'required' });
      try {
        await env.DB.prepare(`INSERT INTO users (name, email, password_hash, role, ${kind}_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`).bind(row.full_name, row.email, hash, kind, row.id, now, now).run();
      } catch (e) {
        if (/users\.email|UNIQUE/i.test(String(e.message))) throw conflict('Email ini sudah dipakai akun lain');
        throw dbError(e) || e;
      }
      created = true;
    }
  }
  return { ok: true, created, ...(generated ? { temporary_password: password } : {}) };
}

async function login(env, input) {
  const email = String(input.email || '').trim(); const password = String(input.password || '');
  if (!email || !password) throw bad('email and password are required');
  const u = await env.DB.prepare(`${USER_SELECT} WHERE u.email = ? AND ${ACTIVE_USER_SQL}`).bind(email).first();
  const ok = u ? await verifyPassword(password, u.password_hash) : (await verifyPassword(password, 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$x'), false);
  if (!ok) throw new HttpError(401, 'bad_login', 'Wrong email or password');
  const token = b64url(randomBytes(32)); const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO auth_sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)').bind(await sha256(token), u.id, now, now + TOKEN_TTL),
    env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?').bind(now, u.id),
    env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at < ?').bind(now),
  ]);
  return { token, expires_at: now + TOKEN_TTL, user: await me(env, u) };
}

async function authenticate(env, req) {
  const key = req.headers.get('X-Ingest-Key');
  if (key) {
    if (env.INGEST_TOKEN && safeEqual(key, env.INGEST_TOKEN)) return { device: true };
    throw new HttpError(401, 'unauthorized', 'Wrong ingest key');
  }
  const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)$/i);
  if (!m) return {};
  const hash = await sha256(m[1]);
  const u = await env.DB.prepare(
    `SELECT u.* FROM auth_sessions a JOIN users u ON u.id = a.user_id WHERE a.token_hash = ? AND a.expires_at > ? AND ${ACTIVE_USER_SQL}`
  ).bind(hash, Date.now()).first();
  if (!u) return {};
  const a = await loadAccess(env, u);
  return { user: { ...u, permissions: a.permissions, group_id: a.group ? a.group.id : u.group_id, group_name: a.group && a.group.name }, tokenHash: hash };
}

// ─── live stream (WebSocket) ───────────────────────────────────────────────────
// One SessionHub (Durable Object) per session. Devices / the Simulator open it with role=push and send {bpm, ecg_waveform} frames
// (same body as POST /sessions/:code/data); viewers open it with role=view and receive {type:'live', ecg?, telemetry?} messages for every chunk
// saved, whether it came in through the WebSocket or through REST. REST keeps working as before.
async function hubBroadcast(env, code, msg) {
  if (!env.HUB || !msg) return;
  try { await env.HUB.get(env.HUB.idFromName(code)).fetch('https://hub/broadcast', { method: 'POST', body: JSON.stringify(msg) }); } catch (e) { console.error('hub', e && e.message); }
}
async function withLive(env, code, out) {
  const { live, ...reply } = out;
  await hubBroadcast(env, code, live);
  return reply;
}

async function streamHandler({ env, req, url, p }) {
  if (req.headers.get('Upgrade') !== 'websocket') throw new HttpError(426, 'upgrade_required', 'Open this address as a WebSocket');
  if (!env.HUB) throw new HttpError(503, 'unavailable', 'The live stream is not enabled');
  // a browser cannot set headers on a WebSocket: the login token (or the device key) comes in the query string
  const h = new Headers();
  const key = url.searchParams.get('key'); const token = url.searchParams.get('token');
  if (key) h.set('X-Ingest-Key', key); else if (token) h.set('Authorization', `Bearer ${token}`);
  const auth = await authenticate(env, new Request(url, { headers: h }));
  if (!auth.user && !auth.device) throw new HttpError(401, 'unauthorized', 'Log in first');
  const s = await getSession(env, p.code);
  let role = 'view';
  if (url.searchParams.get('role') === 'push') {
    if (!(auth.device || can(auth.user, 'config.manage'))) throw forbidden();
    role = 'push';
  } else {
    if (!auth.user) throw forbidden('The device key can only push');
    const scope = sessionScope(auth.user);
    if (scope === 'none' || (scope === 'own' && s.doctor_id !== auth.user.doctor_id)) throw notFound('Session');
  }
  const u = new URL(req.url); u.search = ''; u.searchParams.set('role', role); u.searchParams.set('code', s.code);
  return env.HUB.get(env.HUB.idFromName(s.code)).fetch(new Request(u, req));
}

export class SessionHub {
  constructor(state, env) {
    this.state = state; this.env = env;
    try { state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')); } catch { /* older runtime */ }
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/broadcast') { this.broadcast(await req.text()); return new Response('ok'); }
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
    const role = url.searchParams.get('role') === 'push' ? 'push' : 'view';
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.state.acceptWebSocket(server, [role, `code:${url.searchParams.get('code')}`]); // hibernation API: the object can sleep between messages
    return new Response(null, { status: 101, webSocket: client });
  }
  broadcast(text) {
    for (const ws of this.state.getWebSockets('view')) { try { ws.send(text); } catch { /* closed */ } }
  }
  async webSocketMessage(ws, message) {
    const tags = this.state.getTags(ws);
    if (!tags.includes('push')) return; // viewers only listen
    const code = (tags.find((t) => t.startsWith('code:')) || '').slice(5);
    let frame;
    try { frame = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); } catch { ws.send(JSON.stringify({ type: 'error', status: 400, message: 'Send JSON frames' })); return; }
    try {
      const { live, ...reply } = await addLegacyData(this.env, code, frame);
      ws.send(JSON.stringify({ type: 'ack', seq: frame.seq, ...reply }));
      this.broadcast(JSON.stringify(live));
    } catch (e) {
      const err = e instanceof HttpError ? e : dbError(e);
      ws.send(JSON.stringify({ type: 'error', seq: frame && frame.seq, status: err ? err.status : 500, message: err ? err.message : 'Something went wrong' }));
    }
  }
  webSocketClose(ws, code) { try { ws.close(code && code !== 1005 ? code : 1000, 'bye'); } catch { /* already closed */ } }
  webSocketError() { /* the runtime closes it */ }
}

// ─── router ───────────────────────────────────────────────────────────────────
// [method, pattern, handler, access]
//   access: 'public' | 'all' (any logged-in user) | a comma list of permissions, any one is enough | prefixed 'device+' when the X-Ingest-Key may call it too.
// Users with only sessions.read_own (doctors by default) reach sessions where they are the DPJP (checked in route() for every :code).
const ROUTES = [
  ['GET', '/', () => ({ name: 'DETAKITA API', docs: 'ecg/README.md' }), 'public'],
  ['GET', '/health', async ({ env }) => ({ ok: true, db: !!(await env.DB.prepare('SELECT 1 AS x').first()) }), 'public'],
  ['POST', '/auth/login', async ({ env, req }) => login(env, await body(req)), 'public'],
  ['POST', '/auth/logout', async ({ env, auth }) => { await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash = ?').bind(auth.tokenHash).run(); return { ok: true }; }, 'all'],
  ['GET', '/me', ({ env, auth }) => me(env, auth.user), 'all'],
  ['PATCH', '/me', async ({ env, req, auth }) => {
    const input = await body(req);
    const data = clean(input, { name: { type: 'text', max: 100 }, language: { type: 'enum', values: ['id', 'en'] } }, [], true);
    if (input.new_password !== undefined) {
      if (isDemo(env, auth.user.email)) throw demoLocked();
      if (String(input.new_password).length < 10) throw bad('new_password must be at least 10 characters');
      if (!(await verifyPassword(String(input.current_password || ''), auth.user.password_hash))) throw forbidden('current_password is wrong');
      data.password_hash = await hashPassword(String(input.new_password));
    }
    if (!Object.keys(data).length) throw bad('Nothing to update');
    data.updated_at = Date.now();
    const cols = Object.keys(data);
    const stmts = [env.DB.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).bind(...cols.map((c) => data[c]), auth.user.id)];
    if (data.password_hash) stmts.push(env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND token_hash <> ?').bind(auth.user.id, auth.tokenHash)); // other devices log out
    await env.DB.batch(stmts);
    return me(env, await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(auth.user.id).first());
  }, 'all'],

  // user accounts
  ['GET', '/users', ({ env, url }) => listUsers(env, url), 'users.manage,config.manage'],
  ['POST', '/users', async ({ env, req }) => [201, await createUser(env, await body(req))], 'users.manage'],
  ['GET', '/users/:id', async ({ env, p }) => publicUser(await findUser(env, p.id)), 'users.manage,config.manage'],
  ['PATCH', '/users/:id', async ({ env, req, p, auth }) => updateUser(env, p.id, await body(req), auth.user), 'users.manage,config.manage'],
  ['DELETE', '/users/:id', ({ env, p, auth }) => deleteUser(env, p.id, auth.user), 'users.manage'],

  // Konfigurasi: permission catalog, groups, per-user overrides
  ['GET', '/config/permissions', () => ({ data: PERMISSION_CATALOG }), 'config.manage'],
  ['GET', '/groups', async ({ env }) => ({ data: await listGroups(env) }), 'config.manage'],
  ['POST', '/groups', async ({ env, req, auth }) => [201, await saveGroup(env, null, await body(req), auth.user)], 'config.manage'],
  ['GET', '/groups/:id', ({ env, p }) => getGroup(env, p.id), 'config.manage'],
  ['PATCH', '/groups/:id', async ({ env, req, p, auth }) => saveGroup(env, p.id, await body(req), auth.user), 'config.manage'],
  ['DELETE', '/groups/:id', ({ env, p, auth }) => deleteGroup(env, p.id, auth.user), 'config.manage'],
  ['GET', '/users/:id/access', ({ env, p }) => getUserAccess(env, p.id), 'config.manage'],
  ['PUT', '/users/:id/access', async ({ env, req, p, auth }) => setUserOverrides(env, p.id, await body(req), auth.user), 'config.manage'],

  ['GET', '/lookups', async ({ env }) => {
    const [sub, units] = await env.DB.batch([
      env.DB.prepare('SELECT * FROM subspecialties ORDER BY sort_order'), env.DB.prepare('SELECT * FROM units ORDER BY sort_order'),
    ]);
    return {
      subspecialties: sub.results, units: units.results,
      roles: ROLES.map((code) => ({ code, label: ROLE_LABELS[code] })),
      groups: (await env.DB.prepare('SELECT id, code, name FROM user_groups ORDER BY is_system DESC, id').all()).results,
      shifts: [{ code: 'morning', label: 'Pagi', from: '07:00', to: '14:30' }, { code: 'afternoon', label: 'Siang', from: '14:00', to: '21:00' }, { code: 'night', label: 'Malam', from: '20:30', to: '07:30' }],
      target_durations: [24, 48, 72], sync_intervals: [5, 1],
    };
  }, 'all'],
  ['GET', '/stats', async ({ env, auth }) => {
    const own = sessionScope(auth.user) !== 'all';
    const [c, p, d, n] = await env.DB.batch([
      env.DB.prepare(`SELECT SUM(status = 'running' AND archived_at IS NULL) AS running, SUM(status = 'completed' AND archived_at IS NULL) AS completed,
                             SUM(archived_at IS NOT NULL) AS archived FROM exam_sessions ${own ? 'WHERE doctor_id = ?' : ''}`).bind(...(own ? [auth.user.doctor_id ?? -1] : [])),
      env.DB.prepare('SELECT COUNT(*) AS n FROM patients'), env.DB.prepare('SELECT COUNT(*) AS n FROM doctors'), env.DB.prepare('SELECT COUNT(*) AS n FROM nurses'),
    ]);
    const s = c.results[0];
    return { sessions: { running: s.running || 0, completed: s.completed || 0, archived: s.archived || 0 }, patients: p.results[0].n, doctors: d.results[0].n, nurses: n.results[0].n };
  }, 'dashboard.view,sessions.read_own,sessions.read_all'],

  // sessions
  ['GET', '/sessions', ({ env, url, auth }) => listSessions(env, url, auth), 'sessions.read_own,sessions.read_all'],
  ['POST', '/sessions', async ({ env, req, auth }) => [201, await createSession(env, auth.user, await body(req))], 'sessions.create'],
  ['POST', '/sessions/bulk', async ({ env, req, auth }) => bulkSessions(env, await body(req), auth.user), 'sessions.complete,sessions.archive,sessions.delete'],
  ['GET', '/sessions/:code', ({ env, p }) => sessionDetail(env, p.code), 'sessions.read_own,sessions.read_all'],
  ['PATCH', '/sessions/:code', async ({ env, req, p }) => updateSession(env, p.code, await body(req)), 'sessions.edit'],
  ['DELETE', '/sessions/:code', async ({ env, p }) => { const s = await getSession(env, p.code); await env.DB.batch(sessionAction(env, s, 'delete', Date.now())); return { deleted: true }; }, 'sessions.delete'],
  ...[['complete', 'sessions.complete'], ['archive', 'sessions.archive'], ['unarchive', 'sessions.archive']].map(([a, perm]) => ['POST', `/sessions/:code/${a}`, async ({ env, p }) => {
    const s = await getSession(env, p.code);
    if (a === 'complete' && s.status !== 'running') throw conflict('Session is not running');
    const stmts = sessionAction(env, s, a, Date.now()); if (stmts.length) await env.DB.batch(stmts);
    return sessionDetail(env, s.code);
  }, perm]),
  ['GET', '/sessions/:code/telemetry', ({ env, p, url }) => listTelemetry(env, p.code, url), 'sessions.read_own,sessions.read_all'],
  ['POST', '/sessions/:code/telemetry', async ({ env, req, p }) => [201, await withLive(env, p.code, await addTelemetry(env, p.code, await body(req)))], 'device+master.write'],
  ['POST', '/sessions/:code/data', async ({ env, req, p }) => [201, await withLive(env, p.code, await addLegacyData(env, p.code, await body(req)))], 'public'], // the old APK: see addLegacyData
  ['GET', '/sessions/:code/ecg', ({ env, p, url }) => getEcg(env, p.code, url), 'sessions.read_own,sessions.read_all'],
  ['POST', '/sessions/:code/ecg', async ({ env, req, p }) => [201, await withLive(env, p.code, await addEcg(env, p.code, await body(req)))], 'device+master.write'],
  ['GET', '/sessions/:code/stream', (ctx) => streamHandler(ctx), 'public'], // WebSocket upgrade; the token / key is checked inside
  ['GET', '/sessions/:code/notes', ({ env, p, url }) => listNotes(env, p.code, url), 'sessions.read_own,sessions.read_all'],
  ['POST', '/sessions/:code/notes', async ({ env, req, p, auth }) => [201, await addNote(env, p.code, await body(req), auth)], 'device+notes.write'],
  ['GET', '/sessions/:code/analyses', async ({ env, p }) => {
    const s = await getSession(env, p.code);
    const { results } = await env.DB.prepare('SELECT * FROM ai_analyses WHERE session_id = ? ORDER BY created_at DESC LIMIT 50').bind(s.id).all();
    return { data: results.map(parseAnalysis) };
  }, 'sessions.read_own,sessions.read_all'],
  ['POST', '/sessions/:code/analyses', async ({ env, req, p, auth }) => [201, await startAnalysis(env, p.code, (await req.json().catch(() => ({}))) || {}, auth.user)], 'ai.run'],
  ['PATCH', '/analyses/:id', async ({ env, req, p }) => updateAnalysis(env, p.id, await body(req)), 'device+master.write'],

  // master data: /doctors, /nurses, /patients, /devices — read/write follow the permissions (patients.* for patients, master.* for the rest)
  ...Object.entries(MASTER).flatMap(([path, m]) => {
    const [read, write] = path === 'patients' ? ['patients.read', 'patients.write'] : ['master.read', 'master.write'];
    return [
      ['GET', `/${path}`, ({ env, url }) => listMaster(env, m, url), read],
      ['POST', `/${path}`, async ({ env, req }) => [201, await createMaster(env, m, await body(req))], write],
      ['GET', `/${path}/:key`, ({ env, p }) => findMaster(env, m, p.key), read],
      ['PATCH', `/${path}/:key`, async ({ env, req, p }) => updateMaster(env, m, p.key, await body(req)), write],
      ['DELETE', `/${path}/:key`, ({ env, p }) => deleteMaster(env, m, p.key), 'master.write'],
    ];
  }),
  // Kata sandi card on the Edit Dokter / Perawat / Pasien pages
  ...Object.keys(PASSWORD_TARGETS).flatMap((path) => [
    ['GET', `/${path}/:key/login`, ({ env, p }) => loginInfo(env, path, p.key), 'users.manage'],
    ['POST', `/${path}/:key/password`, async ({ env, req, p, auth }) => setProfilePassword(env, path, p.key, await body(req), auth.user), 'users.manage'],
  ]),
  ['GET', '/patients/:key/sessions', async ({ env, p, url, auth }) => {
    const pt = await findMaster(env, MASTER.patients, p.key);
    url.searchParams.set('patient_id', pt.id); if (!url.searchParams.get('view')) url.searchParams.set('view', 'all');
    return listSessions(env, url, auth);
  }, 'patients.read'],
].map(([method, pattern, handler, access]) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  const device = access.startsWith('device+');
  const list = access.replace(/^device\+/, '');
  const perms = list === 'public' || list === 'all' ? null : list.split(',');
  return { method, re, keys, handler, public: list === 'public', device, perms };
});

async function route(req, env) {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  let pathMatched = false;
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== req.method) continue;
    const p = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const auth = r.public ? {} : await authenticate(env, req);
    if (!r.public) {
      if (auth.device && !r.device) throw forbidden('The ingest key only works on ingest routes');
      if (!auth.user && !auth.device) throw new HttpError(401, 'unauthorized', 'Log in first (Authorization: Bearer <token>)');
      if (auth.user && r.perms && !r.perms.some((c) => can(auth.user, c))) throw forbidden();
      // a user who may only see their own sessions reaches only those where they are the DPJP
      if (auth.user && p.code && sessionScope(auth.user) !== 'all') {
        const s = await env.DB.prepare('SELECT doctor_id FROM exam_sessions WHERE code = ?').bind(p.code.replace(/^#/, '')).first();
        if (sessionScope(auth.user) === 'none' || (s && s.doctor_id !== auth.user.doctor_id)) throw notFound('Session');
      }
    }
    const out = await r.handler({ env, req, url, p, auth });
    if (out instanceof Response) return out; // the WebSocket upgrade
    return Array.isArray(out) ? json(out[1], out[0]) : json(out);
  }
  throw pathMatched ? new HttpError(405, 'method_not_allowed', `${req.method} is not allowed here`) : notFound('Route');
}

export default {
  async fetch(req, env) {
    const headers = cors(env, req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    let res;
    try {
      res = await route(req, env);
    } catch (e) {
      const err = e instanceof HttpError ? e : dbError(e);
      if (!err) console.error(e && e.stack || e);
      res = json({ error: err ? { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) } : { code: 'server_error', message: 'Something went wrong' } }, err ? err.status : 500);
    }
    if (res.status !== 101) for (const [k, v] of Object.entries(headers)) res.headers.set(k, v); // a WebSocket upgrade has immutable headers
    return res;
  },
};
