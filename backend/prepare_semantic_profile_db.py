from __future__ import annotations

import argparse
import shutil
import sqlite3
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE_DB = REPO_ROOT / "crm.sqlite"
DEFAULT_OUT_DB = REPO_ROOT / "tmp" / "crm.semantic-fast.sqlite"


def backup_db(src: Path, dst: Path) -> None:
    if not src.exists():
        raise SystemExit(f"Source DB not found: {src}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()
    with sqlite3.connect(src) as a, sqlite3.connect(dst) as b:
        a.backup(b)


def copy_sidecars(src: Path, dst: Path) -> None:
    for suffix in (".wal", ".shm"):
        side = Path(f"{src}{suffix}")
        out = Path(f"{dst}{suffix}")
        if out.exists():
            out.unlink()
        if side.exists():
            shutil.copy2(side, out)


def reset_vectors(db: Path) -> dict[str, int]:
    with sqlite3.connect(db) as conn:
        counts = {
            "search_documents": int(conn.execute("SELECT COUNT(*) FROM leadops_search_documents").fetchone()[0]),
            "vector_queue": int(conn.execute("SELECT COUNT(*) FROM leadops_vector_index_queue").fetchone()[0]),
            "vector_embeddings_before": int(conn.execute("SELECT COUNT(*) FROM leadops_vector_embeddings").fetchone()[0]),
        }
        conn.execute("DELETE FROM leadops_vector_embeddings")
        conn.execute(
            """
            UPDATE leadops_vector_index_queue
            SET embedding_status = 'pending',
                embedding_model = NULL,
                embedded_at = NULL
            """
        )
        counts["vector_embeddings_after"] = int(conn.execute("SELECT COUNT(*) FROM leadops_vector_embeddings").fetchone()[0])
        counts["pending_after"] = int(
            conn.execute(
                "SELECT COUNT(*) FROM leadops_vector_index_queue WHERE lower(COALESCE(embedding_status, 'pending')) <> 'embedded'"
            ).fetchone()[0]
        )
        conn.commit()
        return counts


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Clone crm.sqlite and reset semantic-vector state so a profile can be re-embedded in isolation."
    )
    parser.add_argument("--source-db", default=str(DEFAULT_SOURCE_DB), help="Path to the canonical source crm.sqlite")
    parser.add_argument("--out-db", default=str(DEFAULT_OUT_DB), help="Path to the new cloned comparison DB")
    parser.add_argument(
        "--copy-sidecars",
        action="store_true",
        help="Also copy .wal/.shm sidecars if present. Usually not needed when backup() succeeds.",
    )
    args = parser.parse_args()

    src = Path(args.source_db).resolve()
    dst = Path(args.out_db).resolve()

    backup_db(src, dst)
    if args.copy_sidecars:
        copy_sidecars(src, dst)
    counts = reset_vectors(dst)

    print(f"prepared_db={dst}")
    for key, value in counts.items():
        print(f"{key}={value}")


if __name__ == "__main__":
    main()
