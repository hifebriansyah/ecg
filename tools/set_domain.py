#!/usr/bin/env python3
"""Attach a custom domain to the API Worker (Cloudflare creates the DNS record and the certificate). Stdlib only.

    python3 ecg/tools/set_domain.py                  uses "domain" from worker/api.jsonc (api-ecg.situs.id)
    python3 ecg/tools/set_domain.py other.situs.id

The domain must belong to a zone in the same Cloudflare account. Reads CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from for-fun/.env;
the token needs Account > Workers Scripts > Edit and Zone > Zone > Read (and Zone > DNS > Edit for the record it creates).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from setup_db import ECG, api, load_env, need  # noqa: E402
from deploy_worker import read_config  # noqa: E402
import os  # noqa: E402


def main():
    load_env()
    token, account = os.environ.get("CLOUDFLARE_API_TOKEN"), os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    if not token or not account:
        sys.exit("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env")
    cfg = read_config()
    host = (sys.argv[1] if len(sys.argv) > 1 else cfg.get("domain") or "").strip().lower()
    if not host or "." not in host:
        sys.exit('Give a domain: set "domain" in worker/api.jsonc or pass it as an argument')
    # the zone is the longest suffix of the host that is a zone in this account (api-ecg.situs.id -> situs.id)
    parts, zone = host.split("."), None
    for i in range(len(parts) - 1):
        name = ".".join(parts[i:])
        found = need(api("GET", f"/zones?name={name}&account.id={account}", token), f"Looking up zone {name}")
        if found:
            zone = found[0]
            break
    if not zone:
        sys.exit(f"No Cloudflare zone for {host} in this account")
    res = need(api("PUT", f"/accounts/{account}/workers/domains", token,
                   {"hostname": host, "service": cfg["name"], "zone_id": zone["id"], "environment": "production"}), f"Attaching {host}")
    print(f"{host} -> Worker '{cfg['name']}' (zone {zone['name']}). Certificate and DNS are created by Cloudflare; it can take a minute.")
    (ECG / "worker" / "api-url.txt").write_text(f"https://{host}\n", encoding="utf-8")


if __name__ == "__main__":
    main()
