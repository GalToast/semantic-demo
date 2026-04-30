from __future__ import annotations

import argparse
import contextlib
import json
import time
from pathlib import Path

import numpy as np

import semantic_search as sem


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LEFT_DB = REPO_ROOT / "crm.sqlite"
DEFAULT_RIGHT_DB = REPO_ROOT / "tmp" / "crm.semantic-fast.sqlite"
DEFAULT_EVAL_FILE = Path(__file__).with_name("semantic_profile_eval_cases.json")
FAST_RERANK_PROFILE = "fast_rerank"
DEFAULT_QUERIES = [
    "small business website audit with trust and contact issues",
    "wrong website or entity mismatch lead with redirect or domain problems",
    "local contractor with broken contact path and weak site trust signals",
    "business with social links or contact details that do not work",
    "outreach-safe lead with strong audit findings and a real local business presence",
]


def load_eval_cases(args: argparse.Namespace) -> list[dict[str, object]]:
    def normalize_case(item: object, *, index: int) -> dict[str, object]:
        if isinstance(item, str):
            query = item.strip()
            if not query:
                raise SystemExit(f"Empty query entry at position {index}")
            return {
                "id": f"query-{index}",
                "query": query,
                "expected_lead_ids": [],
                "notes": "",
            }
        if not isinstance(item, dict):
            raise SystemExit(f"Unsupported eval case at position {index}: expected string or object")
        query = str(item.get("query", "")).strip()
        if not query:
            raise SystemExit(f"Eval case at position {index} is missing a query")
        expected = item.get("expected_lead_ids") or []
        if not isinstance(expected, list):
            raise SystemExit(f"Eval case {item.get('id', index)!r} has non-list expected_lead_ids")
        normalized_expected: list[int] = []
        for raw in expected:
            try:
                normalized_expected.append(int(raw))
            except Exception as exc:
                raise SystemExit(
                    f"Eval case {item.get('id', index)!r} has invalid expected lead id: {raw!r}"
                ) from exc
        return {
            "id": str(item.get("id") or f"query-{index}"),
            "query": query,
            "expected_lead_ids": normalized_expected,
            "notes": str(item.get("notes") or ""),
        }

    def load_from_path(path: Path) -> list[dict[str, object]]:
        if not path.exists():
            raise SystemExit(f"Eval file not found: {path}")
        text = path.read_text(encoding="utf-8")
        suffix = path.suffix.lower()
        if suffix == ".json":
            payload = json.loads(text)
            if isinstance(payload, dict):
                items = payload.get("cases") or payload.get("queries") or []
            elif isinstance(payload, list):
                items = payload
            else:
                raise SystemExit(f"Unsupported JSON eval payload in {path}")
            return [normalize_case(item, index=index) for index, item in enumerate(items, start=1)]
        if suffix == ".jsonl":
            items = [json.loads(line) for line in text.splitlines() if line.strip()]
            return [normalize_case(item, index=index) for index, item in enumerate(items, start=1)]
        lines = [line.strip() for line in text.splitlines()]
        items = [line for line in lines if line and not line.startswith("#")]
        return [normalize_case(item, index=index) for index, item in enumerate(items, start=1)]

    if args.query:
        return [normalize_case(item, index=index) for index, item in enumerate(args.query, start=1) if item.strip()]
    if args.eval_file:
        cases = load_from_path(Path(args.eval_file).resolve())
        if cases:
            return cases
    return [normalize_case(item, index=index) for index, item in enumerate(DEFAULT_QUERIES, start=1)]


