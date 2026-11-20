#!/usr/bin/env python3
"""Create (or find) the Cloudflare D1 database "ecg" and apply db/schema.sql to it.
Stdlib only, no wrangler. Safe to run again: the schema is all IF NOT EXISTS / INSERT OR IGNORE.

    python3 ecg/tools/setup_db.py        (writes ecg/db/d1.json with the database id)

Reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from the environment or from for-fun/.env.
The token needs Account > D1 > Edit.
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ECG = Path(__file__).resolve().parent.parent
ENV_FILE = ECG.parent / ".env"
BASE = "https://api.cloudflare.com/client/v4"
DB_NAME = "ecg"


def load_env():
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def api(method, path, token, body=None):
    req = urllib.request.Request(
        f"{BASE}{path}", method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "User-Agent": "ecg-setup/1.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        try:
            return json.loads(e.read())
        except Exception:
            return {"success": False, "errors": [{"message": f"HTTP {e.code}"}]}


def need(payload, what):
    if not payload.get("success"):
        errors = "; ".join(e.get("message", "?") for e in payload.get("errors", []))
        sys.exit(f"{what} failed: {errors}")
    return payload["result"]


def database(account, token):
    found = need(api("GET", f"/accounts/{account}/d1/database?name={DB_NAME}", token), "Listing D1 databases")
    for db in found:
        if db["name"] == DB_NAME:
            print(f"D1 database '{DB_NAME}' exists ({db['uuid'][:8]}...)")
            return db["uuid"]
    created = need(api("POST", f"/accounts/{account}/d1/database", token, {"name": DB_NAME}), "Creating the D1 database")
    print(f"Created D1 database '{DB_NAME}' ({created['uuid'][:8]}...)")
    return created["uuid"]


def ensure_columns(account, token, db_id):
    """Columns added after the first release (CREATE TABLE IF NOT EXISTS cannot add them to an existing table)."""
    url = f"/accounts/{account}/d1/database/{db_id}/query"
    for table, column, ddl in [("users", "group_id", "ALTER TABLE users ADD COLUMN group_id INTEGER REFERENCES user_groups(id) ON DELETE SET NULL")]:
        rows = need(api("POST", url, token, {"sql": f"PRAGMA table_info({table})"}), f"Reading {table}")[0]["results"]
        if rows and column not in [r["name"] for r in rows]:
            need(api("POST", url, token, {"sql": ddl}), f"Adding {table}.{column}")
            print(f"Added column {table}.{column}")


def main():
    load_env()
    token, account = os.environ.get("CLOUDFLARE_API_TOKEN"), os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    if not token or not account:
        sys.exit("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env")
    db_id = database(account, token)
    ensure_columns(account, token, db_id)
    # D1 always enforces foreign keys; it does not accept the PRAGMA line meant for local SQLite.
    sql = "\n".join(l for l in (ECG / "db" / "schema.sql").read_text(encoding="utf-8").splitlines()
                    if not l.strip().upper().startswith("PRAGMA"))
    need(api("POST", f"/accounts/{account}/d1/database/{db_id}/query", token, {"sql": sql}), "Applying db/schema.sql")
    rows = need(api("POST", f"/accounts/{account}/d1/database/{db_id}/query", token,
                    {"sql": "SELECT type, name FROM sqlite_master WHERE type IN ('table','view') "
                            "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name"}),
                "Listing tables")[0]["results"]
    (ECG / "db" / "d1.json").write_text(json.dumps({"name": DB_NAME, "database_id": db_id}, indent=2) + "\n", encoding="utf-8")
    print("Schema applied:", ", ".join(f"{r['name']} ({r['type']})" for r in rows))


if __name__ == "__main__":
    main()
