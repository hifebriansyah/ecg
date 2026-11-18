#!/usr/bin/env python3
"""Make one login per role (Admin, Dokter, Perawat) for local testing, and let the login screen fill them in.

    python3 ecg/tools/create_demo_logins.py

What it does (safe to run again):
  * Dokter: the doctor "dr. Andi Pratama, Sp.JP (K)" from the designs, with login dokter@detakita.med.id.
  * Perawat: the nurse "Ns. Siti Rahmawati, S.Kep" from the designs, with login perawat@detakita.med.id.
  * Admin: the existing admin from .env (ECG_ADMIN_EMAIL / ECG_ADMIN_PASSWORD, see create_admin.py).
  * Passwords live in for-fun/.env (ECG_DOCTOR_PASSWORD, ECG_NURSE_PASSWORD; generated when missing, never printed).
  * Writes them to ecg/web/.env.local as VITE_DEMO_LOGINS, which git ignores. The login screen then fills in email and
    password when a role is clicked. Only for local builds: a build made with this file has the passwords inside it.
"""
import json
import urllib.parse
import os
import secrets
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from setup_db import ECG, load_env  # noqa: E402
from deploy_worker import ensure_env  # noqa: E402

API = (ECG / "worker" / "api-url.txt").read_text().strip()
ENV_LOCAL = ECG / "web" / ".env.local"

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
    found = [r for r in call("GET", f"/{kind}?q={urllib.parse.quote(data['full_name'].split(',')[0])}&limit=100", token)["data"]
             if r["nik"] == data["nik"]]
    if found:
        return found[0]["id"]
    row = call("POST", f"/{kind}", token, data)
    print(f"Created {kind[:-1]} {row['full_name']} ({row['code']})")
    return row["id"]


def login_for(token, role, email, name, link, password):
    """The login with this email: created, or set to this role/profile/password."""
    found = [u for u in call("GET", f"/users?q={urllib.parse.quote(email)}", token)["data"] if u["email"].lower() == email]
    body = {"name": name, "role": role, **link, "password": password, "is_active": True}
    if found:
        call("PATCH", f"/users/{found[0]['id']}", token, body)
        print(f"Updated login {email} ({role})")
    else:
        call("POST", "/users", token, {**body, "email": email})
        print(f"Created login {email} ({role})")


def write_env_local(logins):
    lines = []
    if ENV_LOCAL.exists():
        lines = [l for l in ENV_LOCAL.read_text(encoding="utf-8").splitlines() if not l.startswith("VITE_DEMO_LOGINS=")]
    lines.append("VITE_DEMO_LOGINS=" + json.dumps(logins, separators=(",", ":")))
    ENV_LOCAL.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote VITE_DEMO_LOGINS to {ENV_LOCAL.relative_to(ECG.parent)} (git-ignored)")


def main():
    load_env()
    admin_email, admin_pw = os.environ.get("ECG_ADMIN_EMAIL"), os.environ.get("ECG_ADMIN_PASSWORD")
    if not admin_email or not admin_pw:
        sys.exit("No admin in .env: run  python3 ecg/tools/create_admin.py  first")
    token = call("POST", "/auth/login", body={"email": admin_email, "password": admin_pw})["token"]
    try:
        doctor_pw = ensure_env("ECG_DOCTOR_PASSWORD", lambda: secrets.token_urlsafe(15))
        nurse_pw = ensure_env("ECG_NURSE_PASSWORD", lambda: secrets.token_urlsafe(15))
        login_for(token, "doctor", DOCTOR["email"], "Andi Pratama", {"doctor_id": profile(token, "doctors", DOCTOR)}, doctor_pw)
        login_for(token, "nurse", NURSE["email"], "Siti Rahmawati", {"nurse_id": profile(token, "nurses", NURSE)}, nurse_pw)
    finally:
        call("POST", "/auth/logout", token)
    write_env_local({
        "admin": {"email": admin_email, "password": admin_pw},
        "doctor": {"email": DOCTOR["email"], "password": doctor_pw},
        "nurse": {"email": NURSE["email"], "password": nurse_pw},
    })


if __name__ == "__main__":
    main()
