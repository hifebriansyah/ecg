# DETAKITA admin web (ecg)

Admin web for the DETAKITA Holter ECG telemedicine service: master data (doctors, nurses, patients) and exam sessions (start, watch live, finish, archive, delete).

## Current state

- `design/` — screen designs (HTML + screenshot per screen): doctor/nurse/patient lists and edit forms, "Tambah Sesi", session list with delete dialog, session detail.
- `db/schema.sql` — database schema built from those screens, deployed to Cloudflare D1 as `ecg`.
- `worker/api.js` — the REST API (Cloudflare Worker `ecg-api`), live at the address in `worker/api-url.txt`, with logins for three roles: Admin, Dokter, Perawat.
- `web/` — the web app (React 19, React Router 7, Tailwind 4, Vite, Lucide icons) with every screen from `design/`, wired to the live API, plus a Storybook.
- `tools/seed_demo.py` — fills the database with the doctors, nurses, patients and sessions shown in the designs (synthetic ECG).
- `tools/setup_db.py` — creates the D1 database and applies the schema.
- `tools/deploy_worker.py` — uploads the API Worker. `tools/create_admin.py` — creates/resets an admin login. `tools/create_demo_logins.py` — Dokter/Perawat test logins and the login-screen autofill.

Repository: `github.com/hifebriansyah/ecg` (public). The tools read Cloudflare keys from `../.env` (the `for-fun` folder), never from this repo.

## Web app

### Screens

| Route | Screen (design) | Notes |
|---|---|---|
| `/login` | Masuk | role picker, autofill of test logins (see below) |
| `/` | Dashboard | not in the designs: counts per status, the newest running sessions with their ECG |
| `/sesi/baru` | Tambah Sesi Pemeriksaan | Admin & Perawat. Adds a Holter device picker (and, for Admin, the intake nurse) |
| `/sesi/berjalan`, `/sesi/selesai`, `/sesi/arsip` | Sesi Pemeriksaan | search, Lead / Interval filters, mini ECG strip per row, bulk bar (Selesai / Arsip / Pulihkan / Hapus), delete dialog, "Berhasil Dihapus" toast |
| `/sesi/:code` | Detail Sesi | patient / doctor / emergency-contact cards, live Lead II strip (25 mm/s, 10 mm/mV, Freeze), battery / signal / lead / sampling cards, AI analysis, notes timeline with "load older" and a note box |
| `/master/dokter`, `/master/dokter/baru`, `/master/dokter/:code` | Daftar / Edit Dokter | filters: status, subspecialty, quota; bulk activate / deactivate |
| `/master/perawat`, `/master/perawat/:code` | Daftar / Edit Perawat | "Tambah Tenaga Perawat" dialog (NIK added: the database needs it) |
| `/master/pasien`, `/master/pasien/baru`, `/master/pasien/:mrn` | Daftar / Edit Pasien | "Pasien Tidak Ditemukan" empty state, the patient's session history |
| `/pengaturan` | Setting (user menu) | name, language, password. User menu also has Bahasa and Logout |

What a role cannot do is hidden (buttons, menu items, routes) and also refused by the API. Lists refresh by themselves: running sessions every 15 s, the ECG strip at the session's sync interval, the sidebar counts every 30 s. The "Bahasa" choice is saved to the account, but the screens are only in Indonesian so far.

### Demo data

```bash
python3 ecg/tools/seed_demo.py          # from for-fun/: people and 8 sessions from the designs (safe to run again)
python3 ecg/tools/seed_demo.py --live   # then keep streaming synthetic ECG + telemetry to running sessions (Ctrl+C)
```

The ECG is synthetic (a modelled P-QRS-T beat), sent through the device ingest key the way a Holter K1 would. Without `--live`, running sessions show "Menunggu sinyal dari perangkat…" once their last 10 s of data are older than the strip window.

### Storybook

```bash
cd web
npm run storybook          # http://localhost:6008
npm run build-storybook    # static build in web/dist-storybook (git-ignored)
```

"Komponen" has the UI kit (buttons, status pills, form fields, search + filter chips, dialogs, toasts, empty states) and the ECG strips. "Halaman" has every screen, rendered against a mock API (`src/mocks/`) with sample data from the designs; the toolbar's **Peran** switch shows the screens as Admin, Dokter or Perawat. Storybook never uses the real test logins: it replaces `VITE_DEMO_LOGINS` with fake ones.

### Run locally through Apache at **http://localhost/for-fun/ecg/** (from this `ecg` folder):

```bash
npm run build:local   # installs web/ deps (public npm, web/.npmrc) and builds web/dist with base /for-fun/ecg/
```

`.htaccess` serves `web/dist`: built files directly, every other path (`/login`, …) gets `index.html` so React Router picks the page. Repo files (design, worker, tools, db) are not served. Run `build:local` again after changing the app. Needs `mod_rewrite` and `AllowOverride FileInfo` (or All).

