from __future__ import annotations

import argparse
import json
import subprocess
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
import re


DEFAULT_ALLOWED_ROOT_DIRS = {
    ".gemini",
    ".git",
    ".opencode",
    ".playwright-cli",
    ".playwright-mcp",
    ".vscode",
    "ai-models",
    "assets",
    "budget",
    "clients",
    "content",
    "Dev",
    "downloads",
    "leads",
    "mockups",
    "node_modules",
    "notes",
    "opencode-skills",
    "ops",
    "output",
    "outreach",
    "reports",
    "scripts",
    "tmp",
    "tools",
}

DEFAULT_ALLOWED_ROOT_FILES = {
    ".gitignore",
    "AGENTS.md",
    "README.md",
    "crm.sqlite",
    "good-neighbor-policy.md",
    "leads.csv",
    "leads.md",
    "memory.md",
    "opencode.json",
    "repo-index.md",
}


@dataclass
class RootEntry:
    path: str
    kind: str
    size_mb: float | None
    child_count: int | None


@dataclass
class LargeRootFile:
    path: str
    size_mb: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Report repo-hygiene drift at the root level."
    )
    parser.add_argument("--root", default=".", help="Repo root path (default: current directory).")
    parser.add_argument(
        "--write-report",
        action="store_true",
        help="Write a markdown report to ops/reports/repo-hygiene (or --report-path).",
    )
    parser.add_argument("--report-path", default=None, help="Optional explicit markdown report output path.")
    parser.add_argument("--json-out", default=None, help="Optional path to write JSON output.")
    parser.add_argument(
        "--large-root-file-mb",
        type=float,
        default=1.0,
        help="Report root files at or above this size in MB (default: 1.0).",
    )
    parser.add_argument(
        "--fail-on-findings",
        action="store_true",
        help="Exit with status 1 when findings are present.",
    )
    return parser.parse_args()


