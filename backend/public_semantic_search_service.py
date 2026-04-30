#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import numpy as np


HOST = os.environ.get("PUBLIC_SEMANTIC_SEARCH_HOST", "127.0.0.1")
PORT = int(os.environ.get("PUBLIC_SEMANTIC_SEARCH_PORT", "8020"))
INDEX_DIR = Path(os.environ.get("PUBLIC_SEMANTIC_SEARCH_INDEX_DIR", str(Path.home() / "ai" / "public_semantic_search")))
EMBED_SERVICE_URL = os.environ.get("QWEN_EMBED_SERVICE_URL", "http://127.0.0.1:8019/embed")
EMBED_HEALTH_URL = os.environ.get("QWEN_EMBED_HEALTH_URL", "http://127.0.0.1:8019/healthz")
EMBED_START_CMD = os.environ.get("QWEN_EMBED_START_CMD", str(Path.home() / "bin" / "start-qwen-embed-service"))
STATE_FILE = Path(
    os.environ.get("PUBLIC_SEMANTIC_SEARCH_STATE_FILE", str(Path.home() / "ai" / "public_semantic_search.state.json"))
)
SUPERVISOR_STARTED_AT = os.environ.get("PUBLIC_SEMANTIC_SEARCH_SUPERVISOR_STARTED_AT")
WORKER_STARTED_AT = datetime.now(timezone.utc).isoformat()
QUERY_INSTRUCTION = os.environ.get(
    "PUBLIC_SEMANTIC_SEARCH_INSTRUCTION",
    "Given a Montgomery County business discovery query, retrieve the most relevant businesses, venues, "
    "and service providers that best satisfy the request.",
)
MAX_RESULTS = int(os.environ.get("PUBLIC_SEMANTIC_SEARCH_MAX_RESULTS", "48"))
DEFAULT_RESULTS = int(os.environ.get("PUBLIC_SEMANTIC_SEARCH_DEFAULT_RESULTS", "18"))
CANDIDATE_MULTIPLIER = int(os.environ.get("PUBLIC_SEMANTIC_SEARCH_CANDIDATE_MULTIPLIER", "8"))
MIN_CANDIDATES = int(os.environ.get("PUBLIC_SEMANTIC_SEARCH_MIN_CANDIDATES", "48"))
LEXICAL_CANDIDATE_MULTIPLIER = int(os.environ.get("PUBLIC_SEMANTIC_SEARCH_LEXICAL_CANDIDATE_MULTIPLIER", "6"))
MIN_LEXICAL_CANDIDATES = int(os.environ.get("PUBLIC_SEMANTIC_SEARCH_MIN_LEXICAL_CANDIDATES", "72"))
EMBED_RECOVERY_WAIT_SECONDS = int(os.environ.get("QWEN_EMBED_RECOVERY_WAIT_SECONDS", "12"))
EMBED_RETRY_DELAY_SECONDS = float(os.environ.get("QWEN_EMBED_RETRY_DELAY_SECONDS", "0.35"))
EMBED_REQUEST_TIMEOUT_SECONDS = float(os.environ.get("QWEN_EMBED_REQUEST_TIMEOUT_SECONDS", "8"))
EMBED_AUTOSTART_ENABLED = os.environ.get("PUBLIC_SEMANTIC_SEARCH_EMBED_AUTOSTART", "0").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def optional_int(value: object) -> int | None:
    try:
        parsed = int(str(value).strip())
        return parsed if parsed > 0 else None
    except (TypeError, ValueError, AttributeError):
        return None


SUPERVISOR_PID = optional_int(os.environ.get("PUBLIC_SEMANTIC_SEARCH_SUPERVISOR_PID"))
PROCESS_GROUP_ID = optional_int(os.environ.get("PUBLIC_SEMANTIC_SEARCH_PROCESS_GROUP_ID"))

SEARCH_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "at",
    "by",
    "for",
    "from",
    "in",
    "into",
    "is",
    "me",
    "my",
    "near",
    "of",
    "on",
    "or",
    "place",
    "places",
    "take",
    "the",
    "to",
    "with",
    "your",
}

