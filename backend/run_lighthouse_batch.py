#!/usr/bin/env python3
"""
Run Lighthouse in batch mode against lead websites using a custom throttle profile.

Default profile is tuned to approximate a mid-5G mobile experience:
- RTT: 40ms
- Throughput: 15000 Kbps
- CPU slowdown: 1.5x
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse


def safe_slug(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower()).strip("-")
    return value[:80] or "lead"


def normalize_url(url: str) -> str:
    u = (url or "").strip()
    if not u:
        return ""
    if not u.startswith(("http://", "https://")):
        u = "https://" + u
    return u


def lighthouse_cmd(
    npx_bin: str,
    url: str,
    out_json: Path,
    chrome_flags: str,
    rtt_ms: int,
    throughput_kbps: int,
    cpu_slowdown: float,
) -> list[str]:
    return [
        npx_bin,
        "--yes",
        "lighthouse",
        url,
        "--only-categories=performance,accessibility,best-practices,seo",
        "--output=json",
        f"--output-path={str(out_json)}",
        f"--chrome-flags={chrome_flags}",
        "--throttling-method=devtools",
        f"--throttling.rttMs={rtt_ms}",
        f"--throttling.throughputKbps={throughput_kbps}",
        f"--throttling.cpuSlowdownMultiplier={cpu_slowdown}",
        "--screenEmulation.mobile=true",
        "--quiet",
    ]


def parse_lighthouse_json(path: Path) -> dict:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8", errors="replace"))
    cats = data.get("categories", {})
    audits = data.get("audits", {})

    def cat_score(key: str) -> float | None:
        score = (cats.get(key) or {}).get("score")
        return None if score is None else round(score * 100, 1)

    def audit_value(key: str) -> float | None:
        val = (audits.get(key) or {}).get("numericValue")
        if val is None:
            return None
        return round(float(val), 1)

    return {
        "performance": cat_score("performance"),
        "accessibility": cat_score("accessibility"),
        "best_practices": cat_score("best-practices"),
        "seo": cat_score("seo"),
        "fcp_ms": audit_value("first-contentful-paint"),
        "lcp_ms": audit_value("largest-contentful-paint"),
        "tbt_ms": audit_value("total-blocking-time"),
        "cls": (audits.get("cumulative-layout-shift") or {}).get("numericValue"),
        "speed_index_ms": audit_value("speed-index"),
        "tti_ms": audit_value("interactive"),
    }


def run_one(
    row: dict,
    index: int,
    out_dir: Path,
    npx_bin: str,
    timeout_sec: int,
    chrome_flags: str,
    rtt_ms: int,
    throughput_kbps: int,
    cpu_slowdown: float,
) -> dict:
    lead_id = str(row.get("lead_id") or row.get("LeadID") or row.get("id") or "").strip()
    name = (row.get("name") or row.get("Name") or "").strip()
    email = (row.get("email") or row.get("Email") or "").strip()
    website_raw = row.get("website") or row.get("Website") or ""
    website = normalize_url(website_raw)
    if not website:
        return {
            "lead_id": lead_id,
            "name": name,
            "email": email,
            "website": website_raw,
            "status": "skipped_no_website",
        }

    parsed = urlparse(website)
    host = parsed.netloc or safe_slug(website)
    stem = f"{index:04d}-{safe_slug(lead_id or name or host)}"
    lead_dir = out_dir / stem
    lead_dir.mkdir(parents=True, exist_ok=True)
    out_json = lead_dir / "lighthouse-mid5g.json"
    stderr_path = lead_dir / "lighthouse-stderr.txt"

    # Windows often throws EPERM when Lighthouse/Chrome tries to clean temp dirs.
    # Use a dedicated per-target user data dir to reduce profile cleanup contention.
    profile_root = Path(os.environ.get("TEMP", ".")) / "lh-profiles"
    profile_root.mkdir(parents=True, exist_ok=True)
    profile_dir = profile_root / stem
    profile_dir.mkdir(parents=True, exist_ok=True)
    effective_chrome_flags = f"{chrome_flags} --user-data-dir={profile_dir}"

    cmd = lighthouse_cmd(
        npx_bin,
        website,
        out_json,
        effective_chrome_flags,
        rtt_ms,
        throughput_kbps,
        cpu_slowdown,
    )

    started = time.time()
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            check=False,
        )
        duration = round(time.time() - started, 2)
        if proc.stderr:
            stderr_path.write_text(proc.stderr, encoding="utf-8")

        metrics = parse_lighthouse_json(out_json)
        if metrics:
            row_out = {
                "lead_id": lead_id,
                "name": name,
                "email": email,
                "website": website,
                "status": "ok",
                "duration_sec": duration,
            }
            if proc.returncode != 0:
                row_out["error"] = f"lighthouse_exit_{proc.returncode}_with_json"
            row_out.update(metrics)
            return row_out

        if proc.returncode != 0:
            return {
                "lead_id": lead_id,
                "name": name,
                "email": email,
                "website": website,
                "status": "error",
                "error": f"lighthouse_exit_{proc.returncode}",
                "duration_sec": duration,
            }

        return {
            "lead_id": lead_id,
            "name": name,
            "email": email,
            "website": website,
            "status": "error",
            "error": "missing_or_invalid_json",
            "duration_sec": duration,
        }
    except subprocess.TimeoutExpired:
        duration = round(time.time() - started, 2)
        return {
            "lead_id": lead_id,
            "name": name,
            "email": email,
            "website": website,
            "status": "timeout",
            "error": f"timeout_{timeout_sec}s",
            "duration_sec": duration,
        }


def load_rows(input_csv: Path) -> list[dict]:
    with input_csv.open("r", encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Batch Lighthouse runner with custom mid-5G throttle profile."
    )
    ap.add_argument("--input-csv", required=True, help="Input CSV with website column.")
    ap.add_argument(
        "--out-dir",
        required=True,
        help="Output directory for per-lead JSON files and summary CSV.",
    )
    ap.add_argument("--max-workers", type=int, default=2)
    ap.add_argument("--timeout-sec", type=int, default=180)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--rtt-ms", type=int, default=40)
    ap.add_argument("--throughput-kbps", type=int, default=15000)
    ap.add_argument("--cpu-slowdown", type=float, default=1.5)
    ap.add_argument(
        "--chrome-flags",
        default="--headless=new --no-sandbox",
        help="Flags passed to Lighthouse chrome launcher.",
    )
    args = ap.parse_args()

    input_csv = Path(args.input_csv)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = load_rows(input_csv)
    if args.limit and args.limit > 0:
        rows = rows[: args.limit]

    npx_bin = shutil.which("npx") or shutil.which("npx.cmd") or "npx.cmd"

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=max(1, args.max_workers)) as ex:
        futures = {
            ex.submit(
                run_one,
                row,
                i,
                out_dir,
                npx_bin,
                args.timeout_sec,
                args.chrome_flags,
                args.rtt_ms,
                args.throughput_kbps,
                args.cpu_slowdown,
            ): i
            for i, row in enumerate(rows, start=1)
        }
        for fut in as_completed(futures):
            results.append(fut.result())

    results.sort(key=lambda r: (r.get("status") != "ok", r.get("lead_id", ""), r.get("name", "")))

    out_csv = out_dir / "lighthouse-mid5g-summary.csv"
    fieldnames = [
        "lead_id",
        "name",
        "email",
        "website",
        "status",
        "error",
        "duration_sec",
        "performance",
        "accessibility",
        "best_practices",
        "seo",
        "fcp_ms",
        "lcp_ms",
        "tbt_ms",
        "cls",
        "speed_index_ms",
        "tti_ms",
    ]
    with out_csv.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in results:
            w.writerow(r)

    ok = sum(1 for r in results if r.get("status") == "ok")
    timeout = sum(1 for r in results if r.get("status") == "timeout")
    err = sum(1 for r in results if r.get("status") == "error")
    skip = sum(1 for r in results if r.get("status", "").startswith("skipped"))

    print(f"rows={len(results)} ok={ok} timeout={timeout} error={err} skipped={skip}")
    print(f"summary_csv={out_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
