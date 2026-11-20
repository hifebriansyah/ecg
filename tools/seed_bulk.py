#!/usr/bin/env python3
"""Add many made-up doctors, nurses and patients, so the lists have several pages to scroll through.

    python3 ecg/tools/seed_bulk.py                       60 doctors, 60 nurses, 120 patients
    python3 ecg/tools/seed_bulk.py --doctors 100 --nurses 80 --patients 300

Names are random Indonesian names (same every run). Every NIK made here starts with "99", which no real NIK does,
so they are easy to spot; running it again skips records that already exist (same NIK). Logs in with the private
admin from .env (create_admin.py). No sessions are added (see seed_demo.py for those).
"""
import argparse
import json
import os
import random
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from setup_db import ECG, load_env  # noqa: E402

API = (ECG / "worker" / "api-url.txt").read_text().strip()

MALE = ["Agus", "Bayu", "Dimas", "Eko", "Fajar", "Gilang", "Hadi", "Irfan", "Joko", "Kurniawan", "Lukman", "Made", "Nanda",
        "Oki", "Putu", "Rafi", "Rizal", "Satria", "Taufik", "Wahyu", "Yoga", "Zainal", "Arif", "Bima", "Dedi", "Hendra",
        "Ilham", "Krisna", "Rudi", "Teguh"]
FEMALE = ["Ayu", "Bunga", "Citra", "Dewi", "Eka", "Fitri", "Gita", "Hana", "Indah", "Kartika", "Lestari", "Maya", "Nadia",
          "Okta", "Putri", "Rina", "Sari", "Tari", "Utami", "Wulan", "Yuni", "Zahra", "Anisa", "Dian", "Intan", "Laras",
          "Mega", "Nurul", "Ratna", "Vina"]
LAST = ["Pratama", "Saputra", "Wijaya", "Santoso", "Hidayat", "Kusuma", "Nugroho", "Setiawan", "Lestari", "Siregar",
        "Nasution", "Harahap", "Simanjuntak", "Gunawan", "Halim", "Hakim", "Rahman", "Syahputra", "Wibowo", "Utomo",
        "Purnomo", "Susanto", "Firmansyah", "Ramadhan", "Kurnia", "Permana", "Maulana", "Hasibuan", "Sitompul", "Tanjung"]
CITIES = ["Jakarta Selatan", "Jakarta Timur", "Depok", "Bekasi", "Tangerang", "Bogor", "Bandung", "Jakarta Barat"]
STREETS = ["Jl. Margonda Raya", "Jl. Kemang Raya", "Jl. Pemuda", "Jl. Fatmawati", "Jl. Pahlawan", "Jl. Merdeka", "Jl. Sudirman", "Jl. Raya Bogor"]
HISTORY = [None, "Hipertensi", "Diabetes melitus tipe 2", "Dislipidemia", "Riwayat sinkop", "Alergi plester ringan",
           "Riwayat atrial fibrilasi paroksismal", "Perokok aktif", "Hipertensi, dislipidemia"]
SUBS = [("aritmia", "Aritmia & Elektrofisiologi"), ("intervensi", "Kardiologi Intervensi"), ("ekokardiografi", "Ekokardiografi"),
        ("pediatrik", "Kardiologi Pediatrik"), ("rehabilitasi", "Rehabilitasi Kardiovaskular")]
DR_TITLES = ["Sp.JP", "Sp.JP (K)", "Sp.JP, FIHA", "Sp.PD-KKV"]
NS_TITLES = ["S.Kep", "A.Md.Kep", "S.Kep, M.Kep"]
POSITIONS = [None, None, "Perawat Telemetri", "Perawat Poli Jantung", "Kepala Ruang", "Perawat Pelaksana"]


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", "User-Agent": "ecg-seed/1.0",
                                          **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def phone(rnd, prefix="812"):
    return f"+62 {prefix}-{rnd.randint(1000, 9999)}-{rnd.randint(1000, 9999)}"


