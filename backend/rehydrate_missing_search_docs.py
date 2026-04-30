from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"
DEFAULT_FAST_SNAPSHOT = REPO_ROOT / "tmp" / "crm.semantic-fast.sqlite"


def log(message: str) -> None:
    print(message, flush=True)


def backup_db(src: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dst = src.parent / "tmp" / f"{src.stem}.pre-doc-rehydrate-{timestamp}{src.suffix}"
    dst.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(src) as source_conn, sqlite3.connect(dst) as backup_conn:
        source_conn.backup(backup_conn)
    return dst


def main() -> None:
    parser = argparse.ArgumentParser(description="Rehydrate missing leadops_search_documents rows from a semantic snapshot DB.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Root crm.sqlite path.")
    parser.add_argument("--snapshot-db", default=str(DEFAULT_FAST_SNAPSHOT), help="Snapshot DB that still contains the missing documents.")
    parser.add_argument("--no-backup", action="store_true", help="Skip making a backup before rehydrating.")
    parser.add_argument(
        "--archive-conflicts",
        action="store_true",
        help="Insert path-conflicting snapshot documents under archival source paths instead of skipping them.",
    )
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    snapshot_path = Path(args.snapshot_db).resolve()

    if not db_path.exists():
        raise SystemExit(f"Root DB not found: {db_path}")
    if not snapshot_path.exists():
        raise SystemExit(f"Snapshot DB not found: {snapshot_path}")

    backup_path = None if args.no_backup else backup_db(db_path)
    if backup_path:
        log(f"[rehydrate-docs] backup={backup_path}")

    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("ATTACH DATABASE ? AS snap", (str(snapshot_path),))
        try:
            before_count = int(conn.execute("SELECT COUNT(*) FROM leadops_search_documents").fetchone()[0])
            missing_total = int(
                conn.execute(
                    """
                    SELECT COUNT(*)
                    FROM snap.leadops_search_documents s
                    LEFT JOIN leadops_search_documents d
                      ON d.content_hash = s.content_hash
                     AND d.doc_type = s.doc_type
                     AND COALESCE(d.lead_id, -1) = COALESCE(s.lead_id, -1)
                    WHERE d.id IS NULL
                    """
                ).fetchone()[0]
            )
            path_conflicts = int(
                conn.execute(
                    """
                    SELECT COUNT(*)
                    FROM snap.leadops_search_documents s
                    LEFT JOIN leadops_search_documents d
                      ON d.content_hash = s.content_hash
                     AND d.doc_type = s.doc_type
                     AND COALESCE(d.lead_id, -1) = COALESCE(s.lead_id, -1)
                    JOIN leadops_search_documents p
                      ON p.source_path = s.source_path
                     AND p.doc_type = s.doc_type
                    WHERE d.id IS NULL
                    """
                ).fetchone()[0]
            )
            log(f"[rehydrate-docs] before_count={before_count}")
            log(f"[rehydrate-docs] missing_total={missing_total}")
            log(f"[rehydrate-docs] path_conflicts={path_conflicts}")

            conn.execute(
                """
                INSERT INTO leadops_search_documents (
                    lead_id, doc_type, title, source_path, body_text, content_hash, source_kind
                )
                SELECT
                    s.lead_id,
                    s.doc_type,
                    s.title,
                    s.source_path,
                    s.body_text,
                    s.content_hash,
                    s.source_kind
                FROM snap.leadops_search_documents s
                LEFT JOIN leadops_search_documents d
                  ON d.content_hash = s.content_hash
                 AND d.doc_type = s.doc_type
                 AND COALESCE(d.lead_id, -1) = COALESCE(s.lead_id, -1)
                LEFT JOIN leadops_search_documents p
                  ON p.source_path = s.source_path
                 AND p.doc_type = s.doc_type
                WHERE d.id IS NULL
                  AND p.id IS NULL
                """
            )
            inserted = int(conn.execute("SELECT changes()").fetchone()[0])

            archived_inserted = 0
            if args.archive_conflicts:
                conn.execute(
                    """
                    INSERT INTO leadops_search_documents (
                        lead_id, doc_type, title, source_path, body_text, content_hash, source_kind
                    )
                    SELECT
                        s.lead_id,
                        s.doc_type,
                        s.title,
                        s.source_path || '#snapshot-restore-20260331',
                        s.body_text,
                        s.content_hash,
                        s.source_kind
                    FROM snap.leadops_search_documents s
                    LEFT JOIN leadops_search_documents d
                      ON d.content_hash = s.content_hash
                     AND d.doc_type = s.doc_type
                     AND COALESCE(d.lead_id, -1) = COALESCE(s.lead_id, -1)
                    JOIN leadops_search_documents p
                      ON p.source_path = s.source_path
                     AND p.doc_type = s.doc_type
                    LEFT JOIN leadops_search_documents ap
                      ON ap.source_path = s.source_path || '#snapshot-restore-20260331'
                     AND ap.doc_type = s.doc_type
                    WHERE d.id IS NULL
                      AND ap.id IS NULL
                    """
                )
                archived_inserted = int(conn.execute("SELECT changes()").fetchone()[0])
            conn.commit()

            after_count = int(conn.execute("SELECT COUNT(*) FROM leadops_search_documents").fetchone()[0])
            conflict_examples = conn.execute(
                """
                SELECT s.lead_id, s.doc_type, s.source_path, substr(s.content_hash, 1, 16)
                FROM snap.leadops_search_documents s
                LEFT JOIN leadops_search_documents d
                  ON d.content_hash = s.content_hash
                 AND d.doc_type = s.doc_type
                 AND COALESCE(d.lead_id, -1) = COALESCE(s.lead_id, -1)
                JOIN leadops_search_documents p
                  ON p.source_path = s.source_path
                 AND p.doc_type = s.doc_type
                WHERE d.id IS NULL
                LIMIT 20
                """
            ).fetchall()

            print(
                json.dumps(
                    {
                        "db": str(db_path),
                        "snapshot": str(snapshot_path),
                        "backup": str(backup_path) if backup_path else "",
                        "before_count": before_count,
                        "missing_total": missing_total,
                        "path_conflicts": path_conflicts,
                        "inserted": inserted,
                        "archived_inserted": archived_inserted,
                        "after_count": after_count,
                        "conflict_examples": conflict_examples,
                    },
                    indent=2,
                )
            )
        finally:
            conn.execute("DETACH DATABASE snap")


if __name__ == "__main__":
    main()