SEARCH_INTENT_EXPANSIONS = [
    {
        "match_any": {"childcare", "child", "children", "kid", "kids", "daycare", "preschool"},
        "aliases": {
            "childcare",
            "child",
            "children",
            "kid",
            "kids",
            "daycare",
            "preschool",
            "nursery",
            "toddler",
            "learning",
            "academy",
            "school",
            "education",
            "care",
        },
    },
    {
        "match_any": {"dentist", "dental", "teeth", "orthodontist", "orthodontic"},
        "aliases": {
            "dentist",
            "dental",
            "teeth",
            "tooth",
            "orthodontist",
            "orthodontic",
            "oral",
            "dds",
            "dmd",
            "hygiene",
        },
    },
    {
        "match_any": {"plumber", "plumbers", "plumbing"},
        "aliases": {
            "plumber",
            "plumbers",
            "plumbing",
            "pipe",
            "pipes",
            "drain",
            "drains",
            "sewer",
            "leak",
            "water",
            "heater",
        },
    },
    {
        "match_any": {"roof", "roofer", "roofing"},
        "aliases": {"roof", "roofer", "roofing", "shingle", "shingles", "repair", "repairs", "storm"},
    },
    {
        "match_any": {"auto", "automotive", "mechanic", "mechanics"},
        "aliases": {
            "auto",
            "automotive",
            "mechanic",
            "mechanics",
            "repair",
            "repairs",
            "towing",
            "tire",
            "tires",
            "brake",
            "transmission",
            "body",
            "collision",
        },
    },
    {
        "match_any": {"lawyer", "attorney", "legal"},
        "aliases": {"lawyer", "lawyers", "attorney", "attorneys", "legal", "law", "defense", "injury", "family"},
    },
    {
        "match_any": {"cleaning", "cleaner", "cleaners", "maid", "janitorial"},
        "aliases": {"cleaning", "cleaner", "cleaners", "maid", "janitorial", "commercial", "residential"},
    },
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_runtime_state() -> None:
    try:
        payload = {}
        if STATE_FILE.exists():
            payload = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                payload = {}
    except Exception:
        payload = {}

    payload.update(
        {
            "state_version": 1,
            "service": "public-semantic-search",
            "updated_at": utc_now(),
            "host": HOST,
            "port": PORT,
            "index_dir": str(INDEX_DIR),
            "mode": "semantic_hybrid_public_v1",
            "supervisor_pid": SUPERVISOR_PID,
            "process_group_id": PROCESS_GROUP_ID,
            "supervisor_started_at": SUPERVISOR_STARTED_AT,
            "worker_pid": os.getpid(),
            "worker_parent_pid": os.getppid(),
            "worker_started_at": WORKER_STARTED_AT,
        }
    )

    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    temp_path = STATE_FILE.with_suffix(".tmp")
    temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temp_path.replace(STATE_FILE)


def runtime_payload() -> dict:
    return {
        "supervisor_pid": SUPERVISOR_PID,
        "process_group_id": PROCESS_GROUP_ID,
        "supervisor_started_at": SUPERVISOR_STARTED_AT,
        "worker_pid": os.getpid(),
        "worker_parent_pid": os.getppid(),
        "worker_started_at": WORKER_STARTED_AT,
        "worker_answered_health": True,
        "state_file": str(STATE_FILE),
    }


def clean_text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value.replace("\r", " ").replace("\n", " ")).strip()


def tokenize(text: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9]+", text.lower())
        if len(token) > 1 and token not in SEARCH_STOP_WORDS
    ]


def expand_query_tokens(query_phrase: str, query_tokens: list[str]) -> tuple[list[str], bool]:
    expanded = set(query_tokens)
    intent_matched = False
    token_set = set(query_tokens)
    for intent in SEARCH_INTENT_EXPANSIONS:
        if token_set.intersection(intent["match_any"]):
            intent_matched = True
            expanded.update(intent["aliases"])
    return sorted(expanded), intent_matched


def count_matches(field_tokens: set[str], query_tokens: list[str]) -> tuple[int, int]:
    exact = 0
    prefix = 0
    for token in query_tokens:
        if token in field_tokens:
            exact += 1
        elif any(entry.startswith(token) or token.startswith(entry) for entry in field_tokens):
            prefix += 1
    return exact, prefix


def build_service_blob(doc: dict) -> str:
    return " ".join(
        clean_text(doc.get(key)).lower()
        for key in ("naics", "public_note", "public_detail", "search_blob")
        if clean_text(doc.get(key))
    )


