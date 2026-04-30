from __future__ import annotations

import argparse
import json
import sqlite3
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

from semantic_search import DEFAULT_DB, DEFAULT_MODEL_PATH, Embedder


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_4B = REPO_ROOT / "ai-models" / "music" / "ACE-Step-1.5" / "checkpoints" / "Qwen3-Embedding-4B"
DEFAULT_MODEL_4B_GGUF = (
    REPO_ROOT
    / "ai-models"
    / "music"
    / "ACE-Step-1.5"
    / "checkpoints"
    / "Qwen3-Embedding-4B-GGUF"
    / "Qwen3-Embedding-4B-Q4_K_M.gguf"
)
DEFAULT_LLAMA_SERVER = REPO_ROOT / "ai-models" / "runtime" / "llama-cpp-cuda-b8508" / "llama-server.exe"


def sample_docs(db_path: Path, limit: int) -> list[str]:
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            """
            SELECT body_text
            FROM leadops_search_documents
            WHERE length(COALESCE(body_text, '')) > 0
            ORDER BY id ASC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [str(row[0]) for row in rows]


def benchmark_transformers_model(model_path: Path, docs: list[str], query: str, batch_size: int, device: str) -> dict[str, object]:
    started = time.perf_counter()
    embedder = Embedder(model_path=model_path, batch_size=batch_size, device=device)
    load_seconds = time.perf_counter() - started

    started = time.perf_counter()
    query_vec = embedder.encode([query])
    query_seconds = time.perf_counter() - started

    started = time.perf_counter()
    doc_vecs = embedder.encode(docs)
    docs_seconds = time.perf_counter() - started

    dim = int(query_vec.shape[1]) if len(query_vec.shape) == 2 else 0
    return {
        "model_path": str(model_path),
        "load_seconds": round(load_seconds, 3),
        "query_seconds": round(query_seconds, 3),
        "docs_count": len(docs),
        "docs_seconds": round(docs_seconds, 3),
        "docs_per_second": round((len(docs) / docs_seconds), 3) if docs_seconds > 0 else None,
        "embedding_dim": dim,
        "batch_size": batch_size,
        "device": device,
        "query_preview": query,
        "doc_matrix_shape": list(doc_vecs.shape),
    }


def wait_for_http_ready(url: str, timeout_seconds: float = 60.0) -> None:
    deadline = time.perf_counter() + timeout_seconds
    while time.perf_counter() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if 200 <= response.status < 500:
                    return
        except Exception:
            time.sleep(0.5)
    raise RuntimeError(f"Timed out waiting for server readiness: {url}")


def embed_via_openai_embeddings(endpoint: str, model_name: str, texts: list[str]) -> tuple[list[list[float]], dict[str, object]]:
    payload = json.dumps({"input": texts, "model": model_name}).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Embedding request failed: HTTP {exc.code}: {body}") from exc
    return [item["embedding"] for item in data["data"]], data


def benchmark_llama_server_model(
    server_path: Path,
    model_path: Path,
    docs: list[str],
    query: str,
    port: int,
    server_batch_size: int,
    ubatch_size: int,
    device: str,
) -> dict[str, object]:
    cmd = [
        str(server_path),
        "--model",
        str(model_path),
        "--embeddings",
        "--pooling",
        "mean",
        "--port",
        str(port),
        "--host",
        "127.0.0.1",
        "--device",
        device,
        "--gpu-layers",
        "auto",
        "--ctx-size",
        "4096",
        "--batch-size",
        str(server_batch_size),
        "--ubatch-size",
        str(ubatch_size),
        "--no-webui",
    ]
    started = time.perf_counter()
    proc = subprocess.Popen(
        cmd,
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        wait_for_http_ready(f"http://127.0.0.1:{port}/health", timeout_seconds=90)
        load_seconds = time.perf_counter() - started

        endpoint = f"http://127.0.0.1:{port}/v1/embeddings"
        model_name = model_path.stem

        started = time.perf_counter()
        query_vecs, _query_meta = embed_via_openai_embeddings(endpoint, model_name, [query])
        query_seconds = time.perf_counter() - started

        started = time.perf_counter()
        doc_vecs, _doc_meta = embed_via_openai_embeddings(endpoint, model_name, docs)
        docs_seconds = time.perf_counter() - started

        dim = len(query_vecs[0]) if query_vecs else 0
        return {
            "backend": "llama-server",
            "model_path": str(model_path),
            "server_path": str(server_path),
            "load_seconds": round(load_seconds, 3),
            "query_seconds": round(query_seconds, 3),
            "docs_count": len(docs),
            "docs_seconds": round(docs_seconds, 3),
            "docs_per_second": round((len(docs) / docs_seconds), 3) if docs_seconds > 0 else None,
            "embedding_dim": dim,
            "batch_size": server_batch_size,
            "ubatch_size": ubatch_size,
            "device": device,
            "query_preview": query,
            "doc_matrix_shape": [len(doc_vecs), dim],
        }
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark local embedding models against live leadops search docs.")
    parser.add_argument("--db", default=str(DEFAULT_DB))
    parser.add_argument("--query", default="small business website audit with trust and contact issues")
    parser.add_argument("--docs", type=int, default=16)
    parser.add_argument("--batch-size", type=int, default=8, help="Batch size for transformers backend")
    parser.add_argument("--device", default="cpu", help="Device for transformers backend")
    parser.add_argument(
        "--backend",
        choices=["transformers", "llama-server", "both"],
        default="transformers",
        help="Embedding runtime to benchmark",
    )
    parser.add_argument("--model", action="append", help="Specific model path(s) to benchmark")
    parser.add_argument("--llama-server-path", default=str(DEFAULT_LLAMA_SERVER))
    parser.add_argument("--llama-port", type=int, default=8092)
    parser.add_argument("--llama-device", default="CUDA0")
    parser.add_argument("--llama-batch-size", type=int, default=512)
    parser.add_argument("--llama-ubatch-size", type=int, default=512)
    args = parser.parse_args()

    db_path = Path(args.db).resolve()
    docs = sample_docs(db_path, args.docs)
    if not docs:
        raise SystemExit("No search documents found in crm.sqlite")

    payload: list[dict[str, object]] = []

    if args.backend in {"transformers", "both"}:
        model_paths = [Path(path).resolve() for path in args.model] if args.model else [DEFAULT_MODEL_PATH, DEFAULT_MODEL_4B]
        for model_path in model_paths:
            if not model_path.exists():
                payload.append({"backend": "transformers", "model_path": str(model_path), "missing": True})
                continue
            payload.append(benchmark_transformers_model(model_path, docs, args.query, args.batch_size, args.device))

    if args.backend in {"llama-server", "both"}:
        model_path = Path(args.model[0]).resolve() if args.model else DEFAULT_MODEL_4B_GGUF
        server_path = Path(args.llama_server_path).resolve()
        if not model_path.exists():
            payload.append({"backend": "llama-server", "model_path": str(model_path), "missing": True})
        elif not server_path.exists():
            payload.append({"backend": "llama-server", "server_path": str(server_path), "missing": True})
        else:
            payload.append(
                benchmark_llama_server_model(
                    server_path=server_path,
                    model_path=model_path,
                    docs=docs,
                    query=args.query,
                    port=args.llama_port,
                    server_batch_size=args.llama_batch_size,
                    ubatch_size=args.llama_ubatch_size,
                    device=args.llama_device,
                )
            )
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
