from __future__ import annotations

import json
import shutil
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DESKTOP_TEMP = Path(r"C:\Users\HP\Desktop\Temp")
DESKTOP_TYPO = Path(r"C:\Users\HP\Desktop\Temp while my comp is the shop")
RECOVERY_ROOT = REPO_ROOT / "artifacts" / "desktop-fragment-recovery-2026-03-21"
HOSTINGER_ARCHIVE = REPO_ROOT / "artifacts" / "hostinger-mail-archive-2026-03-21"


def move_if_exists(src: Path, dst: Path, moved: list[dict[str, str]], kind: str) -> None:
    if not src.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    moved.append(
        {
            "kind": kind,
            "from": str(src),
            "to": str(dst),
        }
    )


def remove_if_empty(path: Path, removed: list[str]) -> None:
    if not path.exists():
        return
    try:
        next(path.iterdir())
        return
    except StopIteration:
        path.rmdir()
        removed.append(str(path))
    except Exception:
        return


def remove_empty_parents(start: Path, stop_at: Path, removed: list[str]) -> None:
    current = start
    while True:
        if current == stop_at:
            remove_if_empty(current, removed)
            break
        remove_if_empty(current, removed)
        if not current.exists():
            current = current.parent
            continue
        break


def main() -> None:
    moved: list[dict[str, str]] = []
    removed_dirs: list[str] = []

    # Recover Hostinger review artifacts from Desktop Temp into the Hostinger archive.
    move_if_exists(
        DESKTOP_TEMP / "reports" / "hostinger-batch-23-review-2026-03-20.md",
        HOSTINGER_ARCHIVE / "reports" / "hostinger-batch-23-review-2026-03-20.md",
        moved,
        "hostinger-archive",
    )
    move_if_exists(
        DESKTOP_TEMP / "tmp" / "hostinger-batch-23-review-2026-03-20.json",
        HOSTINGER_ARCHIVE / "tmp" / "hostinger-batch-23-review-2026-03-20.json",
        moved,
        "hostinger-archive",
    )
    move_if_exists(
        DESKTOP_TEMP / "tmp" / "batch6_review.json",
        HOSTINGER_ARCHIVE / "tmp" / "batch6_review.json",
        moved,
        "hostinger-archive",
    )

    # Recover the V380 research note into repo research.
    move_if_exists(
        DESKTOP_TEMP / "research_scout_v380_dp04_firmware_extraction.md",
        REPO_ROOT / "research" / "research_scout_v380_dp04_firmware_extraction.md",
        moved,
        "research",
    )

    # Preserve the typo-folder deep audit without overwriting the existing repo file.
    typo_file = DESKTOP_TYPO / "leads" / "profiles" / "1200-1299" / "1294-campobella-bronze-fine-art" / "evidence" / "deep-audit-2026-03-18.md"
    move_if_exists(
        typo_file,
        RECOVERY_ROOT / "temp-while-my-comp-is-the-shop" / "1294-campobella-bronze-fine-art" / "deep-audit-2026-03-18.md",
        moved,
        "preserve-mismatch",
    )

    # Remove now-empty directory chains where possible.
    remove_empty_parents(DESKTOP_TEMP / "reports", DESKTOP_TEMP, removed_dirs)
    remove_empty_parents(DESKTOP_TEMP / "tmp", DESKTOP_TEMP, removed_dirs)
    remove_empty_parents(DESKTOP_TYPO / "leads" / "profiles" / "1200-1299" / "1294-campobella-bronze-fine-art" / "evidence", DESKTOP_TYPO, removed_dirs)

    RECOVERY_ROOT.mkdir(parents=True, exist_ok=True)
    manifest = {
        "moved_count": len(moved),
        "removed_empty_dirs": removed_dirs,
        "moved": moved,
    }
    (RECOVERY_ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Desktop Fragment Recovery 2026-03-21",
        "",
        "Purpose: safely recover stray Desktop fragment files into the repo or repo archives without overwriting conflicting files.",
        "",
        f"- Moved: {len(moved)}",
        f"- Empty directories removed: {len(removed_dirs)}",
        "",
        "## Moved",
    ]
    lines.extend(f"- `{item['from']}` -> `{item['to']}` ({item['kind']})" for item in moved)
    lines.append("")
    lines.append("## Removed Empty Directories")
    lines.extend(f"- `{path}`" for path in removed_dirs)
    (RECOVERY_ROOT / "README.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

    print(f"moved={len(moved)}")
    print(f"removed_empty_dirs={len(removed_dirs)}")


if __name__ == "__main__":
    main()
