from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply folder moves for status-folder mismatch remediation.")
    parser.add_argument("--root", default=".", help="Repo root path.")
    parser.add_argument("--moves", required=True, help="Path to JSON move list.")
    parser.add_argument("--result-out", required=True, help="Path to write JSON result log.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report without moving files.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    moves_path = Path(args.moves)
    result_path = Path(args.result_out)
    if not moves_path.is_absolute():
        moves_path = root / moves_path
    if not result_path.is_absolute():
        result_path = root / result_path

    moves = json.loads(moves_path.read_text(encoding="utf-8"))

    applied: list[dict] = []
    skipped: list[dict] = []

    for item in moves:
        src_dir = root / item["src_dir"]
        dst_dir = root / item["dst_dir"]
        reason = item.get("reason", "unknown")

        if not src_dir.exists():
            skipped.append(
                {
                    "src_dir": item["src_dir"],
                    "dst_dir": item["dst_dir"],
                    "reason": reason,
                    "skip_reason": "source_missing",
                }
            )
            continue

        if dst_dir.exists():
            skipped.append(
                {
                    "src_dir": item["src_dir"],
                    "dst_dir": item["dst_dir"],
                    "reason": reason,
                    "skip_reason": "destination_exists",
                }
            )
            continue

        if not args.dry_run:
            dst_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src_dir), str(dst_dir))

        applied.append(
            {
                "src_dir": item["src_dir"],
                "dst_dir": item["dst_dir"],
                "reason": reason,
            }
        )

    result = {
        "dry_run": args.dry_run,
        "moves_file": moves_path.as_posix(),
        "applied_count": len(applied),
        "skipped_count": len(skipped),
        "applied": applied,
        "skipped": skipped,
    }

    result_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.write_text(json.dumps(result, indent=2), encoding="utf-8")

    print(f"Applied: {len(applied)}")
    print(f"Skipped: {len(skipped)}")
    print(f"Result: {result_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

