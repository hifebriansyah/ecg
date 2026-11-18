#!/usr/bin/env python3
"""Create or reset an admin login in the D1 database "ecg".

    python3 ecg/tools/create_admin.py                       uses ECG_ADMIN_EMAIL / ECG_ADMIN_PASSWORD from .env
    python3 ecg/tools/create_admin.py inara@detakita.med.id Inara

If ECG_ADMIN_PASSWORD is not in .env, a random one is generated and added there (it is never printed).
The password hash matches worker/api.js: pbkdf2$100000$<salt b64>$<sha256 hash b64>.
"""
import base64
import hashlib
import json
import os
import secrets
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from setup_db import ECG, api, load_env, need  # noqa: E402
from deploy_worker import ensure_env  # noqa: E402


def hash_password(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100000, 32)
    return f"pbkdf2$100000${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}"


def main():
    load_env()
    token, account = os.environ.get("CLOUDFLARE_API_TOKEN"), os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    if not token or not account:
        sys.exit("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env")
    email = sys.argv[1] if len(sys.argv) > 1 else ensure_env("ECG_ADMIN_EMAIL", lambda: "inara@detakita.med.id")
    name = sys.argv[2] if len(sys.argv) > 2 else "Inara"
    password = ensure_env("ECG_ADMIN_PASSWORD", lambda: secrets.token_urlsafe(18))
    db_id = json.loads((ECG / "db" / "d1.json").read_text())["database_id"]
    now = int(time.time() * 1000)
    sql = ("INSERT INTO users (name, email, password_hash, role, created_at, updated_at) VALUES (?, ?, ?, 'admin', ?, ?) "
           "ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = 'admin', is_active = 1, updated_at = excluded.updated_at")
    need(api("POST", f"/accounts/{account}/d1/database/{db_id}/query", token,
             {"sql": sql, "params": [name, email, hash_password(password), now, now]}), "Saving the admin")
    print(f"Admin {email} ready (password in .env as ECG_ADMIN_PASSWORD).")


if __name__ == "__main__":
    main()
