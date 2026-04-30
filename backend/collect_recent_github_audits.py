from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import tarfile
import tempfile
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_REPO = "GalToast/temp-while-comp-at-shop"
DEFAULT_WORKFLOW = "audit-lead.yml"
DEFAULT_KEY = Path.home() / ".audit-encryption-key"
DEFAULT_OPENSSL = Path(r"C:\Program Files\Git\usr\bin\openssl.exe")
DEFAULT_OUT = REPO_ROOT / "ops" / "audit-review"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect recent GitHub audit artifacts into ops/audit-review.")
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--workflow", default=DEFAULT_WORKFLOW)
    parser.add_argument("--since-minutes", type=int, default=60)
    parser.add_argument("--limit", type=int, default=40)
    parser.add_argument("--key-file", default=str(DEFAULT_KEY))
    parser.add_argument("--openssl", default=str(DEFAULT_OPENSSL))
    parser.add_argument("--out-dir", default=str(DEFAULT_OUT))
    return parser.parse_args()


def run(*cmd: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, capture_output=True, check=check)


def gh_json(*args: str) -> object:
    completed = run("gh", *args)
    return json.loads(completed.stdout)


def recent_runs(repo: str, workflow: str, limit: int, since_minutes: int) -> list[dict]:
    rows = gh_json(
        "run",
        "list",
        "--workflow",
        workflow,
        "--limit",
        str(limit),
        "--json",
        "databaseId,status,conclusion,createdAt",
        "--repo",
        repo,
    )
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)
    return [
        row
        for row in rows
        if row["status"] == "completed" and datetime.fromisoformat(row["createdAt"].replace("Z", "+00:00")) >= cutoff
    ]


def artifacts(repo: str, run_id: int) -> list[dict]:
    payload = gh_json("api", f"repos/{repo}/actions/runs/{run_id}/artifacts")
    return list(payload.get("artifacts") or [])


def lead_id(name: str) -> str | None:
    match = re.search(r"audit-(\d+)", name)
    return match.group(1) if match else None


def decrypt(openssl_path: Path, key_file: Path, encrypted: Path, output: Path) -> None:
    run(
        str(openssl_path),
        "enc",
        "-aes-256-cbc",
        "-d",
        "-pbkdf2",
        "-in",
        str(encrypted),
        "-out",
        str(output),
        "-pass",
        f"file:{key_file}",
    )


def collect_one(repo: str, run_id: int, artifact: dict, openssl_path: Path, key_file: Path, out_dir: Path) -> dict:
    item_id = lead_id(str(artifact.get("name") or "")) or "unknown"
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    target = out_dir / f"lead-{item_id}-{stamp}"
    target.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix=f"audit-{item_id}-") as tmp:
        tmpdir = Path(tmp)
        run("gh", "run", "download", str(run_id), "-D", str(tmpdir), "--repo", repo)
        zip_path = next(tmpdir.rglob("*.zip"), None)
        if zip_path:
            with zipfile.ZipFile(zip_path) as archive:
                archive.extractall(tmpdir / "artifact")
        enc = next(tmpdir.rglob("*.enc"), None)
        if not enc:
            return {"runId": run_id, "leadId": item_id, "status": "artifact_missing"}
        tar_path = tmpdir / "audit-results.tar.gz"
        decrypt(openssl_path, key_file, enc, tar_path)
        with tarfile.open(tar_path, "r:gz") as archive:
            archive.extractall(target)

    return {
        "runId": run_id,
        "leadId": item_id,
        "status": "collected",
        "reviewPath": str(target),
        "artifactName": artifact.get("name"),
    }


def main() -> None:
    args = parse_args()
    key_file = Path(args.key_file)
    openssl_path = Path(args.openssl)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for row in recent_runs(args.repo, args.workflow, args.limit, args.since_minutes):
        run_id = int(row["databaseId"])
        items = artifacts(args.repo, run_id)
        if not items:
            rows.append({"runId": run_id, "status": "no_artifacts", "conclusion": row["conclusion"]})
            continue
        for item in items:
            rows.append(
                {
                    "runId": run_id,
                    "conclusion": row["conclusion"],
                    **collect_one(args.repo, run_id, item, openssl_path, key_file, out_dir),
                }
            )

    print(json.dumps({"count": len(rows), "rows": rows}, indent=2))


if __name__ == "__main__":
    main()