def format_query_for_embedding(query: str, instruction: str) -> str:
    cleaned_query = clean_text(query)
    cleaned_instruction = clean_text(instruction)
    if not cleaned_instruction:
        return cleaned_query
    lowered = cleaned_query.lower()
    if lowered.startswith("instruct:") and "\nquery:" in lowered:
        return cleaned_query
    return f"Instruct: {cleaned_instruction}\nQuery: {cleaned_query}"


class PublicSemanticIndex:
    def __init__(self, index_dir: Path) -> None:
        self.index_dir = index_dir
        manifest_path = index_dir / "manifest.json"
        metadata_path = index_dir / "metadata.json"
        embeddings_path = index_dir / "embeddings.npy"

        self.manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        self.embeddings = np.load(embeddings_path).astype(np.float32)
        if self.embeddings.ndim != 2:
            raise RuntimeError(f"Invalid embedding matrix shape: {self.embeddings.shape}")
        if self.embeddings.shape[0] != len(self.metadata):
            raise RuntimeError(
                f"Embedding row count mismatch: {self.embeddings.shape[0]} rows vs {len(self.metadata)} metadata docs"
            )

    def search(self, query_vector: np.ndarray, query: str, limit: int) -> dict:
        semantic_scores = self.embeddings @ query_vector
        candidate_count = min(
            len(self.metadata),
            max(limit * CANDIDATE_MULTIPLIER, MIN_CANDIDATES),
        )
        semantic_candidate_indices = np.argpartition(semantic_scores, -candidate_count)[-candidate_count:]

        query_phrase = clean_text(query).lower()
        query_tokens = tokenize(query_phrase)
        expanded_query_tokens, intent_matched = expand_query_tokens(query_phrase, query_tokens)
        lexical_limit = min(
            len(self.metadata),
            max(limit * LEXICAL_CANDIDATE_MULTIPLIER, MIN_LEXICAL_CANDIDATES),
        )
        lexical_candidates = []
        for index, doc in enumerate(self.metadata):
            recall_score = lexical_recall_score(query_phrase, query_tokens, expanded_query_tokens, doc)
            if recall_score > 0:
                lexical_candidates.append((recall_score, index))

        candidate_indices = set(semantic_candidate_indices.tolist())
        lexical_candidates.sort(key=lambda item: (-item[0], item[1]))
        for _, index in lexical_candidates[:lexical_limit]:
            candidate_indices.add(index)

        results = []
        for index in candidate_indices:
            doc = self.metadata[index]
            lexical_bonus = lexical_score(query_phrase, query_tokens, expanded_query_tokens, intent_matched, doc)
            semantic_score = float(semantic_scores[index])
            final_score = semantic_score + lexical_bonus
            results.append(
                {
                    "lead_id": int(doc["lead_id"]),
                    "name": clean_text(doc.get("name")),
                    "city": clean_text(doc.get("city")),
                    "status": clean_text(doc.get("status")),
                    "public_note": clean_text(doc.get("public_note")),
                    "public_detail": clean_text(doc.get("public_detail")),
                    "address": clean_text(doc.get("address")),
                    "naics": clean_text(doc.get("naics")),
                    "score": round(final_score, 6),
                    "semantic_score": round(semantic_score, 6),
                    "lexical_bonus": round(lexical_bonus, 6),
                }
            )

        results.sort(key=lambda item: (-item["score"], -item["semantic_score"], item["lead_id"]))
        return {
            "ok": True,
            "query": query,
            "mode": "semantic_hybrid_public_v1",
            "count": len(results),
            "results": results[:limit],
        }

    def lookup(self, lead_id: int) -> dict | None:
        for doc in self.metadata:
            if int(doc.get("lead_id", -1)) == lead_id:
                return {
                    "ok": True,
                    "lead_id": lead_id,
                    "name": clean_text(doc.get("name")),
                    "city": clean_text(doc.get("city")),
                    "status": clean_text(doc.get("status")),
                    "address": clean_text(doc.get("address")),
                    "naics": clean_text(doc.get("naics")),
                    "public_note": clean_text(doc.get("public_note")),
                    "public_detail": clean_text(doc.get("public_detail")),
                }
        return None


