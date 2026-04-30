#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np


DEFAULT_CORPUS_PATH = Path.home() / "ai" / "ask_moco_corpus.jsonl"
DEFAULT_OUTPUT_DIR = Path.home() / "ai" / "public_semantic_search"
DEFAULT_EMBED_SERVICE_URL = "http://127.0.0.1:8019/embed"
DEFAULT_LOCAL_MODEL_PATH = Path(__file__).resolve().parents[2] / "ai-models" / "music" / "ACE-Step-1.5" / "checkpoints" / "Qwen3-Embedding-0.6B"
DEFAULT_QUERY_INSTRUCTION = (
    "Given a Montgomery County business discovery query, retrieve the most relevant businesses, "
    "venues, and service providers that best satisfy the request."
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a private public-only semantic index for mccullough.cloud semantic-demo."
    )
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS_PATH, help="Path to ask_moco_corpus.jsonl")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory where metadata.json, embeddings.npy, and manifest.json will be written",
    )
    parser.add_argument(
        "--backend",
        choices=("service", "local"),
        default="service",
        help="Embedding backend: use the resident HTTP service or load the local model directly.",
    )
    parser.add_argument(
        "--embed-service-url",
        default=DEFAULT_EMBED_SERVICE_URL,
        help="Qwen embedding service endpoint (default: http://127.0.0.1:8019/embed)",
    )
    parser.add_argument(
        "--model-path",
        type=Path,
        default=DEFAULT_LOCAL_MODEL_PATH,
        help="Local model path when backend=local",
    )
    parser.add_argument(
        "--device",
        default="auto",
        help="Torch device for backend=local (default: auto)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=24,
        help="Embedding batch size for the remote Qwen service",
    )
    parser.add_argument(
        "--request-timeout",
        type=int,
        default=300,
        help="HTTP timeout in seconds for each embedding request",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=4,
        help="How many times to retry a failed embedding batch",
    )
    parser.add_argument(
        "--retry-sleep",
        type=float,
        default=5.0,
        help="Seconds to sleep between failed embedding batch retries",
    )
    parser.add_argument(
        "--query-instruction",
        default=DEFAULT_QUERY_INSTRUCTION,
        help="Instruction prefix to persist in manifest for query embeddings",
    )
    return parser.parse_args()


def clean_text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value.replace("\r", " ").replace("\n", " ")).strip()