def people(n, kind, rnd):
    rows = []
    for i in range(n):
        female = rnd.random() < 0.5
        first = rnd.choice(FEMALE if female else MALE)
        name = f"{first} {rnd.choice(LAST)}"
        nik = f"99{ {'doctors': 1, 'nurses': 2, 'patients': 3}[kind] }{i + 1:013d}"
        if kind == "doctors":
            sub, label = rnd.choice(SUBS)
            rows.append({"full_name": f"dr. {name}, {rnd.choice(DR_TITLES)}", "nik": nik, "str_number": f"99.1.1.100.2.21.{100000 + i}",
                         "sip_number": f"446/{3000 + i}/IDI/2025", "subspecialty_code": sub, "specialty_label": f"Spesialis Jantung • {label}",
                         "email": f"{first.lower()}.{i + 1}@rs-jantung.co.id", "whatsapp": phone(rnd, "811"),
                         "patient_quota": rnd.choice([5, 8, 10, 12]), "status": rnd.choices(["active", "leave", "inactive"], [85, 10, 5])[0]})
        elif kind == "nurses":
            rows.append({"full_name": f"Ns. {name}, {rnd.choice(NS_TITLES)}", "nik": nik, "nira": f"99{i + 1:010d}",
                         "sipp_number": f"446/{5000 + i}/SIPP/2025", "position": rnd.choice(POSITIONS), "unit_id": rnd.randint(1, 5),
                         "shift": rnd.choice(["morning", "afternoon", "night"]), "email": f"ns.{first.lower()}.{i + 1}@rs-jantung.co.id",
                         "whatsapp": phone(rnd, "813"), "status": rnd.choices(["active", "inactive"], [90, 10])[0]})
        else:
            year = rnd.randint(1945, 2004)
            rows.append({"full_name": name, "nik": nik, "birth_date": f"{year}-{rnd.randint(1, 12):02d}-{rnd.randint(1, 28):02d}",
                         "sex": "F" if female else "M", "phone": phone(rnd),
                         "emergency_contact_name": f"{rnd.choice(MALE + FEMALE)} {rnd.choice(LAST)}",
                         "emergency_contact_relation": rnd.choice(["Istri", "Suami", "Anak", "Saudara", "Orang tua"]),
                         "emergency_contact_phone": phone(rnd, "857"),
                         "address": f"{rnd.choice(STREETS)} No. {rnd.randint(1, 200)}, {rnd.choice(CITIES)}",
                         "medical_history": rnd.choice(HISTORY), "status": rnd.choices(["active", "inactive"], [92, 8])[0]})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--doctors", type=int, default=60)
    ap.add_argument("--nurses", type=int, default=60)
    ap.add_argument("--patients", type=int, default=120)
    args = ap.parse_args()
    load_env()
    email, pw = os.environ.get("ECG_ADMIN_EMAIL"), os.environ.get("ECG_ADMIN_PASSWORD")
    if not email or not pw:
        sys.exit("No admin in .env: run  python3 ecg/tools/create_admin.py  first")
    status, r = call("POST", "/auth/login", body={"email": email, "password": pw})
    if status != 200:
        sys.exit(f"Login failed: {r}")
    token = r["token"]
    rnd = random.Random(20261121)
    try:
        for kind, n in (("doctors", args.doctors), ("nurses", args.nurses), ("patients", args.patients)):
            rows = people(n, kind, rnd)
            with ThreadPoolExecutor(max_workers=6) as pool:
                results = list(pool.map(lambda b: call("POST", f"/{kind}", token, b), rows))
            made = sum(1 for s, _ in results if s == 201)
            skipped = sum(1 for s, _ in results if s == 409)
            failed = [d for s, d in results if s not in (201, 409)]
            print(f"{kind:9} added {made}, already there {skipped}" + (f", FAILED {len(failed)}: {failed[0]}" if failed else ""))
        for kind in ("doctors", "nurses", "patients"):
            print(f"{kind:9} total now {call('GET', f'/{kind}?limit=1', token)[1]['total']}")
    finally:
        call("POST", "/auth/logout", token)


if __name__ == "__main__":
    main()