def lexical_recall_score(
    query_phrase: str,
    query_tokens: list[str],
    expanded_query_tokens: list[str],
    doc: dict,
) -> float:
    if not query_phrase:
        return 0.0

    name = clean_text(doc.get("name")).lower()
    service_blob = build_service_blob(doc)
    name_tokens = set(tokenize(name))
    service_tokens = set(tokenize(service_blob))
    original_exact, original_prefix = count_matches(service_tokens.union(name_tokens), query_tokens)
    expanded_exact, expanded_prefix = count_matches(service_tokens.union(name_tokens), expanded_query_tokens)

    score = 0.0
    if query_phrase in service_blob:
        score += 8.0
    if query_phrase in name:
        score += 3.0
    score += original_exact * 3.0 + original_prefix * 1.35
    score += expanded_exact * 1.15 + expanded_prefix * 0.45
    return score


def lexical_score(
    query_phrase: str,
    query_tokens: list[str],
    expanded_query_tokens: list[str],
    intent_matched: bool,
    doc: dict,
) -> float:
    if not query_phrase:
        return 0.0

    name = clean_text(doc.get("name")).lower()
    service_blob = build_service_blob(doc)
    name_tokens = set(tokenize(name))
    service_tokens = set(tokenize(service_blob))
    score = 0.0

    if query_phrase in service_blob:
        score += 0.38
    if query_phrase in name:
        score += 0.11

    if query_tokens:
        service_exact, service_prefix = count_matches(service_tokens, query_tokens)
        name_exact, name_prefix = count_matches(name_tokens, query_tokens)
        expanded_service_exact, expanded_service_prefix = count_matches(service_tokens, expanded_query_tokens)

        score += min(0.55, service_exact * 0.095 + service_prefix * 0.045)
        score += min(0.18, name_exact * 0.045 + name_prefix * 0.02)
        score += min(0.45, expanded_service_exact * 0.052 + expanded_service_prefix * 0.022)

        all_original_in_service = len(query_tokens) >= 2 and all(token in service_tokens for token in query_tokens)
        all_original_anywhere = len(query_tokens) >= 2 and all(
            token in service_tokens or token in name_tokens for token in query_tokens
        )
        if all_original_in_service:
            score += 0.24
        elif all_original_anywhere:
            score += 0.08

        if intent_matched and (expanded_service_exact + expanded_service_prefix) > 0:
            score += 0.16
        if intent_matched and (expanded_service_exact + expanded_service_prefix) == 0 and (name_exact + name_prefix) > 0:
            score -= 0.08

    return score


