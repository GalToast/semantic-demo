from __future__ import annotations

import json
import shutil
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
ROOT_ARCHIVE = REPO_ROOT / "artifacts" / "root-loose-archive-2026-03-21"
CAMERA_TOOLS = REPO_ROOT / "tools" / "camera" / "root-workspace"

ROOT_PNG_NAMES = {
    p.name
    for p in REPO_ROOT.glob("*.png")
}
ROOT_HTML_NAMES = {
    p.name
    for p in REPO_ROOT.glob("*.html")
}
ROOT_TMP_WEB_NAMES = {
    p.name
    for p in REPO_ROOT.glob("tmp_*")
    if p.is_file() and p.suffix.lower() in {".html", ".js"}
}
ROOT_SNAPSHOT_MD_NAMES = {
    p.name
    for p in REPO_ROOT.glob("*.md")
    if "snapshot" in p.name.lower()
}

CAMERA_FILE_NAMES = {
    "camera_ap_probe.ps1",
    "camera_range_scan.py",
    "camera_scanner.py",
    "camera_telnet.py",
    "camera_udp_probe.py",
    "camera_viewer.html",
    "camera_viewer.py",
    "find_camera.py",
    "find_camera_web.py",
    "probe_camera_ap.bat",
    "scan_camera.bat",
    "scan_my_camera.bat",
    "start_camera.bat",
    "port_scan.py",
    "ceshi.ini",
    "ceshi_enhanced.ini",
    "V380FTP.zip",
}


def move_file(src: Path, dst: Path, moved: list[dict[str, str]], kind: str) -> None:
    if not src.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))
    moved.append(
        {
            "kind": kind,
            "from": str(src.relative_to(REPO_ROOT)).replace("\\", "/"),
            "to": str(dst.relative_to(REPO_ROOT)).replace("\\", "/"),
        }
    )


def main() -> None:
    moved: list[dict[str, str]] = []

    for name in sorted(ROOT_PNG_NAMES):
        src = REPO_ROOT / name
        move_file(src, ROOT_ARCHIVE / "root-png" / name, moved, "root-png")

    for name in sorted(ROOT_HTML_NAMES):
        if name in CAMERA_FILE_NAMES:
            continue
        src = REPO_ROOT / name
        move_file(src, ROOT_ARCHIVE / "root-html" / name, moved, "root-html")

    for name in sorted(ROOT_TMP_WEB_NAMES):
        src = REPO_ROOT / name
        move_file(src, ROOT_ARCHIVE / "root-temp-web" / name, moved, "root-temp-web")

    for name in sorted(ROOT_SNAPSHOT_MD_NAMES):
        src = REPO_ROOT / name
        move_file(src, ROOT_ARCHIVE / "root-snapshot-md" / name, moved, "root-snapshot-md")

    for name in sorted(CAMERA_FILE_NAMES):
        src = REPO_ROOT / name
        move_file(src, CAMERA_TOOLS / name, moved, "camera-tools")

    ROOT_ARCHIVE.mkdir(parents=True, exist_ok=True)
    manifest = {
        "archive_root": str(ROOT_ARCHIVE.relative_to(REPO_ROOT)).replace("\\", "/"),
        "camera_root": str(CAMERA_TOOLS.relative_to(REPO_ROOT)).replace("\\", "/"),
        "moved_count": len(moved),
        "moved": moved,
    }
    (ROOT_ARCHIVE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    lines = [
        "# Root Workspace Artifact Reorg 2026-03-21",
        "",
        "Purpose: reduce root-level clutter by moving loose screenshots, HTML snapshots, temp web artifacts, and snapshot markdown notes into a dated archive tree, and grouping camera utility files under tools/camera.",
        "",
        f"- Moved: {len(moved)}",
        f"- Archive root: `{ROOT_ARCHIVE.relative_to(REPO_ROOT).as_posix()}`",
        f"- Camera tools root: `{CAMERA_TOOLS.relative_to(REPO_ROOT).as_posix()}`",
        "",
        "## Moved Paths",
    ]
    lines.extend(f"- `{item['from']}` -> `{item['to']}`" for item in moved)
    (ROOT_ARCHIVE / "README.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

    print(f"moved={len(moved)}")
    print(ROOT_ARCHIVE.relative_to(REPO_ROOT).as_posix())
    print(CAMERA_TOOLS.relative_to(REPO_ROOT).as_posix())


if __name__ == "__main__":
    main()
