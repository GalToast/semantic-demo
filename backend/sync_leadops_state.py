from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
REPORTS_DIR = REPO_ROOT / "reports"


def run_step(label: str, cmd: list[str], workdir: Path) -> tuple[int, str, str]:
    print(f"\n== {label} ==")
    print(" ".join(cmd))
    completed = subprocess.run(
        cmd,
        cwd=workdir,
        text=True,
        capture_output=True,
    )
    if completed.stdout:
        print(completed.stdout.rstrip())
    if completed.stderr:
        print(completed.stderr.rstrip(), file=sys.stderr)
    return completed.returncode, completed.stdout, completed.stderr


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Hostinger IMAP state, repo exports, and leadops sqlite in one pass.")
    parser.add_argument("--user", default="fred@mccullough.digital", help="Hostinger mailbox user.")
    parser.add_argument("--db", default="crm.sqlite", help="SQLite database path relative to repo root.")
    parser.add_argument("--skip-imap-export", action="store_true", help="Skip full IMAP Drafts/Sent export if indexes are already fresh.")
    parser.add_argument("--skip-mailbox-snapshot", action="store_true", help="Skip live mailbox count snapshot.")
    parser.add_argument("--skip-audit-import", action="store_true", help="Skip audit enrichment import even when audit input is provided.")
    parser.add_argument("--audit-input", help="Audit JSON file or directory to import into leadops after bootstrap.")
    parser.add_argument("--collect-github-audits", action="store_true", help="Collect recent GitHub-hosted audit artifacts before import.")
    parser.add_argument("--github-audit-since-minutes", type=int, default=60, help="Recency window for GitHub audit collection.")
    parser.add_argument("--github-audit-limit", type=int, default=40, help="Maximum recent GitHub workflow runs to inspect.")
    parser.add_argument("--skip-normalized-audit-sync", action="store_true", help="Skip normalized audit derivation after bootstrap/import.")
    parser.add_argument("--skip-normalized-ready-apply", action="store_true", help="Skip applying safe ready normalized candidates.")
    parser.add_argument(
        "--audit-import-min-trust",
        default="observed",
        choices=("unverified", "inferred", "observed", "verified"),
        help="Minimum trust level for audit enrichment import candidates.",
    )
    parser.add_argument("--apply-audit-import", action="store_true", help="Apply audit enrichment import writes instead of dry-run.")
    parser.add_argument("--skip-exports", action="store_true", help="Skip report/worklist exports after bootstrap.")
    parser.add_argument("--worklist-limit", type=int, default=100, help="Row limit for exported worklists.")
    args = parser.parse_args()

    py = sys.executable
    steps: list[tuple[str, list[str]]] = []
    effective_audit_input = args.audit_input
    github_audit_out_dir = REPO_ROOT / "ops" / "audit-review"

    if not args.skip_mailbox_snapshot:
        steps.append(
            (
                "Snapshot live mailbox counts",
                [py, "scripts/maintenance/snapshot_hostinger_mailbox_counts.py", "--user", args.user],
            )
        )

    if not args.skip_imap_export:
        steps.append(
            (
                "Export IMAP Drafts and Sent indexes",
                [py, "scripts/maintenance/imap_export_hostinger.py", "--user", args.user],
            )
        )

    if not args.skip_imap_export:
        steps.extend(
            [
                (
                    "Refresh sent-items.json from IMAP",
                    [py, "scripts/maintenance/update_sent_items_from_imap.py"],
                ),
                (
                    "Refresh drafts.json from IMAP",
                    [py, "scripts/maintenance/update_drafts_export_from_imap.py"],
                ),
            ]
        )

    steps.append(
        (
            "Bootstrap leadops sqlite",
            [py, "scripts/maintenance/bootstrap_leadops_sqlite.py", "--db", args.db],
        )
    )

    if args.collect_github_audits:
        steps.append(
            (
                "Collect recent GitHub audit artifacts",
                [
                    py,
                    "scripts/maintenance/collect_recent_github_audits.py",
                    "--since-minutes",
                    str(args.github_audit_since_minutes),
                    "--limit",
                    str(args.github_audit_limit),
                    "--out-dir",
                    str(github_audit_out_dir),
                ],
            )
        )
        if not effective_audit_input:
            effective_audit_input = str(github_audit_out_dir)

    if effective_audit_input and not args.skip_audit_import:
        audit_cmd = [
            py,
            "scripts/maintenance/import_audit_enrichment_to_leadops.py",
            "--db",
            args.db,
            "--input",
            effective_audit_input,
            "--min-trust",
            args.audit_import_min_trust,
        ]
        if args.apply_audit_import:
            audit_cmd.append("--apply")
        steps.append(("Import audit enrichment into leadops", audit_cmd))

    if args.collect_github_audits:
        steps.append(
            (
                "Deep-index collected audit artifacts",
                [
                    py,
                    "scripts/maintenance/bootstrap_leadops_sqlite.py",
                    "--db",
                    args.db,
                    "--deep-index",
                ],
            )
        )

    if not args.skip_normalized_audit_sync:
        steps.append(
            (
                "Sync normalized audit layer",
                [
                    py,
                    "scripts/maintenance/sync_normalized_audit_layer.py",
                    "--db",
                    args.db,
                ],
            )
        )
        if not args.skip_normalized_ready_apply:
            steps.append(
                (
                    "Apply ready normalized audit candidates",
                    [
                        py,
                        "scripts/maintenance/apply_normalized_audit_promotions.py",
                        "--db",
                        args.db,
                        "--apply-ready",
                        "--reviewer",
                        "codex",
                        "--note",
                        "sync_leadops_state automated ready promotion",
                    ],
                )
            )
        steps.append(
            (
                "List remaining normalized audit review queue",
                [
                    py,
                    "scripts/maintenance/apply_normalized_audit_promotions.py",
                    "--db",
                    args.db,
                    "--list-open",
                ],
            )
        )

    if not args.skip_exports:
        steps.extend(
            [
                (
                    "Export leadops worklists",
                    [
                        py,
                        "scripts/maintenance/export_leadops_worklists.py",
                        "--db",
                        args.db,
                        "--limit",
                        str(args.worklist_limit),
                    ],
                ),
                (
                    "Export leadops data-quality worklist",
                    [
                        py,
                        "scripts/maintenance/export_leadops_data_quality_worklist.py",
                        "--db",
                        args.db,
                        "--limit",
                        str(args.worklist_limit),
                    ],
                ),
                (
                    "Export low-confidence contactable worklist",
                    [
                        py,
                        "scripts/maintenance/export_leadops_data_quality_worklist.py",
                        "--db",
                        args.db,
                        "--issue-type",
                        "low_confidence_contactable",
                        "--limit",
                        str(args.worklist_limit),
                        "--csv",
                        str(REPORTS_DIR.parent / "tmp" / f"leadops-low-confidence-contactable-{datetime.now().strftime('%Y-%m-%d')}.csv"),
                        "--md",
                        str(REPORTS_DIR / f"leadops-low-confidence-contactable-{datetime.now().strftime('%Y-%m-%d')}.md"),
                    ],
                ),
                (
                    "Export duplicate cluster worklist",
                    [
                        py,
                        "scripts/maintenance/export_duplicate_cluster_worklist.py",
                        "--db",
                        args.db,
                        "--limit",
                        str(args.worklist_limit),
                    ],
                ),
                (
                    "Export entity review worklist",
                    [
                        py,
                        "scripts/maintenance/export_entity_review_worklist.py",
                        "--db",
                        args.db,
                        "--limit",
                        str(args.worklist_limit),
                    ],
                ),
            ]
        )

    started = datetime.now()
    results: list[tuple[str, int]] = []
    for label, cmd in steps:
        code, _, _ = run_step(label, cmd, REPO_ROOT)
        results.append((label, code))
        if code != 0:
            raise SystemExit(f"Step failed: {label} (exit {code})")

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = REPORTS_DIR / f"leadops-sync-{started.strftime('%Y-%m-%d')}.md"
    lines = [
        "# LeadOps Sync",
        "",
        f"- Started: {started.strftime('%Y-%m-%d %H:%M:%S')}",
        f"- User: `{args.user}`",
        f"- Database: `{args.db}`",
        f"- Worklist limit: `{args.worklist_limit}`",
        f"- Audit import input: `{effective_audit_input or 'none'}`",
        f"- Audit import mode: `{'apply' if args.apply_audit_import else 'dry-run'}`",
        f"- Audit import min trust: `{args.audit_import_min_trust}`",
        f"- Collect GitHub audits: `{'yes' if args.collect_github_audits else 'no'}`",
        f"- GitHub audit recency: `{args.github_audit_since_minutes}` minutes",
        f"- Normalized audit sync: `{'no' if args.skip_normalized_audit_sync else 'yes'}`",
        f"- Apply normalized ready candidates: `{'no' if args.skip_normalized_ready_apply else 'yes'}`",
        f"- Export reports: `{'no' if args.skip_exports else 'yes'}`",
        "",
        "## Steps",
        "",
    ]
    for label, code in results:
        lines.append(f"- `{label}`: exit `{code}`")
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nSync complete. Report: {report_path}")


if __name__ == "__main__":
    main()
