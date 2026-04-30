from __future__ import annotations

import argparse
import os
from datetime import date
from pathlib import Path
import shutil
import zipfile

REPO_ROOT = Path(".")
DUPE_DIR = REPO_ROOT / "leads" / "duplicates"


def zip_dir(src_dir: Path, zip_path: Path) -> None:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for file_path in src_dir.rglob("*"):
            if file_path.is_dir():
                continue
            rel = file_path.relative_to(REPO_ROOT).as_posix()
            zf.write(file_path, arcname=rel)


def main() -> None:
    parser = argparse.ArgumentParser(description="Archive leads/duplicates to a zip, optionally remove the directory.")
    parser.add_argument("--zip", dest="zip_path", default="", help="Zip output path")
    parser.add_argument("--remove", action="store_true", help="Remove leads/duplicates after successful zip")
    args = parser.parse_args()

    if not DUPE_DIR.exists():
        print("No leads/duplicates directory found.")
        return

    today = date.today().isoformat()
    zip_path = Path(args.zip_path) if args.zip_path else (REPO_ROOT / "reports" / f"leads-duplicates-archive-{today}.zip")
    if zip_path.exists():
        raise SystemExit(f"Zip already exists: {zip_path}")

    zip_dir(DUPE_DIR, zip_path)
    size = zip_path.stat().st_size
    print(f"Wrote: {zip_path.as_posix()} ({size} bytes)")

    if args.remove:
        shutil.rmtree(DUPE_DIR)
        print("Removed: leads/duplicates")


if __name__ == "__main__":
    main()

