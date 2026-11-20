-- DETAKITA admin web (ecg/) — database schema, built from the screens in ecg/design/.
-- SQLite (same engine as ekg/webserver; also runs unchanged on Cloudflare D1).
-- Safe to run again: every statement is IF NOT EXISTS / INSERT OR IGNORE.
--
-- Conventions
--   * id        INTEGER PRIMARY KEY (internal). Public codes shown in the UI live in their own UNIQUE column.
--   * times     INTEGER, ms since 1970 (UTC). The UI shows them in WIB.
--   * dates     TEXT 'YYYY-MM-DD' (birth dates only).
--   * enums     TEXT + CHECK, values in English; the UI translates them (Bahasa setting).
--   * counts shown in the UI (sidebar "Berjalan 12", "8 Pasien", "12 Terdaftar") are computed, not stored.

PRAGMA foreign_keys = ON;

-- ─────────────────────────────────────────────────────────────────────────────
-- Accounts (sidebar user card: "Inara · Admin", inara@detakita.med.id; Bahasa / Setting / Logout)
-- ─────────────────────────────────────────────────────────────────────────────
-- Konfigurasi > Grup / Izin: a group is a named set of permissions; a user belongs to one group and may have
-- per-user overrides (allow / deny). The 'admin' group always has every permission (not stored, not editable).
CREATE TABLE IF NOT EXISTS user_groups (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,                   -- 'admin', 'doctor', 'nurse' (system groups) or a slug
  name        TEXT NOT NULL,                          -- "Dokter"
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0,             -- system groups cannot be deleted
  created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_permissions (
  group_id    INTEGER NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL,                          -- 'sessions.create', ... (catalog is in worker/api.js)
  PRIMARY KEY (group_id, permission)
);

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,                       -- "Inara"
  email          TEXT NOT NULL UNIQUE COLLATE NOCASE, -- "inara@detakita.med.id"
  password_hash  TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'admin'
                 CHECK (role IN ('admin','doctor','nurse')),
  doctor_id      INTEGER REFERENCES doctors(id) ON DELETE SET NULL, -- set when the login belongs to a doctor
  nurse_id       INTEGER REFERENCES nurses(id)  ON DELETE SET NULL, -- set when the login belongs to a nurse
  language       TEXT NOT NULL DEFAULT 'id' CHECK (language IN ('id','en')), -- "Bahasa" menu
  group_id       INTEGER REFERENCES user_groups(id) ON DELETE SET NULL,   -- permission group (Konfigurasi > Grup); NULL = the group named like the role
  is_active      INTEGER NOT NULL DEFAULT 1,
  last_login_at  INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_sessions (             -- login sessions (not exam sessions)
  token_hash  TEXT PRIMARY KEY,                       -- SHA-256 of the cookie token
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON auth_sessions(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Lookups
-- ─────────────────────────────────────────────────────────────────────────────
-- "Spesialisasi & Peminatan" select on Edit Dokter; "Subspesialisasi" filter on Daftar Dokter.
CREATE TABLE IF NOT EXISTS subspecialties (
  code        TEXT PRIMARY KEY,                       -- 'aritmia'
  name        TEXT NOT NULL,                          -- "Aritmia & Elektrofisiologi Klinis (PERKI)"
  short_name  TEXT NOT NULL,                          -- "Aritmia" (filter chip)
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- "Unit Penugasan" select on Tambah Perawat; "Ruangan" filter on Daftar Perawat.
CREATE TABLE IF NOT EXISTS units (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,                   -- "Stasiun Telemetri Sentral"
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Master Data › Dokter
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctors (
  id                  INTEGER PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,           -- "DOC-042-ANDI" (shown as #DOC-042-ANDI)
  full_name           TEXT NOT NULL,                  -- "dr. Andi Pratama, Sp.JP (K)" (name with titles)
  nik                 TEXT NOT NULL UNIQUE CHECK (length(nik) = 16),
  str_number          TEXT NOT NULL UNIQUE,           -- "31.1.1.100.2.21.145892"
  sip_number          TEXT NOT NULL,                  -- "446/1209/IDI/2024"
  subspecialty_code   TEXT REFERENCES subspecialties(code) ON DELETE SET NULL,
  specialty_label     TEXT,                           -- list subtitle: "Spesialis Jantung & Pembuluh Darah • Aritmia"
  email               TEXT NOT NULL COLLATE NOCASE,   -- "Email Kedinasan"
  whatsapp            TEXT NOT NULL,                  -- E.164, e.g. "+6281198247711"
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','leave','inactive')), -- Aktif / Cuti / Nonaktif
  patient_quota       INTEGER,                        -- max running sessions; drives "Tersedia / Mendekati Penuh" (NULL = no limit)
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS doctors_status ON doctors(status, full_name);
CREATE INDEX IF NOT EXISTS doctors_sub    ON doctors(subspecialty_code);

-- ─────────────────────────────────────────────────────────────────────────────
-- Master Data › Perawat
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nurses (
  id            INTEGER PRIMARY KEY,
  code          TEXT NOT NULL UNIQUE,                 -- "NRS-018-SITI"
  full_name     TEXT NOT NULL,                        -- "Ns. Siti Rahmawati, S.Kep"
  nik           TEXT NOT NULL UNIQUE,                 -- "16 Digit NIK KTP atau NIP Rumah Sakit"
  nira          TEXT UNIQUE,                          -- "Nomor Registrasi NIRA" (Tambah Perawat dialog)
  sipp_number   TEXT,                                 -- "446/2088/SIPP/2023"
  str_number    TEXT UNIQUE,                          -- "31.2.1.200.3.22.189402"
  position      TEXT,                                 -- list subtitle: "Koordinator Perawat Telemetri"
  unit_id       INTEGER REFERENCES units(id) ON DELETE SET NULL,
  shift         TEXT CHECK (shift IN ('morning','afternoon','night')), -- Pagi 07:00-14:30 / Siang 14:00-21:00 / Malam 20:30-07:30
  email         TEXT COLLATE NOCASE,
  whatsapp      TEXT,
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','inactive')), -- Aktif / Nonaktif-Cuti
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nurses_status ON nurses(status, full_name);
CREATE INDEX IF NOT EXISTS nurses_unit   ON nurses(unit_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Master Data › Pasien
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patients (
  id                        INTEGER PRIMARY KEY,
  mrn                       TEXT NOT NULL UNIQUE,     -- No. RM "CC-2026-0982"
  full_name                 TEXT NOT NULL,
  nik                       TEXT UNIQUE CHECK (nik IS NULL OR length(nik) = 16),
  birth_date                TEXT NOT NULL,            -- 'YYYY-MM-DD'; "Umur" is computed
  sex                       TEXT NOT NULL CHECK (sex IN ('M','F')), -- Laki-laki / Perempuan
  phone                     TEXT NOT NULL,            -- "Nomor WhatsApp / Telepon"
  emergency_contact_name    TEXT,                     -- "Ny. Ratna"
  emergency_contact_relation TEXT,                    -- "Istri"
  emergency_contact_phone   TEXT,                     -- "+62 811-9876-5432"
  address                   TEXT,                     -- "Alamat Domisili Lengkap"
  medical_history           TEXT,                     -- "Riwayat Penyakit Penyerta & Alergi"
  status                    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at                INTEGER NOT NULL,
  updated_at                INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS patients_name   ON patients(full_name);
CREATE INDEX IF NOT EXISTS patients_filter ON patients(status, sex);

-- ─────────────────────────────────────────────────────────────────────────────
-- Holter devices ("SN: DK-K1-2026-042 (Telemetri DETAKITA K1)")
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS devices (
  id             INTEGER PRIMARY KEY,
  serial_number  TEXT NOT NULL UNIQUE,                -- "DK-K1-2026-042"
  model          TEXT NOT NULL DEFAULT 'Telemetri DETAKITA K1',
  firmware       TEXT,
  status         TEXT NOT NULL DEFAULT 'available'
                 CHECK (status IN ('available','in_use','maintenance','retired')),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Sesi Pemeriksaan (Tambah Sesi form + Detail Sesi + list with Berjalan / Selesai / Arsip)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exam_sessions (
  id                    INTEGER PRIMARY KEY,
  code                  TEXT NOT NULL UNIQUE,         -- short public id "a7f3b9c" (shown as #a7f3b9c)
  patient_id            INTEGER NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id             INTEGER NOT NULL REFERENCES doctors(id)  ON DELETE RESTRICT, -- Dokter DPJP
  nurse_id              INTEGER REFERENCES nurses(id)  ON DELETE SET NULL,           -- nurse who did the intake
  device_id             INTEGER REFERENCES devices(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','completed')), -- Berjalan / Selesai ("Tandai Selesai")
  archived_at           INTEGER,                      -- set = in "Arsip" (bulk action on the list)
  -- protocol (Konfigurasi Peranti & Protokol Holter)
  target_duration_hours INTEGER NOT NULL DEFAULT 24 CHECK (target_duration_hours IN (24,48,72)),
  started_at            INTEGER NOT NULL,             -- "Tanggal & Waktu Mulai"
  ended_at              INTEGER,                      -- set by "Tandai Selesai"
  sync_interval_sec     INTEGER NOT NULL DEFAULT 5 CHECK (sync_interval_sec IN (1,5)),
  lead                  TEXT NOT NULL DEFAULT 'II',   -- list filter "Lead: Lead II"
  lead_config           TEXT NOT NULL DEFAULT '3-lead Einthoven',
  sampling_hz           INTEGER NOT NULL DEFAULT 250,
  filter_low_hz         REAL NOT NULL DEFAULT 0.5,    -- "Filter: Aktif (0.5 - 40 Hz)"
  filter_high_hz        REAL NOT NULL DEFAULT 40,
  -- clinical
  clinical_indication   TEXT NOT NULL,                -- "Evaluasi Sinkop Berulang & Palpitasi Paroksismal"
  notes                 TEXT,                         -- "Catatan Khusus untuk Pasien / Perawat"
  -- latest reading, copied from telemetry so the list ("76 BPM · Normal Sinus") needs no join
  last_bpm              INTEGER,
  last_rhythm           TEXT,
  last_seen_at          INTEGER,
  created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at            INTEGER NOT NULL,
  updated_at            INTEGER NOT NULL,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX IF NOT EXISTS exam_sessions_list    ON exam_sessions(status, archived_at, started_at DESC);
CREATE INDEX IF NOT EXISTS exam_sessions_patient ON exam_sessions(patient_id, started_at DESC);
CREATE INDEX IF NOT EXISTS exam_sessions_doctor  ON exam_sessions(doctor_id, status);
CREATE INDEX IF NOT EXISTS exam_sessions_nurse   ON exam_sessions(nurse_id, status);
-- one device can only record one running session
CREATE UNIQUE INDEX IF NOT EXISTS exam_sessions_device_running
  ON exam_sessions(device_id) WHERE status = 'running' AND device_id IS NOT NULL;

-- Device health + rhythm snapshots, one row per sync (every 1 or 5 s).
-- Feeds the Battery / Signal Quality cards and the BPM / Irama overlay on the strip.
CREATE TABLE IF NOT EXISTS telemetry (
  id                  INTEGER PRIMARY KEY,
  session_id          INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  recorded_at         INTEGER NOT NULL,
  bpm                 INTEGER,                        -- 76
  rhythm              TEXT,                           -- "Irama Sinus Normal"
  pr_ms               INTEGER,                        -- 162
  qrs_ms              INTEGER,                        -- 88
  battery_pct         INTEGER CHECK (battery_pct BETWEEN 0 AND 100),
  battery_hours_left  REAL,                           -- "±52 Jam"
  signal_quality_pct  REAL,                           -- 99.8
  rssi_dbm            INTEGER,                        -- -62
  packet_loss_pct     REAL,                           -- 0
  electrode_ok        INTEGER                         -- 1 = "Elektroda Ag/AgCl Aktif"
);
CREATE INDEX IF NOT EXISTS telemetry_session ON telemetry(session_id, recorded_at DESC);

-- Raw waveform in chunks (one chunk per sync). Samples are int16 little-endian at sampling_hz.
CREATE TABLE IF NOT EXISTS ecg_chunks (
  id            INTEGER PRIMARY KEY,
  session_id    INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  lead          TEXT NOT NULL DEFAULT 'II',
  started_at    INTEGER NOT NULL,                     -- time of the first sample
  sample_count  INTEGER NOT NULL,
  samples       BLOB NOT NULL,
  UNIQUE (session_id, lead, started_at)
);

-- Timeline at the bottom of Detail Sesi: patient complaints (orange button), DPJP instructions, nurse notes.
CREATE TABLE IF NOT EXISTS session_notes (
  id            INTEGER PRIMARY KEY,
  session_id    INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  author_role   TEXT NOT NULL CHECK (author_role IN ('patient','doctor','nurse','admin','system')),
                                                      -- badge: PASIEN / DOKTER DPJP / PERAWAT
  doctor_id     INTEGER REFERENCES doctors(id) ON DELETE SET NULL,
  nurse_id      INTEGER REFERENCES nurses(id)  ON DELETE SET NULL,
  user_id       INTEGER REFERENCES users(id)   ON DELETE SET NULL,
  kind          TEXT NOT NULL DEFAULT 'note'
                CHECK (kind IN ('note','symptom','instruction','intake')), -- 'symptom' = patient pressed the event button
  body          TEXT NOT NULL,
  bpm_at_event  INTEGER,                              -- "AI mencatat takikardia transient 118 BPM"
  occurred_at   INTEGER NOT NULL,                     -- "[14:22 WIB]"
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS session_notes_session ON session_notes(session_id, occurred_at DESC);

-- "Analisis Aritmia AI DETAKITA · Model v2.4" — each press of "Jalankan Analisa AI".
CREATE TABLE IF NOT EXISTS ai_analyses (
  id             INTEGER PRIMARY KEY,
  session_id     INTEGER NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
  model_version  TEXT NOT NULL,                       -- "v2.4"
  status         TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','running','done','failed')),
  range_start    INTEGER,                             -- part of the recording analysed (NULL = all of it)
  range_end      INTEGER,
  summary        TEXT,                                -- short readable result
  findings       TEXT,                                -- JSON: [{type:'PVC', at:..., bpm:...}, ...]
  error          TEXT,
  requested_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     INTEGER NOT NULL,
  finished_at    INTEGER
);
CREATE INDEX IF NOT EXISTS ai_analyses_session ON ai_analyses(session_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Views for the list screens (counts the UI shows but the tables don't store)
-- ─────────────────────────────────────────────────────────────────────────────
-- Sidebar badges: Berjalan 12 / Selesai 48 / Arsip.
CREATE VIEW IF NOT EXISTS v_session_counts AS
SELECT
  SUM(status = 'running'   AND archived_at IS NULL) AS running,
  SUM(status = 'completed' AND archived_at IS NULL) AS completed,
  SUM(archived_at IS NOT NULL)                      AS archived
FROM exam_sessions;

-- Daftar Dokter: "8 Pasien" + quota state.
CREATE VIEW IF NOT EXISTS v_doctor_list AS
SELECT d.*,
       COUNT(s.id) AS active_patients,
       CASE WHEN d.patient_quota IS NULL THEN 'available'
            WHEN COUNT(s.id) >= d.patient_quota * 0.8 THEN 'near_full'
            ELSE 'available' END AS quota_state
FROM doctors d
LEFT JOIN exam_sessions s ON s.doctor_id = d.id AND s.status = 'running' AND s.archived_at IS NULL
GROUP BY d.id;

-- Daftar Perawat: "6 Pasien".
CREATE VIEW IF NOT EXISTS v_nurse_list AS
SELECT n.*, u.name AS unit_name, COUNT(s.id) AS active_patients
FROM nurses n
LEFT JOIN units u ON u.id = n.unit_id
LEFT JOIN exam_sessions s ON s.nurse_id = n.id AND s.status = 'running' AND s.archived_at IS NULL
GROUP BY n.id;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lookup values from the designs
-- ─────────────────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO subspecialties (code, name, short_name, sort_order) VALUES
  ('aritmia',        'Aritmia & Elektrofisiologi Klinis (PERKI)',        'Aritmia',        1),
  ('intervensi',     'Kardiologi Intervensi & Kateterisasi',             'Intervensi',     2),
  ('ekokardiografi', 'Ekokardiografi & Pencitraan Kardiovaskular',       'Ekokardiografi', 3),
  ('pediatrik',      'Kardiologi Pediatrik & Penyakit Jantung Bawaan',   'Pediatrik',      4),
  ('rehabilitasi',   'Rehabilitasi & Prevensi Kardiovaskular',           'Rehabilitasi',   5);

INSERT OR IGNORE INTO units (name, sort_order) VALUES
  ('Poli Jantung & Rawat Inap',   1),
  ('Stasiun Telemetri Sentral',   2),
  ('Poli Diagnostik Non-Invasif', 3),
  ('ICU Kardiovaskular',          4),
  ('Poli Aritmia',                5);

-- One login per doctor / nurse profile (added with the role logins).
CREATE UNIQUE INDEX IF NOT EXISTS users_doctor ON users(doctor_id) WHERE doctor_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_nurse  ON users(nurse_id)  WHERE nurse_id  IS NOT NULL;

-- Per-user overrides on top of the group, and patient app (apk) passwords.
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission  TEXT NOT NULL,
  effect      TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  PRIMARY KEY (user_id, permission)
);
-- Patients have no web login; this is the password for the patient mobile app (kept apart from `patients` so it never leaks in API rows).
CREATE TABLE IF NOT EXISTS patient_credentials (
  patient_id    INTEGER PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Default groups and permissions. Doctor: dashboard + the sessions where they are the DPJP (plus working on those).
-- Nurse: dashboard, every session, create sessions, intake patients. Admin: everything (implicit).
INSERT OR IGNORE INTO user_groups (code, name, description, is_system, created_at) VALUES
  ('admin',  'Admin',   'Akses penuh ke semua fitur', 1, 0),
  ('doctor', 'Dokter',  'Dashboard dan sesi pemeriksaan yang ditugaskan kepadanya (DPJP)', 1, 0),
  ('nurse',  'Perawat', 'Dashboard, membuat sesi, dan melihat semua sesi', 1, 0);
INSERT OR IGNORE INTO group_permissions (group_id, permission)
  SELECT g.id, v.column1 FROM user_groups g, (VALUES
    ('dashboard.view'),
    ('sessions.read_own'),
    ('sessions.edit'),
    ('sessions.complete'),
    ('notes.write'),
    ('ai.run')) AS v
  WHERE g.code = 'doctor' AND g.is_system = 1
    AND NOT EXISTS (SELECT 1 FROM group_permissions x WHERE x.group_id = g.id);  -- only a group with no permissions yet, so edits survive a re-run
INSERT OR IGNORE INTO group_permissions (group_id, permission)
  SELECT g.id, v.column1 FROM user_groups g, (VALUES
    ('dashboard.view'),
    ('sessions.read_all'),
    ('sessions.create'),
    ('sessions.edit'),
    ('sessions.complete'),
    ('sessions.archive'),
    ('patients.read'),
    ('patients.write'),
    ('master.read'),
    ('notes.write'),
    ('ai.run')) AS v
  WHERE g.code = 'nurse' AND g.is_system = 1
    AND NOT EXISTS (SELECT 1 FROM group_permissions x WHERE x.group_id = g.id);  -- only a group with no permissions yet, so edits survive a re-run
UPDATE users SET group_id = (SELECT id FROM user_groups WHERE code = users.role) WHERE group_id IS NULL;