def profile_args(
    *,
    db: Path,
    profile: str,
    limit: int,
    device: str | None,
    query_instruction: str,
    hybrid_rerank_limit: int,
    hybrid_rerank_strategy: str,
) -> argparse.Namespace:
    return argparse.Namespace(
        db=str(db),
        profile=profile,
        model_path=None,
        device=device,
        batch_size=sem.DEFAULT_BATCH_SIZE,
        llama_server_path=str(sem.DEFAULT_LLAMA_SERVER_PATH),
        llama_port=8092,
        llama_device="CUDA0",
        llama_batch_size=512,
        llama_ubatch_size=512,
        reranker_model_path=str(sem.DEFAULT_RERANKER_MODEL_PATH),
        reranker_server_path=str(sem.DEFAULT_LLAMA_SERVER_PATH),
        reranker_port=8094,
        reranker_device="CUDA0",
        reranker_batch_size=2048,
        reranker_ubatch_size=2048,
        query_instruction=query_instruction,
        limit=limit,
        hybrid_rerank_limit=hybrid_rerank_limit,
        hybrid_rerank_strategy=hybrid_rerank_strategy,
        json=True,
    )


def lead_ids(rows: list[dict[str, object]]) -> list[int]:
    ids: list[int] = []
    for row in rows:
        value = row.get("lead_id")
        if value is None:
            continue
        try:
            ids.append(int(value))
        except Exception:
            continue
    return ids


def compare_query(left: list[dict[str, object]], right: list[dict[str, object]]) -> dict[str, object]:
    a = lead_ids(left)
    b = lead_ids(right)
    return {
        "left_top_ids": a,
        "right_top_ids": b,
        "top1_same": bool(a and b and a[0] == b[0]),
        "topk_overlap": len(set(a) & set(b)),
    }


def score_expected_hits(rows: list[dict[str, object]], expected_lead_ids: list[int]) -> dict[str, object] | None:
    if not expected_lead_ids:
        return None
    ranks: list[int] = []
    seen: set[int] = set()
    for index, row in enumerate(rows, start=1):
        lead_id = row.get("lead_id")
        try:
            normalized = int(lead_id)
        except Exception:
            continue
        if normalized in expected_lead_ids and normalized not in seen:
            seen.add(normalized)
            ranks.append(index)
    best_rank = min(ranks) if ranks else None
    return {
        "expected_lead_ids": expected_lead_ids,
        "matched_lead_ids": sorted(seen),
        "matched_ranks": ranks,
        "first_hit_rank": best_rank,
        "top1_hit": best_rank == 1,
        "recall_at_3": bool(best_rank and best_rank <= 3),
        "recall_at_5": bool(best_rank and best_rank <= 5),
        "recall_at_10": bool(best_rank and best_rank <= 10),
        "mrr": round((1.0 / best_rank) if best_rank else 0.0, 6),
    }


def summarize_profile_metrics(query_rows: list[dict[str, object]], score_key: str) -> dict[str, object] | None:
    labeled = [item[score_key] for item in query_rows if item.get(score_key)]
    if not labeled:
        return None
    count = len(labeled)
    top1_hits = sum(1 for item in labeled if item["top1_hit"])
    recall_at_3 = sum(1 for item in labeled if item["recall_at_3"])
    recall_at_5 = sum(1 for item in labeled if item["recall_at_5"])
    recall_at_10 = sum(1 for item in labeled if item["recall_at_10"])
    mrr_total = sum(float(item["mrr"]) for item in labeled)
    return {
        "labeled_queries": count,
        "top1_hits": top1_hits,
        "top1_rate": round(top1_hits / count, 6),
        "recall_at_3_hits": recall_at_3,
        "recall_at_3_rate": round(recall_at_3 / count, 6),
        "recall_at_5_hits": recall_at_5,
        "recall_at_5_rate": round(recall_at_5 / count, 6),
        "recall_at_10_hits": recall_at_10,
        "recall_at_10_rate": round(recall_at_10 / count, 6),
        "mrr": round(mrr_total / count, 6),
    }


