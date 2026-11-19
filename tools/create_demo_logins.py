#!/usr/bin/env python3
"""Create the three public demo logins (Admin, Dokter, Perawat) that the login screen fills in.

    python3 ecg/tools/create_demo_logins.py

The emails and passwords are in ecg/web/src/demo-logins.json. They are PUBLIC on purpose: ecg.situs.id is a demo, and
clicking a role on its login page fills them in. The API (DEMO_EMAILS in worker/api.jsonc) stops anyone logged in with
a demo account from changing passwords or other logins. Your own admin from create_admin.py (ECG_ADMIN_EMAIL in .env)
stays private; this script logs in with it to create or reset the demo accounts. Safe to run again.

  * Admin:   admin@detakita.med.id
  * Dokter:  dokter@detakita.med.id, linked to "dr. Andi Pratama, Sp.JP (K)" from the designs
  * Perawat: perawat@detakita.med.id, linked to "Ns. Siti Rahmawati, S.Kep" from the designs
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from setup_db import ECG, load_env  # noqa: E402

API = (ECG / "worker" / "api-url.txt").read_text().strip()
LOGINS = json.loads((ECG / "web" / "src" / "demo-logins.json").read_text())

DOCTOR = {"full_name": "dr. Andi Pratama, Sp.JP (K)", "nik": "3171041982050003", "str_number": "31.1.1.100.2.21.145892",
          "sip_number": "446/1209/IDI/2024", "subspecialty_code": "aritmia",
          "specialty_label": "Spesialis Jantung & Pembuluh Darah • Aritmia",
          "email": "dokter@detakita.med.id", "whatsapp": "+62 811-9824-7711", "patient_quota": 10}
NURSE = {"full_name": "Ns. Siti Rahmawati, S.Kep", "nik": "3273016508940002", "sipp_number": "446/2088/SIPP/2023",
         "str_number": "31.2.1.200.3.22.189402", "position": "Koordinator Perawat Telemetri", "unit_id": 2,
         "shift": "morning", "email": "perawat@detakita.med.id", "whatsapp": "+62 812-7744-9021"}


def call(method, path, token=None, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", "User-Agent": "ecg-tools/1.0",
                                          **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        err = json.loads(e.read() or b"{}").get("error", {})
        sys.exit(f"{method} {path} failed ({e.code}): {err.get('message')} {err.get('fields') or ''}")


def profile(token, kind, data):
    """The doctor/nurse with this NIK: found, or created."""
    rows = call("GET", f"/{kind}?q={urllib.parse.quote(data['full_name'].split(',')[0])}&limit=100", token)["data"]
    found = [r for r in rows if r["nik"] == data["nik"]]
    if found:
        return found[0]["id"]
    row = call("POST", f"/{kind}", token, data)
    print(f"Created {kind[:-1]} {row['full_name']} ({row['code']})")
    return row["id"]


def login_for(token, role, link):
    c = LOGINS[role]
    found = [u for u in call("GET", f"/users?q={urllib.parse.quote(c['email'])}", token)["data"] if u["email"].lower() == c["email"]]
    body = {"name": c["name"], "role": role, **link, "password": c["password"], "is_active": True}
    if found:
        call("PATCH", f"/users/{found[0]['id']}", token, body)
        print(f"Updated demo login {c['email']} ({role})")
    else:
        call("POST", "/users", token, {**body, "email": c["email"]})
        print(f"Created demo login {c['email']} ({role})")


def main():
    load_env()
    email, pw = os.environ.get("ECG_ADMIN_EMAIL"), os.environ.get("ECG_ADMIN_PASSWORD")
    if not email or not pw:
        sys.exit("No private admin in .env: run  python3 ecg/tools/create_admin.py  first")
    if email.lower() in {c["email"] for c in LOGINS.values()}:
        sys.exit("ECG_ADMIN_EMAIL must not be one of the demo emails (it has to stay private)")
    token = call("POST", "/auth/login", body={"email": email, "password": pw})["token"]
    try:
        login_for(token, "admin", {})
        login_for(token, "doctor", {"doctor_id": profile(token, "doctors", DOCTOR)})
        login_for(token, "nurse", {"nurse_id": profile(token, "nurses", NURSE)})
    finally:
        call("POST", "/auth/logout", token)


if __name__ == "__main__":
    main()
