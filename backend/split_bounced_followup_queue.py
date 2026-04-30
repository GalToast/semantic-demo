from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
import re

REPO_ROOT = Path(".")
QUEUES_DIR = REPO_ROOT / "outreach" / "queues"
DEFAULT_ACTIONS = {
    # Keep the output set stable so stale queue files don't linger when rows move between actions.
    "check-site-for-form",
    "phone-only",
    "skip-already-contacted-via-form",
    "skip-alt-already-in-sent",
    "skip-disqualified",
    "try-alt-email",
    "use-contact-form",
}


@dataclass(frozen=True)
class ParsedTable:
    header_lines: list[str]
    column_names: list[str]
    rows: list[list[str]]


def latest_bounce_queue() -> Path | None:
    # Only select the canonical, unsplit queue files which start with a date suffix
    # (e.g. bounced-followup-2026-02-06.md, bounced-followup-2026-02-06-post-send.md).
    # Split outputs look like: bounced-followup-phone-only-2026-02-06.md
    candidates = []
    for path in QUEUES_DIR.glob("bounced-followup-*.md"):
        suffix = path.name.removeprefix("bounced-followup-")
        if re.match(r"^20\d{2}-\d{2}-\d{2}", suffix):
            candidates.append(path)

    candidates = sorted(candidates, key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def parse_markdown_table(lines: list[str]) -> ParsedTable:
    """
    Parse a single markdown table:
      | a | b |
      | --- | --- |
      | 1 | 2 |
    """
    header_idx = None
    for i, line in enumerate(lines):
        if line.strip().startswith("|") and "|" in line.strip()[1:]:
            # Next line should be separator
            if i + 1 < len(lines) and set(lines[i + 1].replace("|", "").strip()) <= {"-", " "}:
                header_idx = i
                break
    if header_idx is None:
        raise SystemExit("No markdown table found in queue.")

    header_line = lines[header_idx].strip()
    sep_line = lines[header_idx + 1].strip()

    col_names = [c.strip() for c in header_line.strip("|").split("|")]
    header_lines = []
    header_lines.extend(lines[: header_idx + 2])

    rows: list[list[str]] = []
    for line in lines[header_idx + 2 :]:
        if not line.strip().startswith("|"):
            break
        parts = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(parts) != len(col_names):
            # Keep raw split if schema drifts; do not crash.
            continue
        rows.append(parts)

    # Keep sep_line referenced to avoid lint noise.
    _ = sep_line
    return ParsedTable(header_lines=header_lines, column_names=col_names, rows=rows)


def write_queue(path: Path, title: str, source: str, table: ParsedTable, rows: list[list[str]]) -> None:
    lines: list[str] = []
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"Generated: {date.today().isoformat()}")
    lines.append(f"Source: {source}")
    lines.append(f"Total: {len(rows)}")
    lines.append("")

    # Rebuild table header with the same columns.
    lines.append("| " + " | ".join(table.column_names) + " |")
    lines.append("| " + " | ".join(["---"] * len(table.column_names)) + " |")
    for r in rows:
        lines.append("| " + " | ".join(r) + " |")
    lines.append("")

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    src = latest_bounce_queue()
    if not src:
        raise SystemExit("No bounced-followup queue found under outreach/queues/.")

    raw_lines = src.read_text(encoding="utf-8", errors="ignore").splitlines()
    table = parse_markdown_table(raw_lines)

    try:
        next_idx = table.column_names.index("Next Action")
    except ValueError:
        raise SystemExit("Queue table missing 'Next Action' column.")

    grouped: dict[str, list[list[str]]] = defaultdict(list)
    for row in table.rows:
        action = row[next_idx].strip() or "unknown"
        grouped[action].append(row)

    stem = src.stem  # bounced-followup-YYYY-MM-DD
    suffix = stem.removeprefix("bounced-followup-") if stem.startswith("bounced-followup-") else date.today().isoformat()

    # Remove stale per-action queue files for this suffix before rewriting.
    # Example outputs: bounced-followup-phone-only-2026-02-06.md
    for old in sorted(QUEUES_DIR.glob(f"bounced-followup-*-{suffix}.md")):
        old.unlink(missing_ok=True)

    all_actions = sorted(set(grouped.keys()) | DEFAULT_ACTIONS)
    for action in all_actions:
        rows = grouped.get(action, [])
        safe = action.replace("/", "-").replace(" ", "-").strip("-") or "unknown"
        out = QUEUES_DIR / f"bounced-followup-{safe}-{suffix}.md"
        write_queue(out, f"Bounced Follow-Up Queue: {action}", src.as_posix(), table, rows)

    print(f"Split {len(table.rows)} rows from {src.as_posix()} into {len(grouped)} queues.")


if __name__ == "__main__":
    main()
