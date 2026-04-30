from __future__ import annotations

import argparse
import json
from pathlib import Path


def build_ui_payload(payload: dict, neighbor_limit: int) -> dict:
    nodes = payload.get("nodes", {})
    ui_nodes: dict[str, dict] = {}

    for fallback_lead_id, node in nodes.items():
        lead_id = node.get("lead_id", fallback_lead_id)
        neighbors = []
        for neighbor in (node.get("neighbors") or [])[:neighbor_limit]:
            neighbor_lead_id = neighbor.get("lead_id")
            if not neighbor_lead_id:
                continue
            neighbors.append(
                {
                    "lead_id": neighbor_lead_id,
                    "score": neighbor.get("score", 0),
                    "semantic_score": neighbor.get("semantic_score", 0),
                    "bridge_score": neighbor.get("bridge_score", 0),
                    "signal_score": neighbor.get("signal_score", 0),
                    "same_city": bool(neighbor.get("same_city")),
                    "same_status": bool(neighbor.get("same_status")),
                    "thread_type": neighbor.get("thread_type"),
                    "reason": neighbor.get("reason"),
                }
            )

        ui_nodes[str(fallback_lead_id)] = {
            "lead_id": lead_id,
            "signal_score": node.get("signal_score", 0),
            "neighbors": neighbors,
        }

    return {
        "generated_at": payload.get("generated_at"),
        "model": payload.get("model"),
        "meta": {
            **(payload.get("meta") or {}),
            "ui_neighbor_limit": neighbor_limit,
            "ui_payload": True,
        },
        "nodes": ui_nodes,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build a lighter semantic thread payload for the browser UI."
    )
    parser.add_argument("input", help="Full semantic_threads.dat path")
    parser.add_argument("output", help="Output UI payload path")
    parser.add_argument(
        "--neighbor-limit",
        type=int,
        default=12,
        help="Neighbors to retain per node for the UI payload (default: 12)",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    with input_path.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)

    ui_payload = build_ui_payload(payload, neighbor_limit=max(1, args.neighbor_limit))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as fh:
        json.dump(ui_payload, fh, separators=(",", ":"), ensure_ascii=False)

    print(
        json.dumps(
            {
                "input": str(input_path),
                "output": str(output_path),
                "node_count": len(ui_payload.get("nodes", {})),
                "neighbor_limit": ui_payload.get("meta", {}).get("ui_neighbor_limit"),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
