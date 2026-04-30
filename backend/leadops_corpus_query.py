from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Query the leadops deep corpus layers (FTS, evidence artifacts, vector queue)."
    )
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of a text table")

    subparsers = parser.add_subparsers(dest="command", required=True)

    search_parser = subparsers.add_parser("search", help="Run an FTS keyword search over indexed documents")
    search_parser.add_argument("query", help="FTS5 query string")
    search_parser.add_argument("--limit", type=int, default=10)
    search_parser.add_argument("--lead-id", type=int)
    search_parser.add_argument("--doc-type")

    artifacts_parser = subparsers.add_parser("artifacts", help="List evidence artifacts for a lead")
    artifacts_parser.add_argument("--lead-id", type=int, required=True)
    artifacts_parser.add_argument("--artifact-group")
    artifacts_parser.add_argument("--artifact-kind")
    artifacts_parser.add_argument("--limit", type=int, default=50)

    vector_parser = subparsers.add_parser("vector-pending", help="List or export vector-pending documents")
    vector_parser.add_argument("--limit", type=int, default=50)
    vector_parser.add_argument("--lead-id", type=int)
    vector_parser.add_argument("--doc-type")
    vector_parser.add_argument("--out", help="Optional CSV output path")

    docs_parser = subparsers.add_parser("docs", help="List indexed search documents for a lead")
    docs_parser.add_argument("--lead-id", type=int, required=True)
    docs_parser.add_argument("--doc-type")
    docs_parser.add_argument("--limit", type=int, default=50)

    subparsers.add_parser("corpus-health", help="Show live corpus, vector, and embedding counts")

    return parser


def connect(db_path: Path) -> sqlite3.Connection:
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def text_rows(rows: list[sqlite3.Row]) -> str:
    if not rows:
        return "(no rows)"
    keys = list(rows[0].keys())
    widths = {key: len(str(key)) for key in keys}
    for row in rows:
        for key in keys:
            widths[key] = min(max(widths[key], len(str(row[key]))), 120)

    def crop(value: object, width: int) -> str:
        text = "" if value is None else str(value)
        if len(text) > width:
            return text[: max(0, width - 1)] + "…"
        return text

    lines = []
    header = " | ".join(str(key).ljust(widths[key]) for key in keys)
    divider = "-+-".join("-" * widths[key] for key in keys)
    lines.append(header)
    lines.append(divider)
    for row in rows:
        lines.append(" | ".join(crop(row[key], widths[key]).ljust(widths[key]) for key in keys))
    return "\n".join(lines)


def print_text(text: str) -> None:
    encoding = sys.stdout.encoding or "utf-8"
    safe_text = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(safe_text)


def emit(rows: list[sqlite3.Row], *, as_json: bool, out: str | None = None) -> None:
    payload = [dict(row) for row in rows]
    if out:
        out_path = Path(out)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("w", newline="", encoding="utf-8") as handle:
            writer = None
            for row in payload:
                if writer is None:
                    writer = csv.DictWriter(handle, fieldnames=list(row.keys()))
                    writer.writeheader()
                writer.writerow(row)
        print(out_path)
        return
    if as_json:
        print_text(json.dumps(payload, indent=2, ensure_ascii=False))
        return
    print_text(text_rows(rows))


def run_search(conn: sqlite3.Connection, args: argparse.Namespace) -> list[sqlite3.Row]:
    filters = []
    params: list[object] = [args.query]
    if args.lead_id:
        filters.append("f.lead_id = ?")
        params.append(args.lead_id)
    if args.doc_type:
        filters.append("f.doc_type = ?")
        params.append(args.doc_type)
    where_sql = f"AND {' AND '.join(filters)}" if filters else ""
    params.append(args.limit)
    query = f"""
        SELECT
            f.rowid AS doc_id,
            f.lead_id,
            COALESCE(l.name, '') AS lead_name,
            f.doc_type,
            f.source_path,
            snippet(leadops_search_fts, 1, '[', ']', ' … ', 18) AS snippet,
            printf('%.4f', bm25(leadops_search_fts)) AS bm25_score
        FROM leadops_search_fts f
        LEFT JOIN leadops_leads l
          ON l.lead_id = f.lead_id
        WHERE leadops_search_fts MATCH ?
          {where_sql}
        ORDER BY bm25(leadops_search_fts) ASC
        LIMIT ?
    """
    return list(conn.execute(query, params))