**Test logins (autofill).** Once per machine:

```bash
python3 ecg/tools/create_demo_logins.py   # from for-fun/
```

It creates a Dokter login (`dokter@detakita.med.id`, linked to dr. Andi Pratama from the designs) and a Perawat login (`perawat@detakita.med.id`, linked to Ns. Siti Rahmawati), reuses the admin from `create_admin.py`, keeps the passwords in `for-fun/.env`, and writes them to `web/.env.local` as `VITE_DEMO_LOGINS` (git-ignored). Then rebuild: clicking Admin / Dokter / Perawat under "Masuk sebagai" fills in that role's email and password. Without `web/.env.local` the fields stay empty. A build made with it has the passwords inside its JavaScript, so only use it locally, never for a public deploy.

For development with hot reload instead:

```bash
npm run dev      # http://localhost:5200/login (same as: cd web && npm run dev)
```

The API address comes from `VITE_API_URL` (see `web/.env.example`; the live API is the default). The login screen asks for the role (Admin / Dokter / Perawat), email and password. The account must have the chosen role, otherwise login is refused with a message naming the account's real role. "Ingat saya" keeps the login for 7 days; without it, the login ends when the tab closes.

## Roles

Each login has one role. A Dokter or Perawat login is linked to its profile in master data (`doctor_id` / `nurse_id`, one login per profile). It stops working while that profile is inactive; a doctor on leave (Cuti) can still log in.

| What | Admin | Perawat | Dokter |
|---|---|---|---|
| Read master data (doctors, nurses, patients, devices) | ✓ | ✓ | ✓ |
| Add / edit doctors, nurses, devices; delete any master data | ✓ | | |
| Add / edit patients (intake) | ✓ | ✓ | |
| See sessions | all | all | only where they are the DPJP |
| Start a session (Tambah Sesi) | ✓ | ✓ (fills in themselves as the nurse) | |
| Edit a session, mark it finished, write notes, run AI analysis | ✓ | ✓ | ✓ (own sessions) |
| Archive / unarchive | ✓ | ✓ | |
| Delete a session permanently | ✓ | | |
| Manage logins (`/users`) | ✓ | | |

Notes are always written as the logged-in person: a Dokter's note shows as DOKTER DPJP, a Perawat's as PERAWAT. `GET /me` (also returned by login) gives the role, the linked profile, `permissions` and `session_scope` (`all` / `own`), so the app can hide what a role cannot do.

## Database

SQLite, same engine as `../ekg/webserver`; the file also runs on Cloudflare D1 unchanged. Apply it with:

```bash
sqlite3 ecg.db < db/schema.sql
```

It is safe to run again. Times are ms since 1970 (UTC); the UI shows WIB.

On Cloudflare it lives in the D1 database **`ecg`** (id in `db/d1.json`). To create it or re-apply the schema (uses `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` from `for-fun/.env`):

```bash
python3 ecg/tools/setup_db.py
```

| Table | Screen | Holds |
|---|---|---|
| `users`, `auth_sessions` | sidebar user card | admin logins, language (Bahasa), login sessions |
| `subspecialties`, `units` | doctor/nurse selects and filters | lookup lists (seeded from the designs) |
| `doctors` | Master Data › Dokter | name with titles, NIK, STR, SIP, subspecialty, contact, status (Aktif/Cuti/Nonaktif), patient quota |
| `nurses` | Master Data › Perawat | name, NIK/NIP, NIRA, SIPP, STR, unit, shift, contact, status |
| `patients` | Master Data › Pasien | No. RM, NIK, birth date, sex, phone, emergency contact, address, medical history |
| `devices` | session detail "SN: DK-K1-…" | Holter K1 recorders |
| `exam_sessions` | Tambah Sesi, Sesi Pemeriksaan | patient, DPJP doctor, intake nurse, device, protocol (24/48/72 h, 1/5 s sync, lead II, 250 Hz, 0.5–40 Hz), indication, notes, status Berjalan/Selesai, `archived_at` for Arsip, latest BPM/rhythm for the list |
| `telemetry` | session detail cards | per-sync BPM, rhythm, PR/QRS, battery, signal quality, RSSI, packet loss |
| `ecg_chunks` | waveform strip | raw samples (int16) per sync |
| `session_notes` | session detail timeline | patient complaints (event button), DPJP instructions, nurse notes |
| `ai_analyses` | "Jalankan Analisa AI" | each AI run: model version, status, summary, findings JSON |

Views: `v_session_counts` (sidebar Berjalan/Selesai/Arsip), `v_doctor_list` and `v_nurse_list` (active patient count per doctor/nurse, quota state).

Deleting a session ("dihapus secara permanen") removes its telemetry, waveform, notes and AI runs too. Patients and doctors with sessions cannot be deleted; set them inactive instead.

## REST API