def normalize_token(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def root_entries(repo_root: Path) -> list[Path]:
    return sorted(repo_root.iterdir(), key=lambda item: item.name.lower())


def direct_child_count(path: Path) -> int:
    try:
        return sum(1 for _ in path.iterdir())
    except OSError:
        return 0


def build_root_inventory(repo_root: Path) -> list[RootEntry]:
    rows: list[RootEntry] = []
    for item in root_entries(repo_root):
        if item.is_dir():
            rows.append(
                RootEntry(
                    path=item.name,
                    kind="dir",
                    size_mb=None,
                    child_count=direct_child_count(item),
                )
            )
            continue
        try:
            size_mb = round(item.stat().st_size / (1024 * 1024), 2)
        except OSError:
            size_mb = None
        rows.append(RootEntry(path=item.name, kind="file", size_mb=size_mb, child_count=None))
    return rows


def find_root_drift(repo_root: Path) -> tuple[list[str], list[str]]:
    unexpected_dirs: list[str] = []
    unexpected_files: list[str] = []
    for item in root_entries(repo_root):
        if item.is_dir():
            if item.name not in DEFAULT_ALLOWED_ROOT_DIRS:
                unexpected_dirs.append(item.name)
        elif item.name not in DEFAULT_ALLOWED_ROOT_FILES:
            unexpected_files.append(item.name)
    return unexpected_dirs, unexpected_files


def find_large_root_files(repo_root: Path, threshold_mb: float) -> list[LargeRootFile]:
    findings: list[LargeRootFile] = []
    for item in root_entries(repo_root):
        if not item.is_file():
            continue
        size_mb = item.stat().st_size / (1024 * 1024)
        if size_mb < threshold_mb:
            continue
        findings.append(LargeRootFile(path=item.name, size_mb=round(size_mb, 2)))
    return sorted(findings, key=lambda item: (-item.size_mb, item.path.lower()))


def git_root_untracked_entries(repo_root: Path) -> list[str]:
    try:
        proc = subprocess.run(
            ["git", "-C", str(repo_root), "status", "--short", "--untracked-files=all"],
            check=True,
            capture_output=True,
            text=True,
        )
    except (OSError, subprocess.CalledProcessError):
        return []

    findings: set[str] = set()
    for raw_line in proc.stdout.splitlines():
        if not raw_line.startswith("?? "):
            continue
        rel_path = raw_line[3:].strip().replace("\\", "/")
        if "/" in rel_path:
            continue
        findings.add(rel_path.rstrip("/"))
    return sorted(findings)


def find_path_shadow_dirs(repo_root: Path) -> list[str]:
    absolute_root_token = normalize_token(str(repo_root.resolve()))
    repo_name_token = normalize_token(repo_root.name)
    drive_token = normalize_token(repo_root.drive)
    findings: list[str] = []
    for item in root_entries(repo_root):
        if not item.is_dir():
            continue
        token = normalize_token(item.name)
        if not token:
            continue
        if token == drive_token:
            findings.append(item.name)
            continue
        if len(token) >= 20 and token != repo_name_token and token in absolute_root_token:
            findings.append(item.name)
    return sorted(set(findings))


def build_result(repo_root: Path, threshold_mb: float) -> dict:
    inventory = build_root_inventory(repo_root)
    unexpected_dirs, unexpected_files = find_root_drift(repo_root)
    large_root_files = find_large_root_files(repo_root, threshold_mb)
    root_untracked = git_root_untracked_entries(repo_root)
    path_shadow_dirs = find_path_shadow_dirs(repo_root)

    findings_total = (
        len(unexpected_dirs)
        + len(unexpected_files)
        + len(large_root_files)
        + len(root_untracked)
        + len(path_shadow_dirs)
    )

    return {
        "generated": date.today().isoformat(),
        "root": str(repo_root.resolve()),
        "summary": {
            "root_entries": len(inventory),
            "unexpected_root_dirs": len(unexpected_dirs),
            "unexpected_root_files": len(unexpected_files),
            "large_root_files": len(large_root_files),
            "root_untracked_entries": len(root_untracked),
            "path_shadow_dirs": len(path_shadow_dirs),
            "findings_total": findings_total,
        },
        "inventory": [asdict(item) for item in inventory],
        "findings": {
            "unexpected_root_dirs": unexpected_dirs,
            "unexpected_root_files": unexpected_files,
            "large_root_files": [asdict(item) for item in large_root_files],
            "root_untracked_entries": root_untracked,
            "path_shadow_dirs": path_shadow_dirs,
        },
    }


def inventory_markdown(inventory: list[dict]) -> list[str]:
    lines = ["## Root Inventory", ""]
    for item in inventory:
        if item["kind"] == "dir":
            lines.append(
                "- `{path}` dir | direct_children={children}".format(
                    path=item["path"],
                    children=item["child_count"],
                )
            )
        else:
            lines.append(
                "- `{path}` file | size_mb={size}".format(
                    path=item["path"],
                    size=item["size_mb"],
                )
            )
    lines.append("")
    return lines


def simple_section(title: str, values: list[str]) -> list[str]:
    lines = [f"## {title}", ""]
    if values:
        for value in values:
            lines.append(f"- `{value}`")
    else:
        lines.append("- None")
    lines.append("")
    return lines


def to_markdown(result: dict) -> str:
    summary = result["summary"]
    findings = result["findings"]
    lines: list[str] = []
    lines.append("# Repository Hygiene Report")
    lines.append("")
    lines.append(f"Generated: {result['generated']}")
    lines.append(f"Root: `{result['root']}`")
    lines.append("")
    lines.append("## Summary")
    lines.append(f"- Root entries: {summary['root_entries']}")
    lines.append(f"- Unexpected root dirs: {summary['unexpected_root_dirs']}")
    lines.append(f"- Unexpected root files: {summary['unexpected_root_files']}")
    lines.append(f"- Large root files: {summary['large_root_files']}")
    lines.append(f"- Root untracked entries: {summary['root_untracked_entries']}")
    lines.append(f"- Path-shadow dirs: {summary['path_shadow_dirs']}")
    lines.append(f"- Total findings: {summary['findings_total']}")
    lines.append("")
    lines.extend(simple_section("Path-Shadow Dirs", findings["path_shadow_dirs"]))
    lines.extend(simple_section("Unexpected Root Dirs", findings["unexpected_root_dirs"]))
    lines.extend(simple_section("Unexpected Root Files", findings["unexpected_root_files"]))
    lines.append("## Large Root Files")
    lines.append("")
    if findings["large_root_files"]:
        for item in findings["large_root_files"]:
            lines.append(f"- `{item['path']}` | size_mb={item['size_mb']}")
    else:
        lines.append("- None")
    lines.append("")
    lines.extend(simple_section("Root Untracked Entries", findings["root_untracked_entries"]))
    lines.extend(inventory_markdown(result["inventory"]))
    lines.append("## Notes")
    lines.append("")
    lines.append("- This check is intentionally root-focused; it does not replace lead integrity checks.")
    lines.append("- Path-shadow dirs usually come from accidental screenshot/snapshot output paths or malformed archive extraction.")
    lines.append("- Large root files are candidates for relocation, not automatic deletion.")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    repo_root = Path(args.root).resolve()
    result = build_result(repo_root, args.large_root_file_mb)

    print(
        "Repo hygiene: findings={f} path_shadow={p} unexpected_dirs={d} unexpected_files={rf} large_root_files={lf} root_untracked={u}".format(
            f=result["summary"]["findings_total"],
            p=result["summary"]["path_shadow_dirs"],
            d=result["summary"]["unexpected_root_dirs"],
            rf=result["summary"]["unexpected_root_files"],
            lf=result["summary"]["large_root_files"],
            u=result["summary"]["root_untracked_entries"],
        )
    )

    if args.json_out:
        json_path = Path(args.json_out)
        if not json_path.is_absolute():
            json_path = repo_root / json_path
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"JSON report written: {json_path}")

    if args.write_report or args.report_path:
        if args.report_path:
            report_path = Path(args.report_path)
            if not report_path.is_absolute():
                report_path = repo_root / report_path
        else:
            report_path = repo_root / "ops" / "reports" / "repo-hygiene" / f"repo-hygiene-{date.today().isoformat()}.md"
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(to_markdown(result), encoding="utf-8")
        print(f"Markdown report written: {report_path}")

    if args.fail_on_findings and result["summary"]["findings_total"] > 0:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
