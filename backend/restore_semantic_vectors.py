from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"
DEFAULT_FAST_SNAPSHOT = REPO_ROOT / "tmp" / "crm.semantic-fast.sqlite"
DEFAULT_QUALITY_SNAPSHOT = REPO_ROOT / "tmp" / "crm.semantic-quality.sqlite"


def log(message: str) -> None:
    print(message, flush=True)


def backup_db(src: Path) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dst = src.parent / "tmp" / f"{src.stem}.pre-semantic-restore-{timestamp}{src.suffix}"
    dst.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(src) as source_conn, sqlite3.connect(dst) as backup_conn:
        source_conn.backup(backup_conn)
    return dst


def ensure_queue_rows_for_model(conn: sqlite3.Connection, model_name: str) -> None:
    conn.execute(
        """
        INSERT OR IGNORE INTO leadops_vector_index_queue (
            doc_id, lead_id, doc_type, source_path, content_hash,
            embedding_status, embedding_model, embedded_at
        )
        SELECT
            d.id,
            d.lead_id,
            d.doc_type,
            d.source_path,
            d.content_hash,
            CASE
                WHEN ve.doc_id IS NOT NULL AND ve.content_hash = d.content_hash THEN 'embedded'
                ELSE 'pending'
            END,
            ?,
            CASE
                WHEN ve.doc_id IS NOT NULL AND ve.content_hash = d.content_hash THEN ve.indexed_at
                ELSE NULL
            END
        FROM leadops_search_documents d
        LEFT JOIN leadops_vector_embeddings ve
          ON ve.doc_id = d.id
         AND ve.embedding_model = ?
        """,
        (model_name, model_name),
    )
    conn.execute(
        """
        UPDATE leadops_vector_index_queue
        SET
            lead_id = (
                SELECT d.lead_id
                FROM leadops_search_documents d
                WHERE d.id = leadops_vector_index_queue.doc_id
            ),
            doc_type = (
                SELECT d.doc_type
                FROM leadops_search_documents d
                WHERE d.id = leadops_vector_index_queue.doc_id
            ),
            source_path = (
                SELECT d.source_path
                FROM leadops_search_documents d
                WHERE d.id = leadops_vector_index_queue.doc_id
            ),
            content_hash = (
                SELECT d.content_hash
                FROM leadops_search_documents d
                WHERE d.id = leadops_vector_index_queue.doc_id
            )
        WHERE embedding_model = ?
        """,
        (model_name,),
    )
    conn.execute(
        """
        UPDATE leadops_vector_index_queue
        SET
            embedding_status = CASE
                WHEN EXISTS (
                    SELECT 1
                    FROM leadops_vector_embeddings ve
                    WHERE ve.doc_id = leadops_vector_index_queue.doc_id
                      AND ve.embedding_model = leadops_vector_index_queue.embedding_model
                      AND ve.content_hash = leadops_vector_index_queue.content_hash
                )
                THEN 'embedded'
                ELSE 'pending'
            END,
            embedded_at = (
                SELECT ve.indexed_at
                FROM leadops_vector_embeddings ve
                WHERE ve.doc_id = leadops_vector_index_queue.doc_id
                  AND ve.embedding_model = leadops_vector_index_queue.embedding_model
                  AND ve.content_hash = leadops_vector_index_queue.content_hash
                LIMIT 1
            )
        WHERE embedding_model = ?
        """,
        (model_name,),
    )