def embed_query(query: str) -> np.ndarray:
    formatted = format_query_for_embedding(query, QUERY_INSTRUCTION)
    payload = json.dumps({"texts": [formatted], "normalize": True}).encode("utf-8")
    request = urllib.request.Request(
        EMBED_SERVICE_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=EMBED_REQUEST_TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Embedding request failed: HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Embedding service unavailable at {EMBED_SERVICE_URL}: {exc}") from exc

    if not body.get("ok") or not body.get("embeddings"):
        raise RuntimeError(f"Unexpected embedding payload: {body}")
    vector = np.asarray(body["embeddings"][0], dtype=np.float32)
    if vector.ndim != 1:
        raise RuntimeError(f"Unexpected query vector shape: {vector.shape}")
    return vector


def embed_service_healthy(timeout_seconds: int = 5) -> bool:
    try:
        with urllib.request.urlopen(EMBED_HEALTH_URL, timeout=timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return bool(payload.get("ok"))
    except Exception:
        return False


def wait_for_embed_service(timeout_seconds: int = EMBED_RECOVERY_WAIT_SECONDS) -> bool:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if embed_service_healthy(timeout_seconds=5):
            return True
        time.sleep(1)
    return False


def ensure_embed_service(initial_timeout_seconds: int = 2, recovery_timeout_seconds: int = EMBED_RECOVERY_WAIT_SECONDS) -> None:
    if wait_for_embed_service(timeout_seconds=initial_timeout_seconds):
        return
    if not EMBED_AUTOSTART_ENABLED:
        raise RuntimeError("Embedding service unavailable")
    subprocess.run([EMBED_START_CMD], check=False)
    if not wait_for_embed_service(timeout_seconds=recovery_timeout_seconds):
        raise RuntimeError("Embedding service unavailable after restart attempt")


def execute_semantic_search(query: str, limit: int) -> dict:
    query_vector = embed_query(query)
    with INDEX_LOCK:
        return INDEX.search(query_vector, query=query, limit=limit)


def search_with_recovery(query: str, limit: int) -> dict:
    ensure_embed_service()
    try:
        return execute_semantic_search(query, limit)
    except Exception:
        if not EMBED_AUTOSTART_ENABLED:
            raise
        # Give transient embed restarts one same-request retry before surfacing a 503.
        time.sleep(EMBED_RETRY_DELAY_SECONDS)
        ensure_embed_service(initial_timeout_seconds=1, recovery_timeout_seconds=EMBED_RECOVERY_WAIT_SECONDS)
        return execute_semantic_search(query, limit)


INDEX_LOCK = threading.Lock()
INDEX = PublicSemanticIndex(INDEX_DIR)


class PublicSemanticSearchHandler(BaseHTTPRequestHandler):
    server_version = "PublicSemanticSearch/0.1"

    def _send_json(self, status_code: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except BrokenPipeError:
            return

    def do_GET(self) -> None:
        if self.path == "/healthz":
            embed_ok = embed_service_healthy(timeout_seconds=2)
            self._send_json(
                200,
                {
                    "ok": True,
                    "service": "public-semantic-search",
                    "host": HOST,
                    "port": PORT,
                    "index_dir": str(INDEX_DIR),
                    "count": int(INDEX.embeddings.shape[0]),
                    "dimensions": int(INDEX.embeddings.shape[1]),
                    "embed_service_url": EMBED_SERVICE_URL,
                    "embed_service_ok": embed_ok,
                    "mode": "semantic_hybrid_public_v1",
                    "embed_autostart_enabled": EMBED_AUTOSTART_ENABLED,
                    "embed_request_timeout_seconds": EMBED_REQUEST_TIMEOUT_SECONDS,
                    "runtime": runtime_payload(),
                },
            )
            return

        if self.path.startswith("/lead"):
            from urllib.parse import parse_qs, urlparse

            params = parse_qs(urlparse(self.path).query)
            try:
                lead_id = int((params.get("id") or [""])[0])
            except (TypeError, ValueError):
                self._send_json(400, {"ok": False, "error": "invalid lead id"})
                return

            with INDEX_LOCK:
                result = INDEX.lookup(lead_id)
            if not result:
                self._send_json(404, {"ok": False, "error": "lead not found"})
                return
            self._send_json(200, result)
            return

        self._send_json(404, {"ok": False, "error": "not found"})

    def do_POST(self) -> None:
        if self.path != "/search":
            self._send_json(404, {"ok": False, "error": "not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self._send_json(400, {"ok": False, "error": "invalid content length"})
            return

        raw_body = self.rfile.read(content_length)
        try:
            payload = json.loads(raw_body.decode("utf-8") or "{}")
        except json.JSONDecodeError:
            self._send_json(400, {"ok": False, "error": "invalid json"})
            return

        query = clean_text(payload.get("query"))
        if len(query) < 2:
            self._send_json(400, {"ok": False, "error": "query too short"})
            return

        try:
            limit = int(payload.get("limit", DEFAULT_RESULTS))
        except (TypeError, ValueError):
            limit = DEFAULT_RESULTS
        limit = max(1, min(MAX_RESULTS, limit))

        try:
            result = search_with_recovery(query, limit)
        except Exception as exc:  # pragma: no cover - operational path
            self._send_json(503, {"ok": False, "error": "semantic search unavailable", "detail": str(exc)})
            return

        self._send_json(200, result)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        return


def main() -> None:
    write_runtime_state()
    server = ThreadingHTTPServer((HOST, PORT), PublicSemanticSearchHandler)
    print(
        json.dumps(
            {
                "ok": True,
                "service": "public-semantic-search",
                "listening_on": f"http://{HOST}:{PORT}",
                "index_dir": str(INDEX_DIR),
                "count": int(INDEX.embeddings.shape[0]),
                "dimensions": int(INDEX.embeddings.shape[1]),
                "runtime": runtime_payload(),
            }
        ),
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
