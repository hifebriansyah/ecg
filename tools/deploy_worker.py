#!/usr/bin/env python3
"""Upload the DETAKITA API Worker (ecg/worker/api.js) to Cloudflare. Stdlib only, no wrangler.

    python3 ecg/tools/setup_db.py        once: creates the D1 database "ecg" and its tables
    python3 ecg/tools/deploy_worker.py   uploads the Worker, binds D1, sets INGEST_TOKEN, prints its address

Reads CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID and ECG_INGEST_TOKEN from for-fun/.env. If ECG_INGEST_TOKEN is missing,
a random one is generated and added to .env (the Holter device / mobile app sends it as the X-Ingest-Key header).
The token needs Account > Workers Scripts > Edit and Account > D1 > Edit.
"""
import json
import secrets
import sys
import urllib.request
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from setup_db import BASE, ECG, ENV_FILE, api, load_env, need  # noqa: E402
import os  # noqa: E402


def read_config():
    text = (ECG / "worker" / "api.jsonc").read_text(encoding="utf-8")
    return json.loads("\n".join(l for l in text.splitlines() if not l.strip().startswith("//")))


def ensure_env(name, make):
    """Value from .env, or a new one appended to .env (never printed)."""
    if os.environ.get(name):
        return os.environ[name]
    value = make()
    with ENV_FILE.open("a", encoding="utf-8") as f:
        f.write(f"\n{name}={value}\n")
    os.environ[name] = value
    print(f"Added {name} to .env")
    return value


def main():
    load_env()
    token, account = os.environ.get("CLOUDFLARE_API_TOKEN"), os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    if not token or not account:
        sys.exit("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env")
    cfg = read_config()
    db_file = ECG / "db" / "d1.json"
    if not db_file.exists():
        sys.exit("db/d1.json is missing: run  python3 ecg/tools/setup_db.py  first")
    code = (ECG / "worker" / cfg["main"]).read_text(encoding="utf-8")
    bindings = [{"type": "d1", "name": cfg["d1"]["binding"], "id": json.loads(db_file.read_text())["database_id"]}]
    bindings += [{"type": "plain_text", "name": k, "text": v} for k, v in cfg.get("vars", {}).items()]
    bindings += [{"type": "durable_object_namespace", "name": o["name"], "class_name": o["class_name"]} for o in cfg.get("durable_objects", [])]
    metadata = {"main_module": cfg["main"], "compatibility_date": cfg["compatibility_date"], "bindings": bindings,
                "keep_bindings": ["secret_text"]}

    def upload(meta):
        boundary = uuid.uuid4().hex
        body = b""
        for name, filename, ctype, content in [("metadata", None, "application/json", json.dumps(meta)),
                                               (cfg["main"], cfg["main"], "application/javascript+module", code)]:
            disp = f'form-data; name="{name}"' + (f'; filename="{filename}"' if filename else "")
            body += f"--{boundary}\r\nContent-Disposition: {disp}\r\nContent-Type: {ctype}\r\n\r\n{content}\r\n".encode()
        body += f"--{boundary}--\r\n".encode()
        req = urllib.request.Request(
            f"{BASE}/accounts/{account}/workers/scripts/{cfg['name']}", data=body, method="PUT",
            headers={"Authorization": f"Bearer {token}", "Content-Type": f"multipart/form-data; boundary={boundary}", "User-Agent": "ecg-deploy/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.loads(res.read()), None
        except urllib.error.HTTPError as e:
            return None, f"HTTP {e.code}\n{e.read().decode('utf-8', 'replace')[:600]}"

    # The Durable Object class is registered by a migration. Sending the same migration tag again is refused, so on that refusal
    # upload again without it (the class already exists).
    mig = cfg.get("migration")
    payload, err = upload({**metadata, "migrations": {"new_tag": mig["tag"], "new_sqlite_classes": mig["new_sqlite_classes"]}} if mig else metadata)
    if err and mig and "migration" in err.lower():
        print("Migration already applied; uploading without it.")
        payload, err = upload(metadata)
    if err:
        sys.exit(f"Deploy failed: {err}")
    if not payload.get("success"):
        sys.exit(f"Deploy failed: {payload.get('errors')}")
    print(f"Deployed worker '{cfg['name']}' ({len(code)} bytes).")

    ingest = ensure_env("ECG_INGEST_TOKEN", lambda: secrets.token_urlsafe(32))
    need(api("PUT", f"/accounts/{account}/workers/scripts/{cfg['name']}/secrets", token,
             {"name": "INGEST_TOKEN", "text": ingest, "type": "secret_text"}), "Setting INGEST_TOKEN")
    print("Secret INGEST_TOKEN set on the Worker.")

    # Always keep the <account>.workers.dev address on; the custom domain ("domain" in api.jsonc, see set_domain.py) is the public one.
    need(api("POST", f"/accounts/{account}/workers/scripts/{cfg['name']}/subdomain", token, {"enabled": True}), "Turning on workers.dev")
    sub = need(api("GET", f"/accounts/{account}/workers/subdomain", token), "Reading the workers.dev subdomain")["subdomain"]
    url = f"https://{cfg['name']}.{sub}.workers.dev"
    public = f"https://{cfg['domain']}" if cfg.get("domain") else url
    (ECG / "worker" / "api-url.txt").write_text(public + "\n", encoding="utf-8")
    print(f"API: {public}" + (f"  (also {url})" if public != url else ""))


if __name__ == "__main__":
    main()