def clean_public_note(value: object) -> str:
    text = clean_text(value)
    if not text:
        return ""
    text = re.sub(r"^[\-\u2022*]+\s*", "", text)
    text = text.replace("`", "").replace("**", "")
    text = re.sub(r"\s*-\s*", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .;,-")
    if text.lower() in {"pending research", "pending research.", "n/a", "none"}:
        return ""
    lowered = text.lower()
    private_markers = [
        "disqualified:",
        "duplicate of lead",
        "double outreach",
        "qualified candidate",
        "during research",
        "public direct email",
        "public contact email",
        "same public contact info",
        "canonical record",
        "no active business presence",
        "contact info found",
        "residential address",
        "keeping a single canonical record",
        "exhaustion sources",
        "public records search",
        "public document",
    ]
    if any(marker in lowered for marker in private_markers):
        return ""
    if re.search(r"https?://|www\.|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", text, flags=re.IGNORECASE):
        return ""
    if re.search(r"(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}", text):
        return ""
    return text


def shorten_public_note(value: str, limit: int = 220) -> str:
    text = clean_public_note(value)
    if len(text) <= limit:
        return text
    clipped = text[:limit].rsplit(" ", 1)[0].strip()
    return f"{clipped}..." if clipped else f"{text[:limit].strip()}..."


def build_public_note_fields(raw: dict) -> tuple[str, str]:
    primary_candidates = [
        raw.get("differentiators", ""),
        raw.get("service_offerings", ""),
        raw.get("business_overview", ""),
        raw.get("target_customers", ""),
    ]
    secondary_candidates = [
        raw.get("target_customers", ""),
        raw.get("business_overview", ""),
        raw.get("service_offerings", ""),
        raw.get("differentiators", ""),
    ]

    primary = next((clean_public_note(value) for value in primary_candidates if clean_public_note(value)), "")
    secondary = next(
        (
            clean_public_note(value)
            for value in secondary_candidates
            if clean_public_note(value) and clean_public_note(value) != primary
        ),
        "",
    )

    return shorten_public_note(primary, limit=220), shorten_public_note(secondary, limit=180)


def format_query_for_embedding(query: str, instruction: str) -> str:
    cleaned_query = clean_text(query)
    cleaned_instruction = clean_text(instruction)
    if not cleaned_instruction:
        return cleaned_query
    lowered = cleaned_query.lower()
    if lowered.startswith("instruct:") and "\nquery:" in lowered:
        return cleaned_query
    return f"Instruct: {cleaned_instruction}\nQuery: {cleaned_query}"


def build_semantic_text(doc: dict) -> str:
    pieces = [
        doc.get("name", ""),
        doc.get("city", ""),
        doc.get("naics", ""),
        doc.get("business_overview", ""),
        doc.get("service_offerings", ""),
        doc.get("target_customers", ""),
        doc.get("differentiators", ""),
        doc.get("contact_information", ""),
        doc.get("search_text", ""),
    ]
    return clean_text(" ".join(piece for piece in pieces if piece))


def build_search_blob(doc: dict) -> str:
    pieces = [
        doc.get("name", ""),
        doc.get("city", ""),
        doc.get("naics", ""),
        doc.get("business_overview", ""),
        doc.get("service_offerings", ""),
        doc.get("target_customers", ""),
        doc.get("differentiators", ""),
        doc.get("contact_information", ""),
        doc.get("search_text", ""),
        doc.get("website", ""),
        doc.get("email", ""),
        doc.get("phone", ""),
    ]
    return clean_text(" ".join(piece for piece in pieces if piece)).lower()


def load_corpus(path: Path) -> list[dict]:
    docs: list[dict] = []
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            raw = json.loads(line)
            name = clean_text(raw.get("name")) or "Unknown business"
            city = clean_text(raw.get("city")) or "Montgomery County"
            status = clean_text(raw.get("status")).lower() or "unknown"
            public_note, public_detail = build_public_note_fields(raw)
            docs.append(
                {
                    "lead_id": int(raw["lead_id"]),
                    "name": name,
                    "city": city,
                    "status": status,
                    "address": clean_public_note(raw.get("address")),
                    "naics": clean_public_note(raw.get("naics")),
                    "public_note": public_note,
                    "public_detail": public_detail,
                    "semantic_text": build_semantic_text(raw),
                    "search_blob": build_search_blob(raw),
                }
            )
    return docs


def embed_texts(texts: list[str], service_url: str, request_timeout: int) -> np.ndarray:
    payload = json.dumps({"texts": texts, "normalize": True}).encode("utf-8")
    request = urllib.request.Request(
        service_url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=request_timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SystemExit(f"Embedding request failed: HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Embedding service unavailable at {service_url}: {exc}") from exc

    if not body.get("ok"):
        raise SystemExit(f"Embedding service returned error payload: {body}")
    return np.asarray(body["embeddings"], dtype=np.float32)


def embed_texts_local(
    texts: list[str],
    model_path: Path,
    batch_size: int,
    device: str,
) -> np.ndarray:
    import torch
    from sentence_transformers import SentenceTransformer

    resolved_device = device
    if resolved_device == "auto":
        resolved_device = "cuda" if torch.cuda.is_available() else "cpu"

    model = SentenceTransformer(
        str(model_path),
        local_files_only=True,
        trust_remote_code=True,
        model_kwargs={"torch_dtype": "auto"},
        device=resolved_device,
    )
    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=True,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    return np.asarray(embeddings, dtype=np.float32)


def batched_embeddings(
    texts: list[str],
    batch_size: int,
    service_url: str,
    request_timeout: int,
    retries: int,
    retry_sleep: float,
) -> np.ndarray:
    batches: list[np.ndarray] = []
    total = len(texts)
    for start in range(0, total, batch_size):
        chunk = texts[start : start + batch_size]
        vectors = None
        last_error: Exception | None = None
        for attempt in range(max(1, retries)):
            try:
                vectors = embed_texts(chunk, service_url=service_url, request_timeout=request_timeout)
                break
            except Exception as exc:  # pragma: no cover - operational retry path
                last_error = exc
                print(
                    json.dumps(
                        {
                            "ok": False,
                            "embedded": start,
                            "total": total,
                            "batch_size": len(chunk),
                            "attempt": attempt + 1,
                            "error": str(exc),
                        }
                    ),
                    flush=True,
                )
                if attempt + 1 < max(1, retries):
                    time.sleep(max(0.0, retry_sleep))
        if vectors is None:
            raise SystemExit(f"Failed embedding batch starting at {start}: {last_error}")
        batches.append(vectors)
        print(
            json.dumps(
                {
                    "ok": True,
                    "embedded": start + len(chunk),
                    "total": total,
                    "batch_size": len(chunk),
                }
            ),
            flush=True,
        )
    return np.concatenate(batches, axis=0) if batches else np.zeros((0, 0), dtype=np.float32)


def main() -> None:
    args = parse_args()
    docs = load_corpus(args.corpus)
    if not docs:
        raise SystemExit(f"No documents found in {args.corpus}")

    texts = [doc["semantic_text"] or doc["name"] for doc in docs]
    if args.backend == "local":
        embeddings = embed_texts_local(
            texts,
            model_path=args.model_path,
            batch_size=max(1, args.batch_size),
            device=args.device,
        )
    else:
        embeddings = batched_embeddings(
            texts,
            batch_size=max(1, args.batch_size),
            service_url=args.embed_service_url,
            request_timeout=max(30, args.request_timeout),
            retries=max(1, args.retries),
            retry_sleep=max(0.0, args.retry_sleep),
        )
    if embeddings.shape[0] != len(docs):
        raise SystemExit(
            f"Embedding count mismatch: expected {len(docs)} rows but got {embeddings.shape[0]}"
        )

    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = output_dir / "metadata.json"
    embeddings_path = output_dir / "embeddings.npy"
    manifest_path = output_dir / "manifest.json"

    public_docs = [
        {
            "lead_id": doc["lead_id"],
            "name": doc["name"],
            "city": doc["city"],
            "status": doc["status"],
            "address": doc["address"],
            "naics": doc["naics"],
            "public_note": doc["public_note"],
            "public_detail": doc["public_detail"],
            "search_blob": doc["search_blob"],
        }
        for doc in docs
    ]

    with metadata_path.open("w", encoding="utf-8") as fh:
        json.dump(public_docs, fh, separators=(",", ":"), ensure_ascii=False)

    np.save(embeddings_path, embeddings.astype(np.float32))

    manifest = {
        "ok": True,
        "corpus_path": str(args.corpus),
        "count": len(public_docs),
        "dimensions": int(embeddings.shape[1]) if embeddings.ndim == 2 else 0,
        "query_instruction": args.query_instruction,
        "backend": args.backend,
        "embed_service_url": args.embed_service_url if args.backend == "service" else None,
        "model_path": str(args.model_path) if args.backend == "local" else None,
        "metadata_path": str(metadata_path),
        "embeddings_path": str(embeddings_path),
        "query_example": format_query_for_embedding("places to take dogs", args.query_instruction),
    }
    with manifest_path.open("w", encoding="utf-8") as fh:
        json.dump(manifest, fh, separators=(",", ":"), ensure_ascii=False)

    print(
        json.dumps(
            {
                "ok": True,
                "output_dir": str(output_dir),
                "count": len(public_docs),
                "dimensions": manifest["dimensions"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