def cosine_rows(
    rows: list,
    query_vector: np.ndarray,
    query_norm: float,
    limit: int,
) -> list[dict[str, object]]:
    results: list[dict[str, object]] = []
    for row in rows:
        vector = np.frombuffer(row["vector_blob"], dtype=np.float32)
        denom = max(float(row["embedding_dim"] and np.linalg.norm(vector) * query_norm), 1e-12)
        score = float(np.dot(query_vector, vector) / denom)
        results.append(
            {
                "doc_id": row["doc_id"],
                "score": round(score, 6),
                "lead_id": row["lead_id"],
                "lead_name": row["lead_name"] or "",
                "doc_type": row["doc_type"],
                "title": row["title"] or "",
                "source_path": row["source_path"],
            }
        )
    results.sort(key=lambda item: item["score"], reverse=True)
    return results[:limit]


class SearchSession:
    def __init__(self, db: Path, args: argparse.Namespace):
        self.db = db
        self.args = args
        self.conn = None
        self.embedder = None
        self.reranker = None
        self.rows = None

    def __enter__(self):
        self.conn = sem.connect(self.db)
        sem.ensure_schema(self.conn)
        profile = sem.resolve_profile(self.args)
        if profile == FAST_RERANK_PROFILE:
            self.embedder_cm = sem.create_embedder(self.args)
            self.embedder = self.embedder_cm.__enter__()
            self.reranker_cm = sem.create_reranker(self.args)
            self.reranker = self.reranker_cm.__enter__()
            self.rows = sem.load_embedding_rows(self.conn, sem.resolve_model_key(self.args))
            if not self.rows:
                raise SystemExit(
                    f"No embeddings found for profile {profile!r} in {self.db}. Run semantic_search.py build-index first."
                )
            return self
        if profile == sem.DEFAULT_HYBRID_PROFILE:
            quality_args = sem.build_quality_args(self.args)
            self.embedder_cm = sem.create_embedder(quality_args)
            self.embedder = self.embedder_cm.__enter__()
            if getattr(self.args, "hybrid_rerank_strategy", "embedding") == "reranker":
                self.reranker_cm = sem.create_reranker(self.args)
                self.reranker = self.reranker_cm.__enter__()
            return self
        self.embedder_cm = sem.create_embedder(self.args)
        self.embedder = self.embedder_cm.__enter__()
        self.rows = sem.load_embedding_rows(self.conn, sem.resolve_model_key(self.args))
        if not self.rows:
            raise SystemExit(
                f"No embeddings found for profile {profile!r} in {self.db}. Run semantic_search.py build-index first."
            )
        return self

    def __exit__(self, exc_type, exc, tb):
        if getattr(self, "reranker_cm", None):
            self.reranker_cm.__exit__(exc_type, exc, tb)
        if getattr(self, "embedder_cm", None):
            self.embedder_cm.__exit__(exc_type, exc, tb)
        if self.conn is not None:
            self.conn.close()
        sem.release_torch_cuda_memory()

    def search(self, query: str) -> list[dict[str, object]]:
        profile = sem.resolve_profile(self.args)
        if profile == FAST_RERANK_PROFILE:
            return self.fast_rerank_search(query)
        if profile == sem.DEFAULT_HYBRID_PROFILE:
            return self.hybrid_search(query)
        formatted_query = sem.format_query_for_embedding(query, sem.resolve_query_instruction(self.args))
        query_vector = self.embedder.encode([formatted_query])[0].astype(np.float32)
        query_norm = float(np.linalg.norm(query_vector))
        return cosine_rows(self.rows, query_vector, query_norm, self.args.limit)

    def fast_rerank_search(self, query: str) -> list[dict[str, object]]:
        formatted_query = sem.format_query_for_embedding(query, sem.resolve_query_instruction(self.args))
        query_vector = self.embedder.encode([formatted_query])[0].astype(np.float32)
        query_norm = float(np.linalg.norm(query_vector))
        candidate_limit = min(max(self.args.hybrid_rerank_limit, self.args.limit), len(self.rows))
        candidates = cosine_rows(self.rows, query_vector, query_norm, candidate_limit)
        if not candidates:
            return []
        texts = []
        for item in candidates:
            row = self.conn.execute(
                "SELECT body_text FROM leadops_search_documents WHERE id = ?",
                (int(item["doc_id"]),),
            ).fetchone()
            texts.append(str((row["body_text"] if row else "") or ""))
        rerank_scores = self.reranker.rerank(
            query,
            texts,
            top_n=len(texts),
            instruction=sem.resolve_query_instruction(self.args),
        )
        payload = []
        for item, rerank_score in zip(candidates, rerank_scores, strict=True):
            payload.append(
                {
                    "lead_id": item["lead_id"],
                    "lead_name": item["lead_name"],
                    "doc_type": item["doc_type"],
                    "title": item["title"],
                    "source_path": item["source_path"],
                    "score": sem.stable_score(float(rerank_score), 6),
                    "candidate_score": sem.stable_score(float(item["score"]), 6),
                    "retrieval_profile": FAST_RERANK_PROFILE,
                    "candidate_source": sem.DEFAULT_FAST_PROFILE,
                    "reranked_by": "reranker",
                    "model_used": str(
                        (
                            Path(getattr(self.args, "reranker_model_path", None))
                            if getattr(self.args, "reranker_model_path", None)
                            else sem.DEFAULT_RERANKER_MODEL_PATH
                        ).resolve()
                    ),
                    "query_instruction": sem.resolve_query_instruction(self.args),
                }
            )
        payload.sort(key=lambda item: item["score"], reverse=True)
        return payload[: self.args.limit]

    def hybrid_search(self, query: str) -> list[dict[str, object]]:
        quality_model_key = str(sem.DEFAULT_QUALITY_MODEL_PATH.resolve())
        reranker_model_key = str(
            (
                Path(getattr(self.args, "reranker_model_path", None))
                if getattr(self.args, "reranker_model_path", None)
                else sem.DEFAULT_RERANKER_MODEL_PATH
            ).resolve()
        )
        formatted_query = sem.format_query_for_embedding(query, sem.resolve_query_instruction(self.args))
        fts_query = sem.build_fts_candidate_query(query)
        candidates: list[dict[str, object]] = []
        if fts_query:
            candidate_rows = list(
                self.conn.execute(
                    """
                    SELECT
                        f.rowid AS doc_id,
                        f.lead_id,
                        f.doc_type,
                        f.source_path,
                        d.title,
                        COALESCE(l.name, '') AS lead_name,
                        bm25(leadops_search_fts) AS fts_score
                    FROM leadops_search_fts f
                    LEFT JOIN leadops_search_documents d
                      ON d.id = f.rowid
                    LEFT JOIN leadops_leads l
                      ON l.lead_id = f.lead_id
                    WHERE leadops_search_fts MATCH ?
                    ORDER BY bm25(leadops_search_fts) ASC
                    LIMIT ?
                    """,
                    (fts_query, max(self.args.hybrid_rerank_limit, self.args.limit)),
                )
            )
            for row in candidate_rows:
                candidates.append(
                    {
                        "doc_id": row["doc_id"],
                        "lead_id": row["lead_id"],
                        "lead_name": row["lead_name"] or "",
                        "doc_type": row["doc_type"],
                        "title": row["title"] or "",
                        "source_path": row["source_path"],
                        "candidate_score": sem.stable_score(float(row["fts_score"]), 6),
                    }
                )
        if not candidates:
            rows = sem.load_embedding_rows(self.conn, quality_model_key)
            if not rows:
                raise SystemExit(
                    f"No quality-profile embeddings found in {self.db}. Run semantic_search.py --profile quality build-index first."
                )
            query_vector = self.embedder.encode([formatted_query])[0].astype(np.float32)
            query_norm = float(np.linalg.norm(query_vector))
            scored: list[dict[str, object]] = []
            for row in rows:
                vector = np.frombuffer(row["vector_blob"], dtype=np.float32)
                denom = max(float(row["embedding_dim"] and np.linalg.norm(vector) * query_norm), 1e-12)
                quality_score = float(np.dot(query_vector, vector) / denom)
                scored.append(
                    {
                        "doc_id": row["doc_id"],
                        "lead_id": row["lead_id"],
                        "lead_name": row["lead_name"] or "",
                        "doc_type": row["doc_type"],
                        "title": row["title"] or "",
                        "source_path": row["source_path"],
                        "candidate_score": sem.stable_score(quality_score, 6),
                    }
                )
            scored.sort(key=lambda item: item["candidate_score"], reverse=True)
            candidates = scored[: min(max(self.args.hybrid_rerank_limit, self.args.limit), len(scored))]
        rerank_limit = min(max(self.args.hybrid_rerank_limit, self.args.limit), len(candidates))
        candidates = candidates[:rerank_limit]
        texts = [sem.fetch_document_text(self.conn, int(item["doc_id"])) for item in candidates]
        rerank_strategy = getattr(self.args, "hybrid_rerank_strategy", "embedding")
        model_used = quality_model_key
        reranked_by = sem.DEFAULT_QUALITY_PROFILE
        candidate_source = "fts" if fts_query and candidates else sem.DEFAULT_QUALITY_PROFILE
        if rerank_strategy == "reranker":
            rerank_scores = self.reranker.rerank(query, texts, top_n=len(texts))
            model_used = reranker_model_key
            reranked_by = "reranker"
        else:
            rerank_query = self.embedder.encode([formatted_query])[0].astype(np.float32)
            rerank_docs = sem.encode_in_batches(self.embedder, texts, getattr(self.args, "batch_size", sem.DEFAULT_BATCH_SIZE)).astype(np.float32)
            rerank_query = rerank_query / np.linalg.norm(rerank_query)
            rerank_docs = rerank_docs / np.linalg.norm(rerank_docs, axis=1, keepdims=True)
            rerank_scores = rerank_docs @ rerank_query
        reranked: list[dict[str, object]] = []
        for item, rerank_score in zip(candidates, rerank_scores, strict=True):
            reranked.append(
                {
                    "lead_id": item["lead_id"],
                    "lead_name": item["lead_name"],
                    "doc_type": item["doc_type"],
                    "title": item["title"],
                    "source_path": item["source_path"],
                    "score": sem.stable_score(float(rerank_score), 6),
                    "candidate_score": sem.stable_score(float(item["candidate_score"]), 6),
                    "retrieval_profile": sem.DEFAULT_HYBRID_PROFILE,
                    "candidate_source": candidate_source,
                    "reranked_by": reranked_by,
                    "model_used": model_used,
                    "query_instruction": sem.resolve_query_instruction(self.args),
                }
            )
        reranked.sort(key=lambda item: item["score"], reverse=True)
        return reranked[: self.args.limit]