Live at `https://ecg-api.hifebriansyah.workers.dev` (also accepts an `/api` prefix). JSON in and out; times are ms since 1970.

```bash
python3 ecg/tools/deploy_worker.py   # after any change to worker/api.js
python3 ecg/tools/create_admin.py    # admin login; email/password go to .env (ECG_ADMIN_EMAIL / ECG_ADMIN_PASSWORD)
```

**Auth.** `POST /auth/login {email, password}` returns `{token}`; send `Authorization: Bearer <token>` (valid 7 days). The Holter device / mobile app instead sends `X-Ingest-Key: <ECG_INGEST_TOKEN from .env>`, which only works on the routes marked *ingest*. What each role may do is in the Roles table above; a route the role may not use answers 403.

**Errors.** `{ "error": { "code", "message", "fields"? } }` — 400 invalid (with per-field messages), 401, 403, 404, 409 (duplicate NIK/STR/serial, record in use, patient already has a running session, device busy).

**Lists** take `q` (search), `page`, `limit` (≤ 100) and return `{data, total, page, limit}`. Filters take one value or a comma list.

| Method & path | Screen / use |
|---|---|
| `POST /auth/login`, `POST /auth/logout`, `GET /me`, `PATCH /me` | sidebar user card; `PATCH /me` changes `name`, `language` (Bahasa) or password (`current_password`, `new_password`) |
| `GET /users?q&role=dokter,perawat,admin&active=1` · `POST /users` · `GET/PATCH/DELETE /users/:id` | Admin only. `POST` takes `name`, `email`, `role` (`admin` / `dokter` / `perawat`, or `doctor` / `nurse`), `doctor_id` or `nurse_id`, and an optional `password`; without one, a `temporary_password` is returned once. `PATCH` can change the role, switch the login off (`is_active: false`) or `reset_password: true`; these log the user out everywhere |
| `GET /lookups` | subspecialties, units, shifts, durations, sync intervals for the selects |
| `GET /stats` | sidebar badges (running / completed / archived) and master-data totals |
| `GET /doctors` `?q&status&subspecialty&quota=available,near_full` | Daftar Dokter (includes `active_patients`) |
| `POST /doctors`, `GET/PATCH/DELETE /doctors/:id-or-code` | Edit Dokter (code like `DOC-042-ANDI` is made for you) |
| `GET /nurses` `?q&status&unit_id&shift` | Daftar Perawat |
| `POST /nurses`, `GET/PATCH/DELETE /nurses/:id-or-code` | Tambah / Edit Perawat |
| `GET /patients` `?q&status&sex` | Daftar Pasien (includes `age`, `running_session`) |
| `POST /patients`, `GET/PATCH/DELETE /patients/:id-or-mrn` | Edit Pasien (No. RM like `CC-2026-0982` is made when not given) |
| `GET /patients/:id/sessions` | a patient's session history |
| `GET/POST /devices`, `GET/PATCH/DELETE /devices/:id-or-serial` | Holter recorders |
| `GET /sessions` `?view=running,completed,archived,all&q&lead&sync_interval&doctor_id&nurse_id` | Sesi Pemeriksaan list (latest BPM / rhythm included) |
| `POST /sessions` | Tambah Sesi (`patient_id`, `doctor_id`, `clinical_indication` required; `nurse_id`, `device_id`, `target_duration_hours`, `started_at`, `sync_interval_sec`, `notes`, …) |
| `GET /sessions/:code` | Detail Sesi: patient, doctor, nurse, device, emergency contact, `remaining_ms`, latest telemetry and AI run |
| `PATCH /sessions/:code` | change nurse, duration, sync interval, indication, notes, filter |
| `POST /sessions/:code/complete` · `/archive` · `/unarchive` | Tandai Selesai / Arsip |
| `DELETE /sessions/:code` | permanent delete (with its telemetry, ECG, notes, AI runs) |
| `POST /sessions/bulk {action: complete\|archive\|unarchive\|delete, codes: [...]}` | the list's bulk bar |
| `GET /sessions/:code/telemetry?since&limit` · `POST` *ingest* | battery / signal / BPM cards; device posts one reading or `{readings: [...]}` |
| `GET /sessions/:code/ecg?from&to&lead` · `POST` *ingest* | waveform strip (default last 10 s); device posts `{started_at, samples: [int16…]}` or `samples_b64` |
| `GET /sessions/:code/notes?before&limit` · `POST` *ingest* | timeline; `before` = oldest `occurred_at` loads older notes. Devices may only post `patient` / `system` notes |
| `GET/POST /sessions/:code/analyses` | "Jalankan Analisa AI": queues a run (one at a time per session) |
| `PATCH /analyses/:id` *ingest* | the ML engine reports `status`, `summary`, `findings` |

The AI analysis itself is not run by this Worker: `POST …/analyses` only queues it, and the ML engine (`ekg/ml_engine`) must pick up `queued` rows and report back.
