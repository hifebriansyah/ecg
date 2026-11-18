#!/usr/bin/env python3
"""Fill the D1 database with the people and sessions shown in ecg/design, so every screen has something to show.

    python3 ecg/tools/seed_demo.py           add demo doctors, nurses, patients, devices and sessions (safe to run again)
    python3 ecg/tools/seed_demo.py --live    then keep streaming synthetic ECG + telemetry to the running sessions (Ctrl+C stops)

The ECG and telemetry are SYNTHETIC (a modelled P-QRS-T beat at each session's heart rate). They stand in for a Holter K1
until a real device sends data; they are sent the same way a device does (X-Ingest-Key, ECG_INGEST_TOKEN in .env).
Logs in with the admin from .env (create_admin.py). NIKs and registration numbers are made up.
"""
import json
import math
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from setup_db import ECG, load_env  # noqa: E402

API = (ECG / "worker" / "api-url.txt").read_text().strip()
HZ = 250
CHUNK_S = 5

DOCTORS = [
    ("dr. Andi Pratama, Sp.JP (K)", "3171041982050003", "aritmia", "Spesialis Jantung & Pembuluh Darah • Aritmia", "active"),
    ("dr. Rina Kartika, Sp.JP, FIHA", "3171045205890001", "intervensi", "Kardiologi Intervensi & Telemetri", "active"),
    ("dr. Hendra Wijaya, Sp.JP (K)", "3171040411780004", "pediatrik", "Kardiologi Pediatrik & Kongenital", "active"),
    ("dr. Maya Anggraini, Sp.PD-KKV", "3171045209850007", "rehabilitasi", "Penyakit Dalam - Kardiovaskular", "inactive"),
    ("dr. Bambang Sutrisno, Sp.JP (K)", "3171041904730002", "aritmia", "Aritmia & Pacing Kardio", "active"),
]
NURSES = [
    ("Ns. Siti Rahmawati, S.Kep", "3273016508940002", "Koordinator Perawat Telemetri", 1, "morning", "active"),
    ("Ns. Rizky Ananda, S.Kep", "3273011203950005", None, 2, "afternoon", "active"),
    ("Ns. Dewi Wulandari, A.Md.Kep", "3273014907960003", None, 3, "morning", "active"),
    ("Ns. Fajar Pratama, S.Kep", "3273010101930008", None, 4, "night", "inactive"),
    ("Ns. Nurul Hidayah, S.Kep", "3273016612970001", None, 5, "afternoon", "active"),
]
# name, nik, birth, sex, phone, emergency (name, relation, phone), address, history
PATIENTS = [
    ("Budi Santoso", "3171041908680002", "1968-08-19", "M", "+62 812-3456-7890", ("Ny. Ratna", "Istri", "+62 811-9876-5432"),
     "Jl. Margonda Raya No. 42, Pondok Cina, Beji, Kota Depok, Jawa Barat 16424", "Hipertensi Derajat 1, Tidak ada riwayat alergi perekat elektrode"),
    ("Siti Rahmawati", "3171046203640004", "1964-03-22", "F", "+62 811-9876-5432", ("Tn. Joko", "Suami", "+62 811-1111-2222"),
     "Jl. Kemang Raya No. 8, Jakarta Selatan", "Diabetes melitus tipe 2"),
    ("Ahmad Dahlan", "3171040507810006", "1981-07-05", "M", "+62 813-2211-4455", ("Ny. Laila", "Istri", "+62 813-1234-0000"),
     "Jl. Pemuda No. 17, Rawamangun, Jakarta Timur", "Riwayat sinkop vasovagal"),
    ("Hendra Wijaya", "3171041510750003", "1975-10-15", "M", "+62 856-7788-9900", ("Ny. Maria", "Istri", "+62 856-0000-1212"),
     "Jl. Gajah Mada No. 101, Jakarta Pusat", "Dislipidemia, perokok aktif"),
    ("Nurul Aini", "3171045802590005", "1959-02-18", "F", "+62 818-4455-6677", ("Tn. Hasan", "Anak", "+62 818-9999-8888"),
     "Jl. Raya Bogor Km 21, Kramat Jati, Jakarta Timur", "Riwayat atrial fibrilasi paroksismal"),
    ("Siti Aminah", "3171044106620001", "1962-06-01", "F", "+62 811-2345-6789", ("Tn. Rahmat", "Suami", "+62 811-2222-3333"),
     "Jl. Salemba Raya No. 5, Jakarta Pusat", "Hipertensi"),
    ("Hendra Gunawan", "3171042208740002", "1974-08-22", "M", "+62 813-2211-4456", ("Ny. Desi", "Istri", "+62 813-4444-5555"),
     "Jl. Fatmawati No. 30, Cilandak, Jakarta Selatan", None),
    ("Ratna Dewi", "3171045011770003", "1977-11-10", "F", "+62 856-7788-9901", ("Tn. Agus", "Suami", "+62 856-6666-7777"),
     "Jl. Pahlawan No. 3, Bekasi", "Alergi plester ringan"),
]
DEVICES = ["DK-K1-2026-042", "DK-K1-2026-043", "DK-K1-2026-044", "DK-K1-2026-045", "DK-K1-2026-046", "DK-K1-2026-047"]
# patient, doctor, nurse, hours ago started, bpm, rhythm, outcome
SESSIONS = [
    ("Budi Santoso", 0, 0, 5.8, 76, "Irama Sinus Normal", "running"),
    ("Siti Rahmawati", 1, 1, 5.1, 84, "Irama Sinus Stabil", "running"),
    ("Ahmad Dahlan", 0, 2, 3.4, 54, "Sinus Bradikardia", "running"),
    ("Hendra Wijaya", 4, 0, 2.6, 108, "Sinus Takikardia", "running"),
    ("Nurul Aini", 1, 4, 1.2, 74, "Irama Sinus Normal", "running"),
    ("Siti Aminah", 0, 1, 30, 70, "Irama Sinus Normal", "completed"),
    ("Hendra Gunawan", 4, 2, 52, 66, "Irama Sinus Normal", "completed"),
    ("Ratna Dewi", 1, 0, 80, 72, "Irama Sinus Normal", "archived"),
]
INDICATIONS = ["Evaluasi Sinkop Berulang & Palpitasi Paroksismal", "Evaluasi Atrial Fibrilasi", "Palpitasi dan pusing berulang",
               "Evaluasi pasca ablasi", "Nyeri dada atipikal"]