def run_profile_batch(db: Path, args: argparse.Namespace, queries: list[str]) -> list[dict[str, object]]:
    payload: list[dict[str, object]] = []
    started = time.perf_counter()
    with SearchSession(db, args) as session:
        warm_seconds = time.perf_counter() - started
        for query in queries:
            query_started = time.perf_counter()
            rows = session.search(query)
            payload.append(
                {
                    "query": query,
                    "elapsed_seconds": round(time.perf_counter() - query_started, 3),
                    "results": rows,
                }
            )
    total_seconds = round(time.perf_counter() - started, 3)
    return [
        {
            "profile": sem.resolve_profile(args),
            "db": str(db),
            "warm_seconds": round(warm_seconds, 3),
            "total_seconds": total_seconds,
            "queries": payload,
        }
    ]


def cleanup_between_profile_runs(pause_seconds: float = 2.0) -> None:
    sem.release_torch_cuda_memory()
    if pause_seconds > 0:
        time.sleep(pause_seconds)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run the same semantic queries against two profile DBs and compare the returned lead IDs."
    )
    parser.add_argument("--left-db", default=str(DEFAULT_LEFT_DB), help="Usually the canonical 4B quality DB")
    parser.add_argument("--right-db", default=str(DEFAULT_RIGHT_DB), help="Usually the rebuilt 0.6B comparison DB")
    parser.add_argument("--left-profile", default="quality")
    parser.add_argument("--right-profile", default="fast")
    parser.add_argument("--left-device", default=None, help="Optional device override for the left fast-profile runtime")
    parser.add_argument("--right-device", default=None, help="Optional device override for the right fast-profile runtime")
    parser.add_argument("--limit", type=int, default=5)
    parser.add_argument("--hybrid-rerank-limit", type=int, default=25)
    parser.add_argument("--hybrid-rerank-strategy", choices=["embedding", "reranker"], default="embedding")
    parser.add_argument("--query-instruction", default=sem.DEFAULT_QUERY_INSTRUCTION)
    parser.add_argument("--query", action="append", help="Repeatable query override")
    parser.add_argument(
        "--eval-file",
        default=str(DEFAULT_EVAL_FILE),
        help="Optional eval file (.json/.jsonl/.txt). JSON objects can include query, expected_lead_ids, and notes.",
    )
    args = parser.parse_args()

    left_db = Path(args.left_db).resolve()
    right_db = Path(args.right_db).resolve()
    cases = load_eval_cases(args)
    queries = [str(item["query"]) for item in cases]

    left_args = profile_args(
        db=left_db,
        profile=args.left_profile,
        limit=args.limit,
        device=args.left_device,
        query_instruction=args.query_instruction,
        hybrid_rerank_limit=args.hybrid_rerank_limit,
        hybrid_rerank_strategy=args.hybrid_rerank_strategy,
    )
    right_args = profile_args(
        db=right_db,
        profile=args.right_profile,
        limit=args.limit,
        device=args.right_device,
        query_instruction=args.query_instruction,
        hybrid_rerank_limit=args.hybrid_rerank_limit,
        hybrid_rerank_strategy=args.hybrid_rerank_strategy,
    )

    left_batch = run_profile_batch(left_db, left_args, queries)[0]
    cleanup_between_profile_runs()
    right_batch = run_profile_batch(right_db, right_args, queries)[0]
    cleanup_between_profile_runs(pause_seconds=0.0)

    left_map = {item["query"]: item for item in left_batch["queries"]}
    right_map = {item["query"]: item for item in right_batch["queries"]}
    payload = {
        "left_profile": left_batch["profile"],
        "left_db": left_batch["db"],
        "left_warm_seconds": left_batch["warm_seconds"],
        "left_total_seconds": left_batch["total_seconds"],
        "right_profile": right_batch["profile"],
        "right_db": right_batch["db"],
        "right_warm_seconds": right_batch["warm_seconds"],
        "right_total_seconds": right_batch["total_seconds"],
        "eval_file": str(Path(args.eval_file).resolve()) if args.eval_file else None,
        "queries": [],
    }
    for case in cases:
        query = str(case["query"])
        left = left_map[query]["results"]
        right = right_map[query]["results"]
        payload["queries"].append(
            {
                "id": case["id"],
                "query": query,
                "notes": case["notes"],
                "expected_lead_ids": case["expected_lead_ids"],
                "left_elapsed_seconds": left_map[query]["elapsed_seconds"],
                "right_elapsed_seconds": right_map[query]["elapsed_seconds"],
                "comparison": compare_query(left, right),
                "left_score": score_expected_hits(left, list(case["expected_lead_ids"])),
                "right_score": score_expected_hits(right, list(case["expected_lead_ids"])),
                "left_results": left,
                "right_results": right,
            }
        )

    payload["left_metrics"] = summarize_profile_metrics(payload["queries"], "left_score")
    payload["right_metrics"] = summarize_profile_metrics(payload["queries"], "right_score")

    print(json.dumps(payload, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