def run_artifacts(conn: sqlite3.Connection, args: argparse.Namespace) -> list[sqlite3.Row]:
    filters = ["lead_id = ?"]
    params: list[object] = [args.lead_id]
    if args.artifact_group:
        filters.append("artifact_group = ?")
        params.append(args.artifact_group)
    if args.artifact_kind:
        filters.append("artifact_kind = ?")
        params.append(args.artifact_kind)
    params.append(args.limit)
    query = f"""
        SELECT
            lead_id,
            artifact_group,
            artifact_kind,
            file_ext,
            size_bytes,
            modified_at,
            relative_path
        FROM leadops_evidence_artifacts
        WHERE {' AND '.join(filters)}
        ORDER BY artifact_group ASC, artifact_kind ASC, relative_path ASC
        LIMIT ?
    """
    return list(conn.execute(query, params))


def run_vector_pending(conn: sqlite3.Connection, args: argparse.Namespace) -> list[sqlite3.Row]:
    filters = []
    params: list[object] = []
    if args.lead_id:
        filters.append("lead_id = ?")
        params.append(args.lead_id)
    if args.doc_type:
        filters.append("doc_type = ?")
        params.append(args.doc_type)
    where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
    params.append(args.limit)
    query = f"""
        SELECT
            id,
            doc_id,
            lead_id,
            doc_type,
            source_path,
            content_hash,
            embedding_status,
            embedding_model,
            embedded_at
        FROM leadops_v_vector_index_queue_pending
        {where_sql}
        LIMIT ?
    """
    return list(conn.execute(query, params))


def run_docs(conn: sqlite3.Connection, args: argparse.Namespace) -> list[sqlite3.Row]:
    filters = ["lead_id = ?"]
    params: list[object] = [args.lead_id]
    if args.doc_type:
        filters.append("doc_type = ?")
        params.append(args.doc_type)
    params.append(args.limit)
    query = f"""
        SELECT
            id,
            lead_id,
            doc_type,
            title,
            source_path,
            body_length,
            source_kind,
            content_hash
        FROM leadops_v_search_documents
        WHERE {' AND '.join(filters)}
        ORDER BY doc_type ASC, source_path ASC
        LIMIT ?
    """
    return list(conn.execute(query, params))


def run_corpus_health(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    return list(
        conn.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM leadops_search_documents) AS search_documents,
                (SELECT COUNT(*) FROM leadops_vector_index_queue) AS vector_queue,
                (SELECT COUNT(*) FROM leadops_vector_embeddings) AS vector_embeddings,
                (SELECT COUNT(*) FROM leadops_vector_index_queue WHERE lower(COALESCE(embedding_status, 'pending')) <> 'embedded') AS pending_docs,
                (SELECT MAX(indexed_at) FROM leadops_vector_embeddings) AS last_indexed_at,
                (SELECT MIN(indexed_at) FROM leadops_vector_embeddings) AS first_indexed_at
            """
        )
    )


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    db_path = Path(args.db).resolve()

    with connect(db_path) as conn:
        if args.command == "search":
            rows = run_search(conn, args)
            emit(rows, as_json=args.json)
        elif args.command == "artifacts":
            rows = run_artifacts(conn, args)
            emit(rows, as_json=args.json)
        elif args.command == "vector-pending":
            rows = run_vector_pending(conn, args)
            emit(rows, as_json=args.json, out=args.out)
        elif args.command == "docs":
            rows = run_docs(conn, args)
            emit(rows, as_json=args.json)
        elif args.command == "corpus-health":
            rows = run_corpus_health(conn)
            emit(rows, as_json=args.json)
        else:
            parser.print_help()
            raise SystemExit(1)


if __name__ == "__main__":
    main()
