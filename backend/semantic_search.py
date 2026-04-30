from __future__ import annotations

import argparse
import atexit
import contextlib
import gc
import json
import os
import re
import sqlite3
import subprocess
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import numpy as np

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB = REPO_ROOT / "crm.sqlite"
DEFAULT_MODEL_PATH = REPO_ROOT / "ai-models" / "music" / "ACE-Step-1.5" / "checkpoints" / "Qwen3-Embedding-0.6B"
DEFAULT_QUALITY_MODEL_PATH = (
    REPO_ROOT
    / "ai-models"
    / "music"
    / "ACE-Step-1.5"
    / "checkpoints"
    / "Qwen3-Embedding-4B-GGUF"
    / "Qwen3-Embedding-4B-Q4_K_M.gguf"
)
DEFAULT_RERANKER_MODEL_PATH = (
    REPO_ROOT
    / "ai-models"
    / "music"
    / "ACE-Step-1.5"
    / "checkpoints"
    / "Qwen3-Reranker-0.6B"
)
DEFAULT_LLAMA_SERVER_PATH = REPO_ROOT / "ai-models" / "runtime" / "llama-cpp-cuda-b8508" / "llama-server.exe"
DEFAULT_BATCH_SIZE = 16
MAX_TEXT_CHARS = 4000
MAX_LLAMA_TEXT_CHARS = 1400
DEFAULT_FAST_PROFILE = "fast"
DEFAULT_QUALITY_PROFILE = "quality"
DEFAULT_HYBRID_PROFILE = "hybrid"
DEFAULT_PROFILE = DEFAULT_FAST_PROFILE
DEFAULT_QUERY_INSTRUCTION = (
    "Given a lead-ops retrieval query, retrieve relevant business, audit, outreach, and profile passages "
    "that best answer the query."
)
VECTOR_EMBEDDINGS_PK = ("doc_id", "embedding_model")


@dataclass
class Embedder:
    model_path: Path
    device: str = "cpu"
    batch_size: int = DEFAULT_BATCH_SIZE
    max_length: int = 512

    def __post_init__(self) -> None:
        import torch
        from transformers import AutoModel, AutoTokenizer
        from transformers.utils import logging as hf_logging

        hf_logging.disable_progress_bar()
        model_dtype = torch.float16 if str(self.device).startswith("cuda") else torch.float32
        self.torch = torch
        self.tokenizer = AutoTokenizer.from_pretrained(str(self.model_path), local_files_only=True)
        self.model = AutoModel.from_pretrained(
            str(self.model_path),
            local_files_only=True,
            dtype=model_dtype,
        )
        self.model.to(self.device)
        self.model.eval()

    def encode(self, texts: list[str]) -> np.ndarray:
        vectors: list[np.ndarray] = []
        for start in range(0, len(texts), self.batch_size):
            batch = [text[:MAX_TEXT_CHARS] for text in texts[start : start + self.batch_size]]
            encoded = self.tokenizer(
                batch,
                padding=True,
                truncation=True,
                max_length=self.max_length,
                return_tensors="pt",
            )
            encoded = {key: value.to(self.device) for key, value in encoded.items()}
            with self.torch.no_grad():
                outputs = self.model(**encoded)
                attention_mask = encoded["attention_mask"].unsqueeze(-1)
                hidden = outputs.last_hidden_state
                masked = hidden * attention_mask
                pooled = masked.sum(dim=1) / attention_mask.sum(dim=1).clamp(min=1)
                pooled = self.torch.nn.functional.normalize(pooled, p=2, dim=1)
            vectors.append(pooled.cpu().numpy().astype(np.float32))
        if not vectors:
            return np.zeros((0, 0), dtype=np.float32)
        return np.concatenate(vectors, axis=0)

    def close(self) -> None:
        model = getattr(self, "model", None)
        tokenizer = getattr(self, "tokenizer", None)
        if model is not None:
            del self.model
        if tokenizer is not None:
            del self.tokenizer
        release_torch_cuda_memory()