def ensure_restore_indexes(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_leadops_search_documents_restore_match
        ON leadops_search_documents(content_hash, doc_type, lead_id)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_leadops_vector_embeddings_restore_match
        ON leadops_vector_embeddings(doc_id, embedding_model, content_hash)
        """
    )


def ensure_snapshot_indexes(conn: sqlite3.Connection, alias: str) -> None:
    conn.execute(
        f"""
        CREATE INDEX IF NOT EXISTS {alias}.idx_restore_match
        ON leadops_vector_embeddings(content_hash, doc_type, lead_id)
        """
    )
    conn.execute(
        f"""
        CREATE INDEX IF NOT EXISTS {alias}.idx_restore_model
        ON leadops_vector_embeddings(embedding_model)
        """
    )


def restore_snapshot(conn: sqlite3.Connection, snapshot_path: Path, alias: str) -> dict[str, object]:
    conn.execute(f"ATTACH DATABASE ? AS {alias}", (str(snapshot_path),))
    try:
        ensure_snapshot_indexes(conn, alias)
        source_rows = int(
            conn.execute(
                f"SELECT COUNT(*) FROM {alias}.leadops_vector_embeddings"
            ).fetchone()[0]
        )
        log(f"[restore] {alias}: source_rows={source_rows}")
        matched_rows = int(
            conn.execute(
                f"""
                SELECT COUNT(*)
                FROM {alias}.leadops_vector_embeddings s
                JOIN leadops_search_documents d
                  ON d.content_hash = s.content_hash
                 AND d.doc_type = s.doc_type
                 AND COALESCE(d.lead_id, -1) = COALESCE(s.lead_id, -1)
                """
            ).fetchone()[0]
        )
        log(f"[restore] {alias}: matched_rows={matched_rows}")
        conn.execute(
            f"""
            INSERT OR REPLACE INTO leadops_vector_embeddings (
                doc_id, lead_id, doc_type, source_path, content_hash,
                embedding_model, embedding_dim, vector_blob, vector_norm, indexed_at
            )
            SELECT
                d.id,
                d.lead_id,
                d.doc_type,
                d.source_path,
                d.content_hash,
                s.embedding_model,
                s.embedding_dim,
                s.vector_blob,
                s.vector_norm,
                s.indexed_at
            FROM {alias}.leadops_vector_embeddings s
            JOIN leadops_search_documents d
              ON d.content_hash = s.content_hash
             AND d.doc_type = s.doc_type
             AND COALESCE(d.lead_id, -1) = COALESCE(s.lead_id, -1)
            WHERE COALESCE(s.embedding_model, '') <> ''
            """
        )
        models = [
            row[0]
            for row in conn.execute(
                f"SELECT DISTINCT embedding_model FROM {alias}.leadops_vector_embeddings WHERE COALESCE(embedding_model, '') <> ''"
            )
        ]
        return {
            "snapshot": str(snapshot_path),
            "source_rows": source_rows,
            "matched_rows": matched_rows,
            "models": models,
        }
    finally:
        conn.commit()
        conn.execute(f"DETACH DATABASE {alias}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Restore semantic vectors into root crm.sqlite from fast/quality snapshot DBs.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Root crm.sqlite path to restore into.")
    parser.add_argument("--fast-db", default=str(DEFAULT_FAST_SNAPSHOT), help="Fast semantic snapshot DB.")
    parser.add_argument("--quality-db", default=str(DEFAULT_QUALITY_SNAPSHOT), help="Quality semantic snapshot DB.")
    parser.add_argument("--no-backup", action="store_true", help="Skip making a backup of the root DB before restore.")
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    fast_db = Path(args.fast_db).resolve()
    quality_db = Path(args.quality_db).resolve()

    if not db_path.exists():
        raise SystemExit(f"Root DB not found: {db_path}")
    for snapshot in (fast_db, quality_db):
        if not snapshot.exists():
            raise SystemExit(f"Snapshot DB not found: {snapshot}")

    backup_path = None if args.no_backup else backup_db(db_path)
    if backup_path:
        log(f"[restore] backup={backup_path}")

    with sqlite3.connect(db_path) as conn:
        conn.execute("PRAGMA busy_timeout = 5000")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA synchronous = NORMAL")
        conn.execute("PRAGMA temp_store = MEMORY")
        ensure_restore_indexes(conn)
        before = {
            "vector_embeddings": int(conn.execute("SELECT COUNT(*) FROM leadops_vector_embeddings").fetchone()[0]),
            "vector_queue": int(conn.execute("SELECT COUNT(*) FROM leadops_vector_index_queue").fetchone()[0]),
            "embedded_queue_rows": int(
                conn.execute(
                    "SELECT COUNT(*) FROM leadops_vector_index_queue WHERE lower(COALESCE(embedding_status, 'pending')) = 'embedded'"
                ).fetchone()[0]
            ),
        }
        log(f"[restore] before={json.dumps(before)}")
        imported = [
            restore_snapshot(conn, fast_db, "fast_restore"),
            restore_snapshot(conn, quality_db, "quality_restore"),
        ]
        restored_models = sorted(
            {model for item in imported for model in item["models"] if model}
        )
        for model_name in restored_models:
            log(f"[restore] reconciling queue for {model_name}")
            ensure_queue_rows_for_model(conn, model_name)
        conn.commit()
        after = {
            "vector_embeddings": int(conn.execute("SELECT COUNT(*) FROM leadops_vector_embeddings").fetchone()[0]),
            "vector_queue": int(conn.execute("SELECT COUNT(*) FROM leadops_vector_index_queue").fetchone()[0]),
            "embedded_queue_rows": int(
                conn.execute(
                    "SELECT COUNT(*) FROM leadops_vector_index_queue WHERE lower(COALESCE(embedding_status, 'pending')) = 'embedded'"
                ).fetchone()[0]
            ),
                "embedding_models": conn.execute(
                "SELECT embedding_model, COUNT(*) FROM leadops_vector_embeddings GROUP BY embedding_model ORDER BY COUNT(*) DESC"
            ).fetchall(),
        }
        log(f"[restore] after={json.dumps(after)}")

    print(
        json.dumps(
            {
                "db": str(db_path),
                "backup": str(backup_path) if backup_path else "",
                "before": before,
                "imported": imported,
                "after": after,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
