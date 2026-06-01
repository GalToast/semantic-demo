#!/usr/bin/env python3
from __future__ import annotations

import argparse
import gzip
import io
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INDEX_DIR = ROOT.parent / "tmp" / "public-semantic-search-build" / "index-motion338b"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Regenerate data.dat x/y/z from the same Qwen embedding index used by semantic_threads_ui.dat."
    )
    parser.add_argument("--data", type=Path, default=ROOT / "data.dat")
    parser.add_argument("--threads", type=Path, default=ROOT / "semantic_threads_ui.dat")
    parser.add_argument("--index-dir", type=Path, default=DEFAULT_INDEX_DIR)
    parser.add_argument("--output", type=Path, default=ROOT / "data.dat")
    parser.add_argument("--gzip-output", type=Path, default=ROOT / "data.dat.gz")
    parser.add_argument("--iterations", type=int, default=180)
    parser.add_argument("--edge-limit", type=int, default=12)
    parser.add_argument("--round", type=int, default=4)
    return parser.parse_args()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def normalize_embeddings(embeddings: np.ndarray) -> np.ndarray:
    matrix = embeddings.astype("float32")
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    matrix = matrix / np.maximum(norms, 1e-8)
    return matrix - matrix.mean(axis=0, keepdims=True)


def pca_3d(embeddings: np.ndarray) -> np.ndarray:
    matrix = normalize_embeddings(embeddings)
    covariance = (matrix.T @ matrix) / max(1, matrix.shape[0] - 1)
    values, vectors = np.linalg.eigh(covariance)
    coords = matrix @ vectors[:, np.argsort(values)[-3:]]
    low = np.percentile(coords, 1, axis=0)
    high = np.percentile(coords, 99, axis=0)
    return np.clip((coords - low) / np.maximum(high - low, 1e-9), 0, 1).astype("float32")


def build_edges(
    rows: list[list[Any]],
    thread_bundle: dict[str, Any],
    metadata_index_by_lead_id: dict[str, int],
    edge_limit: int,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    data_index_by_lead_id = {str(row[7]): index for index, row in enumerate(rows)}
    metadata_to_data = {
        metadata_index: data_index_by_lead_id[lead_id]
        for lead_id, metadata_index in metadata_index_by_lead_id.items()
        if lead_id in data_index_by_lead_id
    }
    sources: list[int] = []
    targets: list[int] = []
    weights: list[float] = []

    for fallback_lead_id, node in (thread_bundle.get("nodes") or {}).items():
        lead_id = str(node.get("lead_id", fallback_lead_id))
        source_index = data_index_by_lead_id.get(lead_id)
        if source_index is None:
            continue
        for neighbor in (node.get("neighbors") or [])[:edge_limit]:
            target_index = data_index_by_lead_id.get(str(neighbor.get("lead_id")))
            if target_index is None or target_index == source_index:
                continue
            sources.append(source_index)
            targets.append(target_index)
            weights.append(float(neighbor.get("semantic_score") or neighbor.get("score") or 0.75))

    if len(metadata_to_data) != len(rows):
        missing = len(rows) - len(metadata_to_data)
        raise SystemExit(f"metadata/data lead_id mismatch; missing metadata for {missing} data rows")

    weights_array = np.array(weights, dtype="float32")
    if weights_array.size:
        weights_array = 0.4 + 0.6 * (
            (weights_array - weights_array.min()) / max(float(weights_array.max() - weights_array.min()), 1e-9)
        )
    return np.array(sources, dtype="int32"), np.array(targets, dtype="int32"), weights_array


def relax_layout(initial: np.ndarray, sources: np.ndarray, targets: np.ndarray, weights: np.ndarray, iterations: int) -> np.ndarray:
    positions = initial.copy()
    degree = np.bincount(np.concatenate([sources, targets]), minlength=len(initial)).astype("float32")
    degree = np.maximum(degree, 1.0)[:, None]

    for _ in range(iterations):
        diff = positions[targets] - positions[sources]
        move = diff * (0.018 * weights[:, None])
        accum = np.zeros_like(positions)
        np.add.at(accum, sources, move)
        np.add.at(accum, targets, -move)
        positions += accum / degree
        positions += (initial - positions) * 0.025
        positions = np.clip(positions, -0.35, 1.35)

    return np.clip(positions, 0, 1)


def write_json_compact(path: Path, payload: Any) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    args = parse_args()
    data_path = args.data.resolve()
    output_path = args.output.resolve()
    index_dir = args.index_dir.resolve()

    rows = load_json(data_path)
    thread_bundle = load_json(args.threads.resolve())
    metadata = load_json(index_dir / "metadata.json")
    embeddings = np.load(index_dir / "embeddings.npy", mmap_mode="r")

    if len(rows) != len(metadata) or embeddings.shape[0] != len(metadata):
        raise SystemExit(
            f"count mismatch: data={len(rows)} metadata={len(metadata)} embeddings={tuple(embeddings.shape)}"
        )

    metadata_index_by_lead_id = {str(item["lead_id"]): index for index, item in enumerate(metadata)}
    sources, targets, weights = build_edges(rows, thread_bundle, metadata_index_by_lead_id, args.edge_limit)
    initial = pca_3d(embeddings)

    metadata_ordered_positions = relax_layout(initial, sources, targets, weights, args.iterations)
    data_positions = np.zeros((len(rows), 3), dtype="float32")
    for row_index, row in enumerate(rows):
        metadata_index = metadata_index_by_lead_id[str(row[7])]
        data_positions[row_index] = metadata_ordered_positions[metadata_index]

    for row, position in zip(rows, data_positions):
        row[0] = round(float(position[0]), args.round)
        row[1] = round(float(position[1]), args.round)
        row[2] = round(float(position[2]), args.round)

    write_json_compact(output_path, rows)
    with gzip.GzipFile(filename=str(args.gzip_output.resolve()), mode="wb", mtime=0) as gz:
        with io.TextIOWrapper(gz, encoding="utf-8") as fh:
            json.dump(rows, fh, ensure_ascii=False, separators=(",", ":"))

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "method": "qwen_embedding_pca_3d_with_semantic_neighbor_relaxation",
        "data_path": str(output_path),
        "index_dir": str(index_dir),
        "thread_path": str(args.threads.resolve()),
        "rows": len(rows),
        "edges": int(len(sources)),
        "iterations": args.iterations,
        "edge_limit": args.edge_limit,
    }
    write_json_compact(ROOT / "semantic_space_layout_manifest.json", manifest)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