@dataclass
class LlamaServerEmbedder:
    server_path: Path
    model_path: Path
    port: int = 8092
    device: str = "CUDA0"
    batch_size: int = 512
    ubatch_size: int = 512
    host: str = "127.0.0.1"
    _proc: subprocess.Popen[str] | None = None

    @property
    def model_name(self) -> str:
        return self.model_path.stem

    @property
    def endpoint(self) -> str:
        return f"http://{self.host}:{self.port}/v1/embeddings"

    @property
    def health_url(self) -> str:
        return f"http://{self.host}:{self.port}/health"

    def start(self) -> None:
        if self._proc is not None:
            return
        cmd = [
            str(self.server_path),
            "--model",
            str(self.model_path),
            "--embeddings",
            "--pooling",
            "mean",
            "--port",
            str(self.port),
            "--host",
            self.host,
            "--device",
            self.device,
            "--gpu-layers",
            "auto",
            "--ctx-size",
            "4096",
            "--batch-size",
            str(self.batch_size),
            "--ubatch-size",
            str(self.ubatch_size),
            "--no-webui",
        ]
        self._proc = subprocess.Popen(
            cmd,
            cwd=str(REPO_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        atexit.register(self.stop)
        wait_for_http_ready(self.health_url, timeout_seconds=90)

    def stop(self) -> None:
        if self._proc is None:
            return
        self._proc.terminate()
        try:
            self._proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self._proc.kill()
            self._proc.wait(timeout=5)
        finally:
            self._proc = None

    def encode(self, texts: list[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, 0), dtype=np.float32)
        clipped = [text[:MAX_LLAMA_TEXT_CHARS] for text in texts]
        payload = json.dumps({"input": clipped, "model": self.model_name}).encode("utf-8")
        req = urllib.request.Request(
            self.endpoint,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise SystemExit(f"Embedding request failed: HTTP {exc.code}: {body}") from exc
        return np.array([item["embedding"] for item in data["data"]], dtype=np.float32)


@dataclass
class LlamaServerReranker:
    server_path: Path
    model_path: Path
    port: int = 8094
    device: str = "CUDA0"
    batch_size: int = 2048
    ubatch_size: int = 2048
    host: str = "127.0.0.1"
    _proc: subprocess.Popen[str] | None = None

    @property
    def model_name(self) -> str:
        return self.model_path.stem

    @property
    def endpoint(self) -> str:
        return f"http://{self.host}:{self.port}/v1/rerank"

    @property
    def health_url(self) -> str:
        return f"http://{self.host}:{self.port}/health"

    def start(self) -> None:
        if self._proc is not None:
            return
        cmd = [
            str(self.server_path),
            "--model",
            str(self.model_path),
            "--reranking",
            "--pooling",
            "rank",
            "--port",
            str(self.port),
            "--host",
            self.host,
            "--device",
            self.device,
            "--gpu-layers",
            "auto",
            "--ctx-size",
            "4096",
            "--batch-size",
            str(self.batch_size),
            "--ubatch-size",
            str(self.ubatch_size),
            "--no-webui",
        ]
        self._proc = subprocess.Popen(
            cmd,
            cwd=str(REPO_ROOT),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        atexit.register(self.stop)
        wait_for_http_ready(self.health_url, timeout_seconds=90)

    def stop(self) -> None:
        if self._proc is None:
            return
        self._proc.terminate()
        try:
            self._proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self._proc.kill()
            self._proc.wait(timeout=5)
        finally:
            self._proc = None

    def rerank(self, query: str, documents: list[str], top_n: int | None = None) -> list[float]:
        if not documents:
            return []
        payload = json.dumps(
            {
                "model": self.model_name,
                "query": query[:MAX_LLAMA_TEXT_CHARS],
                "documents": [doc[:MAX_LLAMA_TEXT_CHARS] for doc in documents],
                "top_n": top_n or len(documents),
            }
        ).encode("utf-8")
        req = urllib.request.Request(
            self.endpoint,
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                data = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise SystemExit(f"Rerank request failed: HTTP {exc.code}: {body}") from exc

        scores = [0.0] * len(documents)
        for item in data.get("results", []):
            index = int(item["index"])
            scores[index] = float(item["relevance_score"])
        return scores


@dataclass
class TransformersReranker:
    model_path: Path
    device: str = "cpu"
    batch_size: int = 2
    max_length: int = 3072

    def __post_init__(self) -> None:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
        from transformers.utils import logging as hf_logging

        hf_logging.disable_progress_bar()
        self.torch = torch
        self.device = resolve_torch_device(self.device)
        model_dtype = torch.float16 if str(self.device).startswith("cuda") else torch.float32
        self.tokenizer = AutoTokenizer.from_pretrained(
            str(self.model_path),
            local_files_only=True,
            padding_side="left",
        )
        self.model = AutoModelForCausalLM.from_pretrained(
            str(self.model_path),
            local_files_only=True,
            dtype=model_dtype,
        )
        self.model.to(self.device)
        self.model.eval()
        self.tokenizer.pad_token = self.tokenizer.eos_token or self.tokenizer.pad_token
        self.token_false_id = self.tokenizer("no", add_special_tokens=False).input_ids[0]
        self.token_true_id = self.tokenizer("yes", add_special_tokens=False).input_ids[0]
        prefix = (
            "<|im_start|>system\n"
            "Judge whether the Document meets the requirements based on the Query and the Instruct provided. "
            "Note that the answer can only be \"yes\" or \"no\"."
            "<|im_end|>\n<|im_start|>user\n"
        )
        suffix = "<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n"
        self.prefix_tokens = self.tokenizer.encode(prefix, add_special_tokens=False)
        self.suffix_tokens = self.tokenizer.encode(suffix, add_special_tokens=False)

    def format_pair(self, instruction: str | None, query: str, document: str) -> str:
        task_instruction = (instruction or "").strip() or DEFAULT_QUERY_INSTRUCTION
        return (
            f"<Instruct>: {task_instruction}\n"
            f"<Query>: {query.strip()}\n"
            f"<Document>: {document.strip()}"
        )

    def process_inputs(self, pairs: list[str]) -> dict[str, object]:
        max_body_length = max(self.max_length - len(self.prefix_tokens) - len(self.suffix_tokens), 1)
        inputs = self.tokenizer(
            pairs,
            padding=False,
            truncation="longest_first",
            return_attention_mask=False,
            max_length=max_body_length,
        )
        for index, token_ids in enumerate(inputs["input_ids"]):
            inputs["input_ids"][index] = self.prefix_tokens + token_ids + self.suffix_tokens
        padded = self.tokenizer.pad(inputs, padding=True, return_tensors="pt")
        return {key: value.to(self.device) for key, value in padded.items()}

    def rerank(self, query: str, documents: list[str], top_n: int | None = None, instruction: str | None = None) -> list[float]:
        if not documents:
            return []
        scores: list[float] = []
        for start in range(0, len(documents), self.batch_size):
            batch_docs = documents[start : start + self.batch_size]
            pairs = [self.format_pair(instruction, query, doc) for doc in batch_docs]
            inputs = self.process_inputs(pairs)
            with self.torch.no_grad():
                batch_logits = self.model(
                    **inputs,
                    use_cache=False,
                    logits_to_keep=1,
                ).logits[:, -1, :]
                true_vector = batch_logits[:, self.token_true_id]
                false_vector = batch_logits[:, self.token_false_id]
                batch_scores = self.torch.stack([false_vector, true_vector], dim=1)
                batch_scores = self.torch.nn.functional.log_softmax(batch_scores, dim=1)
                batch_scores = batch_scores[:, 1].exp().tolist()
            scores.extend(float(score) for score in batch_scores)
        return scores[: top_n] if top_n else scores

    def close(self) -> None:
        model = getattr(self, "model", None)
        tokenizer = getattr(self, "tokenizer", None)
        if model is not None:
            del self.model
        if tokenizer is not None:
            del self.tokenizer
        release_torch_cuda_memory()


def connect(db_path: Path) -> sqlite3.Connection:
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
        (table_name,),
    ).fetchone()
    return row is not None


def table_columns(conn: sqlite3.Connection, table_name: str) -> list[sqlite3.Row]:
    return list(conn.execute(f"PRAGMA table_info({table_name})"))


def table_primary_key(conn: sqlite3.Connection, table_name: str) -> tuple[str, ...]:
    columns = table_columns(conn, table_name)
    keyed = sorted(
        ((int(column["pk"]), str(column["name"])) for column in columns if int(column["pk"]) > 0),
        key=lambda item: item[0],
    )
    return tuple(name for _, name in keyed)


def index_exists(conn: sqlite3.Connection, index_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1",
        (index_name,),
    ).fetchone()
    return row is not None


def migrate_vector_embeddings_table(conn: sqlite3.Connection) -> None:
    table_name = "leadops_vector_embeddings"
    if not table_exists(conn, table_name):
        return
    if table_primary_key(conn, table_name) == VECTOR_EMBEDDINGS_PK:
        return
    legacy_table = f"{table_name}__legacy_20260329"
    conn.execute(f"ALTER TABLE {table_name} RENAME TO {legacy_table}")
    conn.execute(
        """
        CREATE TABLE leadops_vector_embeddings (
            doc_id INTEGER NOT NULL,
            lead_id INTEGER,
            doc_type TEXT NOT NULL,
            source_path TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            embedding_model TEXT NOT NULL,
            embedding_dim INTEGER NOT NULL,
            vector_blob BLOB NOT NULL,
            vector_norm REAL NOT NULL,
            indexed_at TEXT NOT NULL,
            PRIMARY KEY (doc_id, embedding_model),
            FOREIGN KEY (doc_id) REFERENCES leadops_search_documents(id),
            FOREIGN KEY (lead_id) REFERENCES leadops_leads(lead_id)
        )
        """
    )
    conn.execute(
        f"""
        INSERT OR REPLACE INTO leadops_vector_embeddings (
            doc_id, lead_id, doc_type, source_path, content_hash,
            embedding_model, embedding_dim, vector_blob, vector_norm, indexed_at
        )
        SELECT
            doc_id, lead_id, doc_type, source_path, content_hash,
            embedding_model, embedding_dim, vector_blob, vector_norm, indexed_at
        FROM {legacy_table}
        WHERE COALESCE(embedding_model, '') <> ''
        """
    )
    conn.execute(f"DROP TABLE {legacy_table}")


def migrate_vector_queue_table(conn: sqlite3.Connection) -> None:
    table_name = "leadops_vector_index_queue"
    if not table_exists(conn, table_name):
        return
    columns = {str(column["name"]) for column in table_columns(conn, table_name)}
    if "embedding_model" in columns and index_exists(conn, "idx_leadops_vector_index_queue_doc_model"):
        return
    legacy_table = f"{table_name}__legacy_20260329"
    conn.execute(f"ALTER TABLE {table_name} RENAME TO {legacy_table}")
    conn.execute(
        """
        CREATE TABLE leadops_vector_index_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id INTEGER NOT NULL,
            lead_id INTEGER,
            doc_type TEXT NOT NULL,
            source_path TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            embedding_status TEXT NOT NULL DEFAULT 'pending',
            embedding_model TEXT NOT NULL DEFAULT '',
            embedded_at TEXT,
            FOREIGN KEY (doc_id) REFERENCES leadops_search_documents(id),
            FOREIGN KEY (lead_id) REFERENCES leadops_leads(lead_id)
        )
        """
    )
    conn.execute(
        f"""
        INSERT INTO leadops_vector_index_queue (
            doc_id, lead_id, doc_type, source_path, content_hash,
            embedding_status, embedding_model, embedded_at
        )
        SELECT
            doc_id,
            lead_id,
            doc_type,
            source_path,
            content_hash,
            COALESCE(NULLIF(embedding_status, ''), 'pending'),
            COALESCE(embedding_model, ''),
            embedded_at
        FROM {legacy_table}
        """
    )
    conn.execute(f"DROP TABLE {legacy_table}")


def ensure_schema(conn: sqlite3.Connection) -> None:
    migrate_vector_embeddings_table(conn)
    migrate_vector_queue_table(conn)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS leadops_vector_embeddings (
            doc_id INTEGER NOT NULL,
            lead_id INTEGER,
            doc_type TEXT NOT NULL,
            source_path TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            embedding_model TEXT NOT NULL,
            embedding_dim INTEGER NOT NULL,
            vector_blob BLOB NOT NULL,
            vector_norm REAL NOT NULL,
            indexed_at TEXT NOT NULL,
            PRIMARY KEY (doc_id, embedding_model),
            FOREIGN KEY (doc_id) REFERENCES leadops_search_documents(id),
            FOREIGN KEY (lead_id) REFERENCES leadops_leads(lead_id)
        );

        CREATE TABLE IF NOT EXISTS leadops_vector_index_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id INTEGER NOT NULL,
            lead_id INTEGER,
            doc_type TEXT NOT NULL,
            source_path TEXT NOT NULL,
            content_hash TEXT NOT NULL,
            embedding_status TEXT NOT NULL DEFAULT 'pending',
            embedding_model TEXT NOT NULL DEFAULT '',
            embedded_at TEXT,
            FOREIGN KEY (doc_id) REFERENCES leadops_search_documents(id),
            FOREIGN KEY (lead_id) REFERENCES leadops_leads(lead_id)
        );

        CREATE INDEX IF NOT EXISTS idx_leadops_vector_embeddings_lead_id
            ON leadops_vector_embeddings(lead_id);
        CREATE INDEX IF NOT EXISTS idx_leadops_vector_embeddings_model
            ON leadops_vector_embeddings(embedding_model);
        CREATE INDEX IF NOT EXISTS idx_leadops_vector_index_queue_status
            ON leadops_vector_index_queue(embedding_status);
        CREATE INDEX IF NOT EXISTS idx_leadops_vector_index_queue_model
            ON leadops_vector_index_queue(embedding_model);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_leadops_vector_index_queue_doc_model
            ON leadops_vector_index_queue(doc_id, embedding_model);
        """
    )
    blank_queue_rows = conn.execute(
        "SELECT COUNT(*) FROM leadops_vector_index_queue WHERE COALESCE(embedding_model, '') = ''"
    ).fetchone()[0]
    if int(blank_queue_rows or 0) > 0:
        conn.execute("DELETE FROM leadops_vector_index_queue WHERE COALESCE(embedding_model, '') = ''")
        conn.commit()


def output_json(payload: object) -> None:
    print(json.dumps(payload, indent=2, ensure_ascii=False))


def stable_score(value: float, decimals: int = 6) -> float:
    rounded = round(float(value), decimals)
    if rounded != 0.0:
        return rounded
    return float(f"{float(value):.12g}")


def text_table(rows: list[dict[str, object]]) -> str:
    if not rows:
        return "(no rows)"
    keys = list(rows[0].keys())
    widths = {key: len(str(key)) for key in keys}
    for row in rows:
        for key in keys:
            widths[key] = min(max(widths[key], len(str(row.get(key, "")))), 120)

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
        lines.append(" | ".join(crop(row.get(key, ""), widths[key]).ljust(widths[key]) for key in keys))
    return "\n".join(lines)


def print_text(text: str) -> None:
    encoding = getattr(__import__("sys").stdout, "encoding", None) or "utf-8"
    safe_text = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
    print(safe_text)


def wait_for_http_ready(url: str, timeout_seconds: float = 60.0) -> None:
    deadline = time.perf_counter() + timeout_seconds
    while time.perf_counter() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=2) as response:
                if 200 <= response.status < 500:
                    return
        except Exception:
            time.sleep(0.5)
    raise SystemExit(f"Timed out waiting for server readiness: {url}")


def release_torch_cuda_memory() -> None:
    gc.collect()
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
            with contextlib.suppress(Exception):
                torch.cuda.ipc_collect()
    except Exception:
        return


def encode_in_batches(embedder: object, texts: list[str], batch_size: int) -> np.ndarray:
    if not texts:
        return np.zeros((0, 0), dtype=np.float32)
    vectors: list[np.ndarray] = []
    step = max(int(batch_size), 1)
    for start in range(0, len(texts), step):
        chunk = texts[start : start + step]
        chunk_vectors = embedder.encode(chunk).astype(np.float32)
        vectors.append(chunk_vectors)
    return np.concatenate(vectors, axis=0)


def ensure_profile_queue_rows(conn: sqlite3.Connection, model_name: str) -> None:
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
    conn.commit()


def fetch_pending_rows(conn: sqlite3.Connection, args: argparse.Namespace, limit: int) -> list[sqlite3.Row]:
    model_name = resolve_model_key(args)
    ensure_profile_queue_rows(conn, model_name)
    return list(
        conn.execute(
            """
            SELECT viq.id, viq.doc_id, viq.lead_id, viq.doc_type, viq.source_path, viq.content_hash, d.body_text
            FROM leadops_vector_index_queue viq
            JOIN leadops_search_documents d
              ON d.id = viq.doc_id
            WHERE viq.embedding_model = ?
              AND lower(COALESCE(viq.embedding_status, 'pending')) <> 'embedded'
            ORDER BY viq.id ASC
            LIMIT ?
            """,
            (model_name, limit),
        )
    )


def index_pending_rows(
    conn: sqlite3.Connection,
    args: argparse.Namespace,
    pending_rows: list[sqlite3.Row],
    *,
    embedder: object | None = None,
) -> dict[str, object]:
    ensure_schema(conn)
    if not pending_rows:
        return {"indexed_docs": 0, "model_path": resolve_model_key(args), "indexed_at": None}

    model_name = resolve_model_key(args)
    texts = [str(row["body_text"] or "") for row in pending_rows]
    if embedder is None:
        with create_embedder(args) as created_embedder:
            vectors = encode_in_batches(created_embedder, texts, args.batch_size)
    else:
        vectors = encode_in_batches(embedder, texts, args.batch_size)
    indexed_at = datetime.now().isoformat(timespec="seconds")

    for row, vector in zip(pending_rows, vectors, strict=True):
        vector_blob = vector.astype(np.float32).tobytes()
        norm = float(np.linalg.norm(vector))
        conn.execute(
            """
            INSERT INTO leadops_vector_embeddings (
                doc_id, lead_id, doc_type, source_path, content_hash,
                embedding_model, embedding_dim, vector_blob, vector_norm, indexed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(doc_id, embedding_model) DO UPDATE SET
                lead_id=excluded.lead_id,
                doc_type=excluded.doc_type,
                source_path=excluded.source_path,
                content_hash=excluded.content_hash,
                embedding_dim=excluded.embedding_dim,
                vector_blob=excluded.vector_blob,
                vector_norm=excluded.vector_norm,
                indexed_at=excluded.indexed_at
            """,
            (
                int(row["doc_id"]),
                int(row["lead_id"]) if row["lead_id"] is not None else None,
                str(row["doc_type"]),
                str(row["source_path"]),
                str(row["content_hash"]),
                model_name,
                int(vector.shape[0]),
                sqlite3.Binary(vector_blob),
                norm,
                indexed_at,
            ),
        )
        conn.execute(
            """
            UPDATE leadops_vector_index_queue
            SET embedding_status = 'embedded',
                embedded_at = ?
            WHERE doc_id = ?
              AND embedding_model = ?
            """,
            (indexed_at, int(row["doc_id"]), model_name),
        )
    conn.commit()
    return {
        "indexed_docs": len(pending_rows),
        "model_path": model_name,
        "indexed_at": indexed_at,
    }


def resolve_fast_device(device: str | None) -> str:
    if device:
        return device
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def resolve_torch_device(device: str | None) -> str:
    if device:
        lowered = str(device).strip().lower()
        if lowered.startswith("cuda"):
            return "cuda"
        if lowered.startswith("cpu"):
            return "cpu"
        return lowered
    return resolve_fast_device(None)


def resolve_profile(args: argparse.Namespace) -> str:
    return getattr(args, "profile", DEFAULT_PROFILE)


def resolve_model_key(args: argparse.Namespace) -> str:
    profile = resolve_profile(args)
    if profile == DEFAULT_QUALITY_PROFILE:
        return str((Path(args.model_path) if args.model_path else DEFAULT_QUALITY_MODEL_PATH).resolve())
    if profile == DEFAULT_HYBRID_PROFILE:
        return "hybrid"
    return str((Path(args.model_path) if args.model_path else DEFAULT_MODEL_PATH).resolve())


def resolve_query_instruction(args: argparse.Namespace) -> str:
    return getattr(args, "query_instruction", DEFAULT_QUERY_INSTRUCTION)


def format_query_for_embedding(query: str, instruction: str | None) -> str:
    cleaned_query = query.strip()
    cleaned_instruction = (instruction or "").strip()
    if not cleaned_instruction:
        return cleaned_query
    lowered = cleaned_query.lower()
    if lowered.startswith("instruct:") and "\nquery:" in lowered:
        return cleaned_query
    return f"Instruct: {cleaned_instruction}\nQuery: {cleaned_query}"


def tokenize_fts_query(query: str, *, limit: int = 10) -> list[str]:
    stopwords = {
        "the", "and", "for", "with", "that", "this", "from", "into", "your", "about", "have", "will",
        "does", "just", "than", "then", "they", "them", "their", "what", "when", "where", "which",
        "like", "been", "being", "also", "over", "under", "best", "more", "most", "very", "real",
        "small", "large", "lead", "ops", "query",
    }
    tokens: list[str] = []
    for match in re.finditer(r"[A-Za-z0-9][A-Za-z0-9_-]{2,}", query.lower()):
        token = match.group(0)
        if token in stopwords:
            continue
        if token not in tokens:
            tokens.append(token)
        if len(tokens) >= limit:
            break
    return tokens


def build_fts_candidate_query(query: str) -> str:
    tokens = tokenize_fts_query(query)
    if not tokens:
        return ""
    return " OR ".join(f'"{token}"' for token in tokens)


def fetch_document_text(conn: sqlite3.Connection, doc_id: int) -> str:
    row = conn.execute("SELECT body_text FROM leadops_search_documents WHERE id = ?", (doc_id,)).fetchone()
    return str((row[0] if row else "") or "")


def load_embedding_rows(conn: sqlite3.Connection, model_name: str) -> list[sqlite3.Row]:
    ensure_profile_queue_rows(conn, model_name)
    return list(
        conn.execute(
            """
            SELECT ve.doc_id, ve.lead_id, ve.doc_type, ve.source_path, ve.content_hash,
                   ve.embedding_model, ve.embedding_dim, ve.vector_blob,
                   d.title, l.name AS lead_name
            FROM leadops_vector_embeddings ve
            LEFT JOIN leadops_search_documents d
              ON d.id = ve.doc_id
            LEFT JOIN leadops_leads l
              ON l.lead_id = ve.lead_id
            WHERE ve.embedding_model = ?
            """,
            (model_name,),
        )
    )


def build_quality_args(args: argparse.Namespace) -> argparse.Namespace:
    return argparse.Namespace(
        profile=DEFAULT_QUALITY_PROFILE,
        model_path=None,
        device=None,
        batch_size=DEFAULT_BATCH_SIZE,
        llama_server_path=getattr(args, "llama_server_path", str(DEFAULT_LLAMA_SERVER_PATH)),
        llama_port=getattr(args, "llama_port", 8092),
        llama_device=getattr(args, "llama_device", "CUDA0"),
        llama_batch_size=getattr(args, "llama_batch_size", 2048),
        llama_ubatch_size=getattr(args, "llama_ubatch_size", 2048),
        query_instruction=resolve_query_instruction(args),
    )


@contextlib.contextmanager
def create_embedder(args: argparse.Namespace):
    profile = resolve_profile(args)
    if profile == DEFAULT_QUALITY_PROFILE:
        model_path = (Path(args.model_path) if args.model_path else DEFAULT_QUALITY_MODEL_PATH).resolve()
        server_path = (Path(args.llama_server_path) if args.llama_server_path else DEFAULT_LLAMA_SERVER_PATH).resolve()
        if not model_path.exists():
            raise SystemExit(f"Quality model not found: {model_path}")
        if not server_path.exists():
            raise SystemExit(f"llama-server not found: {server_path}")
        embedder = LlamaServerEmbedder(
            server_path=server_path,
            model_path=model_path,
            port=args.llama_port,
            device=args.llama_device,
            batch_size=args.llama_batch_size,
            ubatch_size=args.llama_ubatch_size,
        )
        embedder.start()
        try:
            yield embedder
        finally:
            embedder.stop()
        return

    model_path = (Path(args.model_path) if args.model_path else DEFAULT_MODEL_PATH).resolve()
    if not model_path.exists():
        raise SystemExit(f"Model not found: {model_path}")
    embedder = Embedder(
        model_path=model_path,
        batch_size=getattr(args, "batch_size", DEFAULT_BATCH_SIZE),
        device=resolve_fast_device(getattr(args, "device", None)),
    )
    try:
        yield embedder
    finally:
        embedder.close()


@contextlib.contextmanager
def create_reranker(args: argparse.Namespace):
    model_path = (Path(getattr(args, "reranker_model_path", None)) if getattr(args, "reranker_model_path", None) else DEFAULT_RERANKER_MODEL_PATH).resolve()
    if not model_path.exists():
        raise SystemExit(f"Reranker model not found: {model_path}")
    if model_path.suffix.lower() == ".gguf":
        server_path = (Path(getattr(args, "reranker_server_path", None)) if getattr(args, "reranker_server_path", None) else DEFAULT_LLAMA_SERVER_PATH).resolve()
        if not server_path.exists():
            raise SystemExit(f"Reranker server not found: {server_path}")
        reranker = LlamaServerReranker(
            server_path=server_path,
            model_path=model_path,
            port=getattr(args, "reranker_port", 8094),
            device=getattr(args, "reranker_device", "CUDA0"),
            batch_size=getattr(args, "reranker_batch_size", 2048),
            ubatch_size=getattr(args, "reranker_ubatch_size", 2048),
        )
        reranker.start()
        try:
            yield reranker
        finally:
            reranker.stop()
        return

    reranker = TransformersReranker(
        model_path=model_path,
        device=getattr(args, "reranker_device", None),
        batch_size=max(1, min(int(getattr(args, "reranker_batch_size", 2)), 2)),
    )
    try:
        yield reranker
    finally:
        reranker.close()


def build_index(conn: sqlite3.Connection, args: argparse.Namespace) -> None:
    pending_rows = fetch_pending_rows(conn, args, args.limit)
    if not pending_rows:
        print_text("No pending vector documents.")
        return
    payload = index_pending_rows(conn, args, pending_rows)
    output_json(payload) if args.json else print_text(text_table([payload]))


def build_index_loop(conn: sqlite3.Connection, args: argparse.Namespace) -> None:
    ensure_schema(conn)
    total_indexed = 0
    batches_completed = 0
    started_at = time.perf_counter()
    last_payload: dict[str, object] | None = None

    with create_embedder(args) as embedder:
        while True:
            pending_rows = fetch_pending_rows(conn, args, args.limit)
            if not pending_rows:
                break
            payload = index_pending_rows(conn, args, pending_rows, embedder=embedder)
            total_indexed += int(payload["indexed_docs"])
            batches_completed += 1
            last_payload = payload
            if getattr(args, "sleep_seconds", 0) > 0:
                time.sleep(float(args.sleep_seconds))
            if getattr(args, "max_batches", 0) and batches_completed >= int(args.max_batches):
                break

    if total_indexed == 0:
        print_text("No pending vector documents.")
        return

    final_payload = {
        "indexed_docs": total_indexed,
        "batches_completed": batches_completed,
        "per_batch_limit": args.limit,
        "sleep_seconds": float(getattr(args, "sleep_seconds", 0)),
        "model_path": resolve_model_key(args),
        "started_at": datetime.fromtimestamp(time.time() - (time.perf_counter() - started_at)).isoformat(timespec="seconds"),
        "last_indexed_at": last_payload["indexed_at"] if last_payload else None,
        "elapsed_seconds": round(time.perf_counter() - started_at, 3),
    }
    output_json(final_payload) if args.json else print_text(text_table([final_payload]))


def semantic_search(conn: sqlite3.Connection, args: argparse.Namespace) -> None:
    ensure_schema(conn)
    profile = resolve_profile(args)
    if profile == DEFAULT_HYBRID_PROFILE:
        hybrid_semantic_search(conn, args)
        return

    model_name = resolve_model_key(args)
    rows = load_embedding_rows(conn, model_name)
    if not rows:
        raise SystemExit(
            "No embeddings found for this model. Run `python scripts/maintenance/semantic_search.py build-index` first."
        )

    formatted_query = format_query_for_embedding(args.query, resolve_query_instruction(args))
    with create_embedder(args) as embedder:
        query_vector = embedder.encode([formatted_query])[0].astype(np.float32)
    query_norm = float(np.linalg.norm(query_vector))
    results: list[dict[str, object]] = []
    for row in rows:
        vector = np.frombuffer(row["vector_blob"], dtype=np.float32)
        denom = max(float(row["embedding_dim"] and np.linalg.norm(vector) * query_norm), 1e-12)
        score = float(np.dot(query_vector, vector) / denom)
        results.append(
            {
                "score": round(score, 6),
                "lead_id": row["lead_id"],
                "lead_name": row["lead_name"] or "",
                "doc_type": row["doc_type"],
                "title": row["title"] or "",
                "source_path": row["source_path"],
            }
        )
    results.sort(key=lambda item: item["score"], reverse=True)
    payload = results[: args.limit]
    output_json(payload) if args.json else print_text(text_table(payload))


def hybrid_semantic_search(conn: sqlite3.Connection, args: argparse.Namespace) -> None:
    quality_model_key = str(DEFAULT_QUALITY_MODEL_PATH.resolve())
    reranker_model_key = str(
        (Path(getattr(args, "reranker_model_path", None)) if getattr(args, "reranker_model_path", None) else DEFAULT_RERANKER_MODEL_PATH).resolve()
    )

    formatted_query = format_query_for_embedding(args.query, resolve_query_instruction(args))
    fts_query = build_fts_candidate_query(args.query)
    candidates: list[dict[str, object]] = []
    if fts_query:
        candidate_rows = list(
            conn.execute(
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
                (fts_query, max(args.hybrid_rerank_limit, args.limit)),
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
                    "candidate_score": stable_score(float(row["fts_score"]), 6),
                }
            )

    if not candidates:
        rows = load_embedding_rows(conn, quality_model_key)
        if not rows:
            raise SystemExit(
                "No quality-profile embeddings found. Run `python scripts/maintenance/semantic_search.py --profile quality build-index` first."
            )
        quality_args = build_quality_args(args)
        with create_embedder(quality_args) as embedder:
            query_vector = embedder.encode([formatted_query])[0].astype(np.float32)
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
                    "candidate_score": stable_score(quality_score, 6),
                }
            )
        scored.sort(key=lambda item: item["candidate_score"], reverse=True)
        candidates = scored[: min(max(args.hybrid_rerank_limit, args.limit), len(scored))]

    rerank_limit = min(max(args.hybrid_rerank_limit, args.limit), len(candidates))
    candidates = candidates[:rerank_limit]
    texts = [fetch_document_text(conn, int(item["doc_id"])) for item in candidates]

    rerank_strategy = getattr(args, "hybrid_rerank_strategy", "embedding")
    model_used = quality_model_key
    reranked_by = DEFAULT_QUALITY_PROFILE
    candidate_source = "fts" if fts_query and candidates else DEFAULT_QUALITY_PROFILE

    if rerank_strategy == "reranker":
        with create_reranker(args) as reranker:
            rerank_scores = reranker.rerank(
                args.query,
                texts,
                top_n=len(texts),
                instruction=resolve_query_instruction(args),
            )
        model_used = reranker_model_key
        reranked_by = "reranker"
    else:
        quality_args = build_quality_args(args)
        with create_embedder(quality_args) as embedder:
            rerank_query = embedder.encode([formatted_query])[0].astype(np.float32)
            rerank_docs = encode_in_batches(embedder, texts, getattr(args, "batch_size", DEFAULT_BATCH_SIZE)).astype(np.float32)

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
                "score": stable_score(float(rerank_score), 6),
                "candidate_score": stable_score(float(item["candidate_score"]), 6),
                "retrieval_profile": DEFAULT_HYBRID_PROFILE,
                "candidate_source": candidate_source,
                "reranked_by": reranked_by,
                "model_used": model_used,
                "query_instruction": resolve_query_instruction(args),
            }
        )

    reranked.sort(key=lambda item: item["score"], reverse=True)
    payload = reranked[: args.limit]
    output_json(payload) if args.json else print_text(text_table(payload))


def rebuild_status(conn: sqlite3.Connection, args: argparse.Namespace) -> None:
    ensure_schema(conn)
    profile = resolve_profile(args)
    if profile == DEFAULT_HYBRID_PROFILE:
        quality_key = str(DEFAULT_QUALITY_MODEL_PATH.resolve())
        ensure_profile_queue_rows(conn, quality_key)
        quality_rows = list(
            conn.execute(
                """
                SELECT
                    COUNT(*) AS embedded_docs,
                    COUNT(DISTINCT lead_id) AS embedded_leads,
                    MIN(indexed_at) AS first_indexed_at,
                    MAX(indexed_at) AS last_indexed_at
                FROM leadops_vector_embeddings
                WHERE embedding_model = ?
                """,
                (quality_key,),
            )
        )
        payload = {
            "retrieval_profile": DEFAULT_HYBRID_PROFILE,
            "candidate_source": "fts",
            "reranked_by": "quality_or_reranker",
            "quality_model_used": quality_key,
            "quality_embedded_docs": int((quality_rows[0]["embedded_docs"] if quality_rows else 0) or 0),
            "quality_embedded_leads": int((quality_rows[0]["embedded_leads"] if quality_rows else 0) or 0),
            "quality_first_indexed_at": quality_rows[0]["first_indexed_at"] if quality_rows else None,
            "quality_last_indexed_at": quality_rows[0]["last_indexed_at"] if quality_rows else None,
            "pending_docs": int(
                conn.execute(
                    """
                    SELECT COUNT(*)
                    FROM leadops_vector_index_queue
                    WHERE embedding_model = ?
                      AND lower(COALESCE(embedding_status, 'pending')) <> 'embedded'
                    """,
                    (quality_key,),
                ).fetchone()[0]
            ),
        }
        output_json(payload) if args.json else print_text(text_table([payload]))
        return

    model_name = resolve_model_key(args)
    ensure_profile_queue_rows(conn, model_name)
    rows = list(
        conn.execute(
            """
            SELECT
                COUNT(*) AS embedded_docs,
                COUNT(DISTINCT lead_id) AS embedded_leads,
                MIN(indexed_at) AS first_indexed_at,
                MAX(indexed_at) AS last_indexed_at
            FROM leadops_vector_embeddings
            WHERE embedding_model = ?
            """,
            (model_name,),
        )
    )
    payload = dict(rows[0]) if rows else {}
    payload["pending_docs"] = int(
        conn.execute(
            """
            SELECT COUNT(*)
            FROM leadops_vector_index_queue
            WHERE embedding_model = ?
              AND lower(COALESCE(embedding_status, 'pending')) <> 'embedded'
            """,
            (model_name,),
        ).fetchone()[0]
    )
    output_json(payload) if args.json else print_text(text_table([payload]))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build and query semantic search over leadops search documents.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to crm.sqlite")
    parser.add_argument(
        "--profile",
        choices=[DEFAULT_FAST_PROFILE, DEFAULT_QUALITY_PROFILE, DEFAULT_HYBRID_PROFILE],
        default=DEFAULT_PROFILE,
        help="Embedding profile: fast is the default raw 0.6B lane, quality is the optional 4B GGUF lane, hybrid uses FTS candidates plus second-stage reranking.",
    )
    parser.add_argument("--model-path", default=None, help="Optional explicit model path override")
    parser.add_argument("--device", default=None, help="Optional device override for fast profile (defaults to cuda if available)")
    parser.add_argument("--llama-server-path", default=str(DEFAULT_LLAMA_SERVER_PATH), help="Path to llama-server.exe for quality profile")
    parser.add_argument("--llama-port", type=int, default=8092, help="Port for quality-profile llama.cpp server")
    parser.add_argument("--llama-device", default="CUDA0", help="Device string for quality-profile llama.cpp server")
    parser.add_argument("--llama-batch-size", type=int, default=512, help="Batch size for quality-profile llama.cpp server")
    parser.add_argument("--llama-ubatch-size", type=int, default=512, help="Physical batch size for quality-profile llama.cpp server")
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    parser.add_argument(
        "--query-instruction",
        default=DEFAULT_QUERY_INSTRUCTION,
        help="Instruction prepended to query embeddings for Qwen retrieval-style encoding. Pass an empty string to disable.",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build-index", help="Embed pending vector documents and store vectors in sqlite")
    build.add_argument("--limit", type=int, default=256)
    build.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)

    build_loop = sub.add_parser(
        "build-index-loop",
        help="Embed pending vector documents in repeated warm batches, reusing the same model process",
    )
    build_loop.add_argument("--limit", type=int, default=256, help="Docs per batch")
    build_loop.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE, help="Client request chunk size within each batch")
    build_loop.add_argument("--max-batches", type=int, default=0, help="Optional cap on number of batches; 0 means run until queue is empty")
    build_loop.add_argument("--sleep-seconds", type=float, default=2.0, help="Pause between batches to avoid spiking the machine")

    search = sub.add_parser("search", help="Run semantic search over embedded documents")
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=10)
    search.add_argument("--hybrid-rerank-limit", type=int, default=25, help="For hybrid profile, rerank the top N candidate hits with the quality profile")
    search.add_argument(
        "--hybrid-rerank-strategy",
        choices=["embedding", "reranker"],
        default="embedding",
        help="For hybrid profile, use either the quality embedder or the dedicated reranker for the second-stage rerank.",
    )

    parser.add_argument("--reranker-model-path", default=str(DEFAULT_RERANKER_MODEL_PATH), help="Path to the dedicated GGUF reranker model")
    parser.add_argument("--reranker-server-path", default=str(DEFAULT_LLAMA_SERVER_PATH), help="Path to llama-server.exe for the reranker")
    parser.add_argument("--reranker-port", type=int, default=8094, help="Port for the reranker llama.cpp server")
    parser.add_argument("--reranker-device", default="CUDA0", help="Device string for the reranker llama.cpp server")
    parser.add_argument("--reranker-batch-size", type=int, default=2048, help="Batch size for the reranker llama.cpp server")
    parser.add_argument("--reranker-ubatch-size", type=int, default=2048, help="Physical batch size for the reranker llama.cpp server")

    sub.add_parser("status", help="Show embedding coverage and pending counts")
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if args.model_path:
        args.model_path = Path(args.model_path).resolve()
    if getattr(args, "llama_server_path", None):
        args.llama_server_path = str(Path(args.llama_server_path).resolve())
    with connect(Path(args.db).resolve()) as conn:
        if args.command == "build-index":
            build_index(conn, args)
        elif args.command == "build-index-loop":
            build_index_loop(conn, args)
        elif args.command == "search":
            semantic_search(conn, args)
        elif args.command == "status":
            rebuild_status(conn, args)
        else:
            parser.print_help()
            raise SystemExit(1)


if __name__ == "__main__":
    main()