def call(method, path, token=None, body=None, ingest=False):
    headers = {"Content-Type": "application/json", "User-Agent": "ecg-seed/1.0"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if ingest:
        headers["X-Ingest-Key"] = os.environ["ECG_INGEST_TOKEN"]
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        err = json.loads(e.read() or b"{}").get("error", {})
        raise RuntimeError(f"{method} {path} -> {e.code} {err.get('message')} {err.get('fields') or ''}") from None


def find(token, kind, q, match):
    rows = call("GET", f"/{kind}?q={urllib.parse.quote(q)}&limit=100", token)["data"]
    return next((r for r in rows if match(r)), None)


# ── synthetic ECG: sum of Gaussians for P, Q, R, S, T (µV), with small rate variability and baseline wander ──
WAVES = [(-0.20, 0.025, 150), (-0.035, 0.010, -120), (0.0, 0.011, 1150), (0.035, 0.012, -280), (0.26, 0.045, 320)]


def ecg_samples(start_ms, n, bpm, seed):
    rnd = random.Random(seed)
    rr = 60.0 / bpm
    out = []
    t0 = start_ms / 1000.0
    for i in range(n):
        t = t0 + i / HZ
        k = math.floor(t / rr)
        beat_t = t - (k + 0.5) * rr
        v = sum(a * math.exp(-((beat_t - mu) ** 2) / (2 * s * s)) for mu, s, a in WAVES)
        v += 35 * math.sin(2 * math.pi * 0.25 * t) + rnd.gauss(0, 8)
        out.append(int(round(v)))
    return out


def push_ecg(code, bpm, end_ms, seconds):
    start = end_ms - seconds * 1000
    for c in range(seconds // CHUNK_S):
        s = start + c * CHUNK_S * 1000
        call("POST", f"/sessions/{code}/ecg", body={"started_at": s, "samples": ecg_samples(s, CHUNK_S * HZ, bpm, s)}, ingest=True)


def telemetry(bpm, rhythm, battery, t_ms):
    return {"recorded_at": t_ms, "bpm": bpm, "rhythm": rhythm, "pr_ms": 150 + random.randint(0, 20), "qrs_ms": 84 + random.randint(0, 8),
            "battery_pct": battery, "battery_hours_left": round(battery * 0.62, 1), "signal_quality_pct": round(random.uniform(97.5, 99.9), 1),
            "rssi_dbm": random.randint(-70, -58), "packet_loss_pct": 0, "electrode_ok": True}


def seed():
    token = call("POST", "/auth/login", body={"email": os.environ["ECG_ADMIN_EMAIL"], "password": os.environ["ECG_ADMIN_PASSWORD"]})["token"]
    try:
        doctors, nurses, patients, devices = [], [], {}, []
        for i, (name, nik, sub, label, status) in enumerate(DOCTORS):
            d = find(token, "doctors", name.split(",")[0], lambda r: r["nik"] == nik)
            if not d:
                slug = name.split(",")[0].replace("dr. ", "").lower().replace(" ", ".")
                d = call("POST", "/doctors", token, {"full_name": name, "nik": nik, "str_number": f"31.1.1.100.2.21.{145892 + i}",
                         "sip_number": f"446/{1209 + i}/IDI/2024", "subspecialty_code": sub, "specialty_label": label,
                         "email": f"{slug}@rs-jantung.co.id", "whatsapp": f"+62 811-9824-{7711 + i}", "patient_quota": 10, "status": status})
                print("doctor ", d["code"], name)
            doctors.append(d)
        for i, (name, nik, pos, unit, shift, status) in enumerate(NURSES):
            n = find(token, "nurses", name.split(",")[0], lambda r: r["nik"] == nik)
            if not n:
                n = call("POST", "/nurses", token, {"full_name": name, "nik": nik, "nira": f"3174{20260 + i:08d}", "position": pos,
                         "unit_id": unit, "shift": shift, "status": status, "sipp_number": f"446/{2088 + i}/SIPP/2023"})
                print("nurse  ", n["code"], name)
            nurses.append(n)
        for name, nik, birth, sex, phone, (en, er, ep), addr, hist in PATIENTS:
            p = find(token, "patients", name, lambda r: r["nik"] == nik)
            if not p:
                p = call("POST", "/patients", token, {"full_name": name, "nik": nik, "birth_date": birth, "sex": sex, "phone": phone,
                         "emergency_contact_name": en, "emergency_contact_relation": er, "emergency_contact_phone": ep,
                         "address": addr, "medical_history": hist})
                print("patient", p["mrn"], name)
            patients[name] = p
        for sn in DEVICES:
            d = find(token, "devices", sn, lambda r: r["serial_number"] == sn) or call("POST", "/devices", token, {"serial_number": sn})
            devices.append(d)

        now = int(time.time() * 1000)
        for i, (pname, di, ni, hours_ago, bpm, rhythm, outcome) in enumerate(SESSIONS):
            p = patients[pname]
            if call("GET", f"/patients/{p['id']}/sessions?limit=1", token)["total"]:
                continue
            free = [d for d in call("GET", "/devices?status=available&limit=100", token)["data"]]
            started = now - int(hours_ago * 3600000)
            s = call("POST", "/sessions", token, {"patient_id": p["id"], "doctor_id": doctors[di]["id"], "nurse_id": nurses[ni]["id"],
                     "device_id": free[0]["id"] if free else None, "started_at": started, "target_duration_hours": 24 if hours_ago < 24 else 48,
                     "clinical_indication": INDICATIONS[i % len(INDICATIONS)],
                     "notes": "Edukasi tombol oranye Holter saat berdebar." if i == 0 else None})
            code = s["code"]
            call("POST", f"/sessions/{code}/notes", token, {"author_role": "nurse", "nurse_id": nurses[ni]["id"], "kind": "intake", "occurred_at": started,
                 "body": f"Pemasangan elektrode 3-lead selesai, impedansi kulit terverifikasi {random.randint(95, 99)}% optimal. Sesi dimulai."})
            call("POST", f"/sessions/{code}/notes", token, {"author_role": "doctor", "kind": "instruction", "occurred_at": started + 6300000 if hours_ago > 2 else started + 1200000,
                 "body": "Pasien diinstruksikan menjaga elektrode tetap kering dan mencatat aktivitas harian di log book."})
            if i == 0:
                call("POST", f"/sessions/{code}/notes", body={"author_role": "patient", "kind": "symptom", "bpm_at_event": 118, "occurred_at": now - 900000,
                     "body": "Menekan tombol keluhan (Dada berdebar mendadak saat berjalan santai). AI mencatat takikardia transient 118 BPM."}, ingest=True)
            end = now if outcome == "running" else started + int(min(hours_ago, 24) * 3600000) - 60000
            readings = [telemetry(bpm + random.randint(-3, 3), rhythm, max(5, 100 - int(h * 2.7)), started + h * 3600000)
                        for h in range(int(min(hours_ago, 24)) + 1) if started + h * 3600000 <= end]
            call("POST", f"/sessions/{code}/telemetry", body={"readings": readings}, ingest=True)
            push_ecg(code, bpm, end, 30)
            if outcome != "running":
                call("POST", f"/sessions/{code}/complete", token)
            if outcome == "archived":
                call("POST", f"/sessions/{code}/archive", token)
            print("session", code, pname, outcome)
    finally:
        call("POST", "/auth/logout", token)


def live():
    """Act like the Holter devices of every running session: every 5 s send 5 s of ECG and one telemetry reading."""
    token = call("POST", "/auth/login", body={"email": os.environ["ECG_ADMIN_EMAIL"], "password": os.environ["ECG_ADMIN_PASSWORD"]})["token"]
    print("Streaming synthetic ECG to running sessions every 5 s (Ctrl+C to stop)…", flush=True)
    try:
        base = {}
        while True:
            t = int(time.time() * 1000) // 1000 * 1000
            running = call("GET", "/sessions?view=running&limit=100", token)["data"]
            for s in running:
                bpm0 = base.setdefault(s["code"], s["last_bpm"] or 75)
                bpm = max(40, bpm0 + random.randint(-2, 2))
                try:
                    samples = ecg_samples(t - CHUNK_S * 1000, CHUNK_S * HZ, bpm, t)
                    call("POST", f"/sessions/{s['code']}/ecg", body={"started_at": t - CHUNK_S * 1000, "samples": samples}, ingest=True)
                    tel = telemetry(bpm, s["last_rhythm"] or "Irama Sinus Normal", 84, t)
                    call("POST", f"/sessions/{s['code']}/telemetry", body=tel, ingest=True)
                except RuntimeError as e:
                    print("skip", s["code"], e, flush=True)
            time.sleep(max(0.5, CHUNK_S - (time.time() * 1000 - t) / 1000))
    except KeyboardInterrupt:
        pass
    finally:
        call("POST", "/auth/logout", token)


if __name__ == "__main__":
    load_env()
    for k in ("ECG_ADMIN_EMAIL", "ECG_ADMIN_PASSWORD", "ECG_INGEST_TOKEN"):
        if not os.environ.get(k):
            sys.exit(f"{k} is missing in .env (run create_admin.py and deploy_worker.py first)")
    seed()
    if "--live" in sys.argv:
        live()
