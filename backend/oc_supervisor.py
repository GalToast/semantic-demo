#!/usr/bin/env python3
from __future__ import annotations

import argparse
import concurrent.futures
import json
import re
import shutil
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


CONFIG_DIR = Path.home() / ".config" / "opencode"
STATE_FILE = CONFIG_DIR / "oc-super-state.json"
CACHE_FILE = CONFIG_DIR / "oc-super-model-cache.json"
EVENT_LOG_FILE = CONFIG_DIR / "oc-super-events.jsonl"
TASKS_FILE = CONFIG_DIR / "oc-super-tasks.json"
TEAMS_FILE = CONFIG_DIR / "oc-super-teams.json"
OPENCODE_ALLOWLIST_FILE = CONFIG_DIR / "oc-super-opencode-models.json"
MODEL_STATS_FILE = CONFIG_DIR / "oc-super-model-stats.json"
DEFAULT_REPORT_FILE = Path("notes") / "model-capability-map.md"

CACHE_MAX_AGE = timedelta(minutes=10)
DEFAULT_MAX_LOOPS = 5
DEFAULT_WORKER_COUNT = 3
MODEL_TARGETS: dict[str, dict[str, Any]] = {
    "qwen35": {
        "choices": [
            "bailian-coding-plan-test/qwen3.5-plus",
            "alibaba/qwen3.5-plus",
            "opencode/qwen3.5-plus",
        ],
        "aliases": ["qwen3.5-plus", "qwen3-5-plus", "qwen35-plus"],
        "benchmark": {"code": 82, "reasoning": 90, "speed": 80},
        "vision": True,
        "context": "~1M input tier",
        "variant": "high",
        "official_benchmarks": "Public qwen3.5-plus coding benchmark table not published by Alibaba.",
        "strengths": "Balanced reasoning and long-context planning.",
        "weaknesses": "Can be slower on rapid-fire coding loops.",
    },
    "glm5": {
        "choices": [
            "bailian-coding-plan-test/glm-5",
            "opencode/glm-5",
            "alibaba/glm-5",
        ],
        "aliases": ["glm-5"],
        "benchmark": {"code": 78, "reasoning": 91, "speed": 76},
        "vision": False,
        "context": "~202,752",
        "variant": "high",
        "official_benchmarks": "SWE-bench Verified 77.8; Terminal Bench 2.0 56.2/60.7; LongBench v2 68.4.",
        "strengths": "Excellent validation, risk review, and deep reasoning.",
        "weaknesses": "Not the fastest for first-draft implementation.",
    },
    "kimi25": {
        "choices": [
            "bailian-coding-plan-test/kimi-k2.5",
            "opencode/kimi-k2.5",
            "moonshotai/kimi-k2.5",
        ],
        "aliases": ["kimi-k2.5", "kimi-k2p5", "kimi-k2-5"],
        "benchmark": {"code": 74, "reasoning": 86, "speed": 79},
        "vision": True,
        "context": "~262,144",
        "variant": "high",
        "official_benchmarks": "SWE-bench Verified 76.8; SWE-Bench Pro 50.7; Terminal-Bench 2.0 50.8.",
        "strengths": "Strong synthesis and coherent long-form outputs.",
        "weaknesses": "Less implementation-specific than coding-specialist models.",
    },
    "minimax25": {
        "choices": [
            "bailian-coding-plan-test/MiniMax-M2.5",
            "opencode/minimax-m2.5",
            "opencode/minimax-m2.5-free",
        ],
        "aliases": ["minimax-m2.5", "minimax m2.5", "minimax-m2"],
        "benchmark": {"code": 72, "reasoning": 75, "speed": 93},
        "vision": False,
        "context": "~204,800",
        "variant": "high",
        "official_benchmarks": "SWE-bench Verified 80.2; Multi-SWE-Bench 51.3; BrowseComp 76.3.",
        "strengths": "Fast iteration and low-latency baseline drafting.",
        "weaknesses": "Reasoning depth can trail validation-focused models.",
    },
    "codexspark": {
        "choices": [
            "openai/gpt-5.3-codex-spark",
            "opencode/gpt-5.3-codex-spark",
        ],
        "aliases": ["gpt-5.3-codex-spark", "codex-spark"],
        "benchmark": {"code": 95, "reasoning": 88, "speed": 94},
        "vision": False,
        "context": "128k",
        "variant": "xhigh",
        "official_benchmarks": "No standalone Spark table; GPT-5.3-Codex (xhigh) reports SWE-Bench Pro 56.8 and Terminal-Bench 2.0 77.3.",
        "strengths": "Top-tier coding speed with strong tool-use reliability.",
        "weaknesses": "Can over-optimize implementation when strategy is unresolved.",
    },
}
ORCHESTRATOR_TARGET_ORDER = ["qwen35", "glm5", "kimi25", "minimax25", "codexspark"]
MODEL_SPECIALISTS: dict[str, dict[str, str]] = {
    "bailian-coding-plan-test/qwen3.5-plus": {
        "role": "General Strategy Specialist",
        "style": "Balanced planning with clear tradeoffs",
    },
    "bailian-coding-plan-test/glm-5": {
        "role": "Quality Gate Specialist",
        "style": "Strict validation, risks, and failure modes first",
    },
    "bailian-coding-plan-test/kimi-k2.5": {
        "role": "Synthesis Specialist",
        "style": "Long-context synthesis and clear narrative outputs",
    },
    "bailian-coding-plan-test/MiniMax-M2.5": {
        "role": "Speed Baseline Specialist",
        "style": "Fast draft and concise baseline framing",
    },
    "openai/gpt-5.3-codex": {
        "role": "Senior Code Architect",
        "style": "High-precision reasoning with robust implementation detail",
    },
    "openai/gpt-5.3-codex-spark": {
        "role": "Rapid Codex Specialist",
        "style": "Fast, sharp coding iterations for subagent workloads",
    },
}
AGENT_TYPE_TARGETS: dict[str, list[str]] = {
    "reviewer": [
        "glm5",
        "codexspark",
        "qwen35",
    ],
    "coder": [
        "codexspark",
        "qwen35",
        "minimax25",
    ],
    "strategist": [
        "qwen35",
        "glm5",
        "kimi25",
    ],
    "synthesizer": [
        "kimi25",
        "qwen35",
        "codexspark",
    ],
    "speed": [
        "minimax25",
        "codexspark",
        "qwen35",
    ],
    "general": [
        "qwen35",
        "glm5",
        "kimi25",
        "minimax25",
        "codexspark",
    ],
}


def _target_for_model(model_id: str) -> str | None:
    lower = model_id.lower()
    for key, meta in MODEL_TARGETS.items():
        for choice in meta["choices"]:
            if model_id == choice:
                return key
        for alias in meta.get("aliases", []):
            if alias in lower:
                return key
    return None


def _resolve_target_model(target: str, available: list[str]) -> str | None:
    meta = MODEL_TARGETS.get(target)
    if not meta:
        return None
    available_set = set(available)
    for choice in meta["choices"]:
        if choice in available_set:
            return choice
    aliases = meta.get("aliases", [])
    for model in available:
        lower = model.lower()
        if any(alias in lower for alias in aliases):
            return model
    return None


def preferred_variant_for_model(model_id: str) -> str | None:
    key = _target_for_model(model_id)
    if not key:
        return None
    meta = MODEL_TARGETS.get(key, {})
    variant = meta.get("variant")
    return str(variant) if isinstance(variant, str) and variant.strip() else None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return default


def write_json(path: Path, payload: Any) -> None:
    ensure_parent(path)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def append_event(event_type: str, payload: dict[str, Any]) -> None:
    event = {
        "timestamp": now_iso(),
        "event": event_type,
        "payload": payload,
    }
    ensure_parent(EVENT_LOG_FILE)
    with EVENT_LOG_FILE.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(event, ensure_ascii=True) + "\n")


def resolve_opencode_executable() -> str:
    for candidate in ("opencode", "opencode.cmd", "opencode.exe"):
        path = shutil.which(candidate)
        if path:
            return path
    raise RuntimeError("OpenCode CLI not found on PATH.")


def run_opencode_models() -> list[str]:
    opencode_exe = resolve_opencode_executable()
    proc = subprocess.run(
        [opencode_exe, "models"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if proc.returncode != 0:
        stderr = proc.stderr.strip() or "unknown error"
        raise RuntimeError(f"`opencode models` failed: {stderr}")

    models = sorted(
        {
            line.strip()
            for line in proc.stdout.splitlines()
            if line.strip() and "/" in line and not line.startswith("â–„")
        }
    )
    return models


def load_opencode_allowlist() -> set[str]:
    raw = read_json(OPENCODE_ALLOWLIST_FILE, [])
    if not isinstance(raw, list):
        return set()
    return {str(item).strip() for item in raw if str(item).strip().startswith("opencode/")}


def is_opencode_free(model_id: str) -> bool:
    return model_id.startswith("opencode/") and "free" in model_id.lower()


def filter_allowed_orchestrators(all_models: list[str]) -> list[str]:
    picked: list[str] = []
    for target in ORCHESTRATOR_TARGET_ORDER:
        model = _resolve_target_model(target, all_models)
        if model and model not in picked:
            picked.append(model)
    return picked


def model_details(model_id: str) -> dict[str, Any]:
    key = _target_for_model(model_id)
    if key:
        meta = MODEL_TARGETS[key]
        benchmark = meta["benchmark"]
        return {
            "benchmark": f"{benchmark['code']}/{benchmark['reasoning']}/{benchmark['speed']}",
            "vision": "Yes" if meta["vision"] else "No",
            "context": meta["context"],
            "official_benchmarks": str(meta.get("official_benchmarks", "Not published")),
            "strengths": meta["strengths"],
            "weaknesses": meta["weaknesses"],
            "benchmark_note": "internal task-fit score (code/reasoning/speed)",
        }
    profile = seed_profile(model_id)
    return {
        "benchmark": "n/a",
        "vision": "Unknown",
        "context": "Unknown",
        "official_benchmarks": "Not published",
        "strengths": profile["strengths"],
        "weaknesses": profile["weaknesses"],
        "benchmark_note": "no internal benchmark profile yet",
    }


def cache_payload(models: list[str]) -> dict[str, Any]:
    return {
        "updated_at": now_iso(),
        "all_models": models,
        "orchestrator_models": filter_allowed_orchestrators(models),
    }


def refresh_cache() -> dict[str, Any]:
    models = run_opencode_models()
    payload = cache_payload(models)
    write_json(CACHE_FILE, payload)
    append_event(
        "orchestrator.refresh",
        {
            "all_model_count": len(models),
            "orchestrator_model_count": len(payload["orchestrator_models"]),
        },
    )
    return payload


def load_cache_or_refresh(force_refresh: bool = False) -> dict[str, Any]:
    if force_refresh:
        return refresh_cache()

    cache = read_json(CACHE_FILE, {})
    updated_at = cache.get("updated_at")
    if isinstance(updated_at, str):
        try:
            age = datetime.now(timezone.utc) - datetime.fromisoformat(updated_at)
            if age <= CACHE_MAX_AGE and isinstance(cache.get("orchestrator_models"), list):
                return cache
        except ValueError:
            pass
    return refresh_cache()


def read_state() -> dict[str, Any]:
    state = read_json(STATE_FILE, {})
    if not isinstance(state, dict):
        return {}
    return state


def write_state(state: dict[str, Any]) -> None:
    write_json(STATE_FILE, state)


def source_label(model_id: str) -> str:
    if model_id.startswith("bailian-coding-plan-test/"):
        return "Alibaba Coding Plan"
    if model_id.startswith("openai/"):
        return "ChatGPT (OpenAI)"
    if model_id.startswith("opencode/"):
        return "OpenCode Free"
    return "Other"


def seed_profile(model_id: str) -> dict[str, str]:
    lower = model_id.lower()
    if "coder" in lower:
        return {
            "strengths": "Code generation, refactors, implementation details",
            "weaknesses": "Can over-engineer simple tasks",
            "best_for": "Coding, scripting, bugfix plans",
            "avoid_for": "Creative copy tone matching",
        }
    if "glm-5" in lower:
        return {
            "strengths": "Reasoning depth, structured analysis",
            "weaknesses": "Can be slower than flash-tier models",
            "best_for": "Validation, planning, tradeoff analysis",
            "avoid_for": "Ultra-low-latency quick replies",
        }
    if "glm-4.7" in lower:
        return {
            "strengths": "Fast, reliable general assistant behavior",
            "weaknesses": "Lower ceiling on complex synthesis",
            "best_for": "Triage, summarization, quick edits",
            "avoid_for": "Hard multi-constraint planning",
        }
    if "qwen3.5-plus" in lower or "qwen3-max" in lower:
        return {
            "strengths": "General reasoning and balanced quality",
            "weaknesses": "May be slower/costlier than lightweight models",
            "best_for": "General orchestration and review",
            "avoid_for": "High-volume low-stakes batching",
        }
    if "kimi" in lower:
        return {
            "strengths": "Long-context synthesis and coherent drafting",
            "weaknesses": "Less coding-specialized than coder-focused models",
            "best_for": "Long context review, narrative outputs",
            "avoid_for": "Precise code patch generation",
        }
    if "minimax" in lower:
        return {
            "strengths": "Fast and inexpensive baseline coverage",
            "weaknesses": "Inconsistent on advanced reasoning edge cases",
            "best_for": "Cheap first-pass drafts and triage",
            "avoid_for": "Final high-stakes decisions",
        }
    if "trinity" in lower:
        return {
            "strengths": "Free fallback coverage",
            "weaknesses": "Quality can vary by task type",
            "best_for": "Backup worker path and simple chores",
            "avoid_for": "Primary orchestrator role",
        }
    if model_id.startswith("openai/"):
        return {
            "strengths": "Strong general reasoning and tool-aware orchestration",
            "weaknesses": "May cost more than local free options",
            "best_for": "Supervisor and validator roles",
            "avoid_for": "Always-on cheap bulk processing",
        }
    return {
        "strengths": "General-purpose fallback",
        "weaknesses": "Unknown profile; needs more data",
        "best_for": "Exploration runs",
        "avoid_for": "Critical single-model dependency",
    }


def specialist_profile(model_id: str) -> dict[str, str]:
    default = {
        "role": "General Specialist",
        "style": "Clear, practical, and direct",
    }
    return MODEL_SPECIALISTS.get(model_id, default)


def role_fit_bonus(domain: str, role: str) -> float:
    d = domain.lower()
    r = role.lower()
    if any(token in d for token in ("code", "bug", "script", "dev", "automation")):
        if "implementation" in r:
            return 2.0
        if "quality gate" in r:
            return 1.4
    if any(token in d for token in ("strategy", "plan", "business", "outreach", "sales")):
        if "strategy" in r or "synthesis" in r:
            return 1.8
    if any(token in d for token in ("review", "qa", "security", "risk", "audit")):
        if "quality gate" in r or "complex reasoning" in r:
            return 2.0
    return 0.4


def worker_objective(role: str, domain: str) -> str:
    r = role.lower()
    if "implementation" in r:
        return f"Produce the most actionable implementation for domain '{domain}'."
    if "strategy" in r:
        return f"Deliver the clearest strategy and decision path for domain '{domain}'."
    if "complex reasoning" in r:
        return f"Stress-test assumptions and surface non-obvious constraints for '{domain}'."
    if "quality gate" in r:
        return f"Find flaws, risks, and missing requirements in the current approach for '{domain}'."
    if "synthesis" in r:
        return f"Synthesize the task into a coherent, easy-to-execute output for '{domain}'."
    if "speed baseline" in r:
        return f"Provide a fast baseline output for '{domain}' that can be improved if needed."
    return f"Provide a practical specialist take for '{domain}'."


def read_model_stats() -> dict[str, Any]:
    raw = read_json(MODEL_STATS_FILE, {})
    if not isinstance(raw, dict):
        return {"models": {}}
    raw.setdefault("models", {})
    if not isinstance(raw["models"], dict):
        raw["models"] = {}
    return raw


def write_model_stats(stats: dict[str, Any]) -> None:
    write_json(MODEL_STATS_FILE, stats)


def _ensure_model_stat(stats: dict[str, Any], model: str) -> dict[str, Any]:
    models = stats.setdefault("models", {})
    entry = models.setdefault(
        model,
        {
            "attempts": 0,
            "selected": 0,
            "selected_success": 0,
            "selected_fail": 0,
            "avg_latency_ms": 0.0,
            "avg_chars": 0.0,
            "domains": {},
        },
    )
    entry.setdefault("domains", {})
    return entry


def _rolling_avg(current: float, count: int, new_value: float) -> float:
    if count <= 1:
        return float(new_value)
    return ((current * (count - 1)) + new_value) / count


def update_worker_stats(
    model: str,
    domain: str,
    latency_ms: float,
    output_chars: int,
    selected: bool,
    final_pass: bool,
) -> None:
    stats = read_model_stats()
    entry = _ensure_model_stat(stats, model)
    entry["attempts"] = int(entry.get("attempts", 0)) + 1
    attempts = int(entry["attempts"])
    entry["avg_latency_ms"] = _rolling_avg(float(entry.get("avg_latency_ms", 0.0)), attempts, latency_ms)
    entry["avg_chars"] = _rolling_avg(float(entry.get("avg_chars", 0.0)), attempts, float(output_chars))

    domain_map = entry.setdefault("domains", {})
    domain_entry = domain_map.setdefault(
        domain,
        {"attempts": 0, "selected": 0, "selected_success": 0, "selected_fail": 0},
    )
    domain_entry["attempts"] = int(domain_entry.get("attempts", 0)) + 1

    if selected:
        entry["selected"] = int(entry.get("selected", 0)) + 1
        domain_entry["selected"] = int(domain_entry.get("selected", 0)) + 1
        if final_pass:
            entry["selected_success"] = int(entry.get("selected_success", 0)) + 1
            domain_entry["selected_success"] = int(domain_entry.get("selected_success", 0)) + 1
        else:
            entry["selected_fail"] = int(entry.get("selected_fail", 0)) + 1
            domain_entry["selected_fail"] = int(domain_entry.get("selected_fail", 0)) + 1

    write_model_stats(stats)


def dynamic_model_score(model: str, domain: str, preferred_rank: int) -> float:
    stats = read_model_stats()
    entry = stats.get("models", {}).get(model, {})
    attempts = float(entry.get("attempts", 0))
    selected = float(entry.get("selected", 0))
    selected_success = float(entry.get("selected_success", 0))
    success_rate = (selected_success / selected) if selected > 0 else 0.0
    domain_entry = entry.get("domains", {}).get(domain, {})
    domain_selected = float(domain_entry.get("selected", 0))
    domain_success = float(domain_entry.get("selected_success", 0))
    domain_success_rate = (domain_success / domain_selected) if domain_selected > 0 else 0.0

    base = max(0.0, 10.0 - float(preferred_rank))
    confidence_bonus = min(2.0, attempts / 20.0)
    role_bonus = role_fit_bonus(domain=domain, role=specialist_profile(model).get("role", ""))
    return base + (success_rate * 4.0) + (domain_success_rate * 5.0) + confidence_bonus + role_bonus


def build_model_capability_report(models: list[str]) -> str:
    stats = read_model_stats()
    lines: list[str] = []
    lines.append("# Model Capability Map")
    lines.append("")
    lines.append(f"Generated: {now_iso()}")
    lines.append("")
    lines.append("This file combines seeded capability priors with learned runtime stats.")
    lines.append("")
    lines.append(
        "| Model | Source | Bench (C/R/S) | Official Benchmarks | Vision | Context | Specialist Role | Style | Strengths | Weaknesses | Best For | Avoid For | Attempts | Selected | Selected Success Rate | Avg Latency (ms) |"
    )
    lines.append("|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|")

    for model in models:
        profile = seed_profile(model)
        specialist = specialist_profile(model)
        details = model_details(model)
        entry = stats.get("models", {}).get(model, {})
        attempts = int(entry.get("attempts", 0))
        selected = int(entry.get("selected", 0))
        selected_success = int(entry.get("selected_success", 0))
        rate = (selected_success / selected * 100.0) if selected > 0 else 0.0
        avg_latency = float(entry.get("avg_latency_ms", 0.0))
        lines.append(
            f"| `{model}` | {source_label(model)} | {details['benchmark']} | {details['official_benchmarks']} | {details['vision']} | {details['context']} | {specialist['role']} | {specialist['style']} | "
            f"{profile['strengths']} | {profile['weaknesses']} | {profile['best_for']} | {profile['avoid_for']} | "
            f"{attempts} | {selected} | {rate:.1f}% | {avg_latency:.1f} |"
        )

    lines.append("")
    lines.append("## Notes")
    lines.append("- Seeded strengths/weaknesses are initial priors.")
    lines.append("- Bench (C/R/S) is an internal task-fit score: code/reasoning/speed (0-100).")
    lines.append("- Official benchmark values are copied from vendor-published model cards/blogs when available.")
    lines.append("- Vision/context are capability cards for fast model routing.")
    lines.append("- Runtime stats are learned from `/task run` outcomes and will improve over time.")
    return "\n".join(lines) + "\n"


def read_tasks() -> list[dict[str, Any]]:
    raw = read_json(TASKS_FILE, [])
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]


def write_tasks(tasks: list[dict[str, Any]]) -> None:
    write_json(TASKS_FILE, tasks)


def read_teams() -> list[dict[str, Any]]:
    raw = read_json(TEAMS_FILE, [])
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]


def write_teams(teams: list[dict[str, Any]]) -> None:
    write_json(TEAMS_FILE, teams)


def task_next_id(tasks: list[dict[str, Any]]) -> int:
    highest = 0
    for task in tasks:
        try:
            highest = max(highest, int(task.get("id", 0)))
        except (TypeError, ValueError):
            continue
    return highest + 1


def team_next_id(teams: list[dict[str, Any]]) -> int:
    highest = 0
    for team in teams:
        try:
            highest = max(highest, int(team.get("id", 0)))
        except (TypeError, ValueError):
            continue
    return highest + 1


def find_task(tasks: list[dict[str, Any]], task_id: int) -> dict[str, Any] | None:
    for task in tasks:
        try:
            if int(task.get("id", 0)) == task_id:
                return task
        except (TypeError, ValueError):
            continue
    return None


def find_team(teams: list[dict[str, Any]], team_id: int) -> dict[str, Any] | None:
    for team in teams:
        try:
            if int(team.get("id", 0)) == team_id:
                return team
        except (TypeError, ValueError):
            continue
    return None


def parse_run_text_output(stdout: str) -> str:
    lines = [line for line in stdout.splitlines() if line.strip()]
    chunks: list[str] = []
    for line in lines:
        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue
        if event.get("type") == "text":
            part = event.get("part", {})
            text = part.get("text", "")
            if isinstance(text, str):
                chunks.append(text)
    text = "\n".join(chunks).strip()
    if text:
        return text
    return stdout.strip()


def run_model_text(
    model: str,
    prompt: str,
    timeout_seconds: int = 120,
    variant: str | None = None,
) -> str:
    opencode_exe = resolve_opencode_executable()
    cmd = [opencode_exe, "run", prompt, "--model", model, "--format", "json"]
    if variant:
        cmd.extend(["--variant", variant])

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"model call timeout for {model} after {timeout_seconds}s") from exc
    if proc.returncode != 0:
        stderr = proc.stderr.strip() or proc.stdout.strip() or "unknown error"
        raise RuntimeError(f"model call failed for {model}: {stderr}")
    return parse_run_text_output(proc.stdout)


def pick_orchestrator_model(args: argparse.Namespace) -> str:
    if args.model:
        return args.model

    state = read_state()
    current = state.get("current_orchestrator")
    if isinstance(current, str) and current.strip():
        return current.strip()

    cache = load_cache_or_refresh(force_refresh=False)
    available = cache.get("orchestrator_models", [])
    if not available:
        raise RuntimeError("No allowed orchestrator models available.")
    return available[0]


def pick_worker_models(orchestrator: str, worker_count: int, refresh: bool, domain: str) -> list[str]:
    cache = load_cache_or_refresh(force_refresh=refresh)
    available = [m for m in cache.get("orchestrator_models", []) if m != orchestrator]
    preferred: list[str] = []
    for target in ("codexspark", "qwen35", "glm5", "kimi25", "minimax25"):
        resolved = _resolve_target_model(target, available)
        if resolved and resolved not in preferred:
            preferred.append(resolved)
    rank_map: dict[str, int] = {model: idx for idx, model in enumerate(preferred, start=1)}
    scored = sorted(
        available,
        key=lambda model: dynamic_model_score(model, domain=domain, preferred_rank=rank_map.get(model, 50)),
        reverse=True,
    )

    picked: list[str] = []
    used_roles: set[str] = set()
    for model in scored:
        role = specialist_profile(model).get("role", "General Specialist")
        if role not in used_roles:
            picked.append(model)
            used_roles.add(role)
        if len(picked) >= worker_count:
            return picked

    for model in scored:
        if model not in picked:
            picked.append(model)
        if len(picked) >= worker_count:
            break

    return picked


def default_role_for_type(agent_type: str, index: int) -> str:
    mapping = {
        "reviewer": "Code/Quality Reviewer",
        "coder": "Implementation Engineer",
        "strategist": "Strategy Planner",
        "synthesizer": "Synthesis Editor",
        "speed": "Rapid Baseline Builder",
        "general": "General Specialist",
    }
    base = mapping.get(agent_type, "General Specialist")
    return f"{base} #{index}"


def default_task_for_type(agent_type: str) -> str:
    mapping = {
        "reviewer": "Review for bugs, regressions, missing edge cases, and test gaps.",
        "coder": "Produce concrete implementation-quality output.",
        "strategist": "Provide the plan, sequencing, and tradeoffs.",
        "synthesizer": "Merge ideas into one coherent final output.",
        "speed": "Provide a fast baseline answer.",
        "general": "Solve the task directly with concise, practical output.",
    }
    return mapping.get(agent_type, mapping["general"])


def select_models_for_agent_type(agent_type: str, count: int, available: list[str]) -> list[str]:
    preferred = AGENT_TYPE_TARGETS.get(agent_type, AGENT_TYPE_TARGETS["general"])
    picked: list[str] = []
    for target in preferred:
        model = _resolve_target_model(target, available)
        if model and model not in picked:
            picked.append(model)
        if len(picked) >= count:
            return picked
    for model in available:
        if model not in picked:
            picked.append(model)
        if len(picked) >= count:
            break
    return picked


def resolve_team_from_target(target: str | None, teams: list[dict[str, Any]]) -> dict[str, Any] | None:
    state = read_state()
    if not target or target in ("current", "latest"):
        team_id = state.get("current_team_id")
        if isinstance(team_id, int):
            return find_team(teams, team_id)
        if teams:
            return teams[-1]
        return None

    try:
        parsed = int(target)
    except (TypeError, ValueError):
        return None
    return find_team(teams, parsed)


def resolve_assign_targets(
    target: str,
    teams: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    team = resolve_team_from_target(None, teams)
    if target in ("all", "team"):
        return (team, team.get("members", []) if team else [])

    if ":" in target:
        lhs, rhs = target.split(":", 1)
        try:
            team = find_team(teams, int(lhs))
        except ValueError:
            return (None, [])
        if not team:
            return (None, [])
        if rhs == "all":
            return (team, team.get("members", []))
        try:
            member_id = int(rhs)
        except ValueError:
            return (None, [])
        members = [m for m in team.get("members", []) if int(m.get("id", 0)) == member_id]
        return (team, members)

    # single member in current team
    if not team:
        return (None, [])
    try:
        member_id = int(target)
    except ValueError:
        return (None, [])
    members = [m for m in team.get("members", []) if int(m.get("id", 0)) == member_id]
    return (team, members)


def team_member_prompt(team: dict[str, Any], member: dict[str, Any]) -> str:
    team_goal = team.get("goal", "")
    task = member.get("task", "")
    role = member.get("role", "Specialist")
    style = member.get("style", "Clear and practical")
    return (
        f"You are {role}.\n"
        f"Style: {style}\n"
        f"Team goal:\n{team_goal}\n\n"
        f"Your specific assignment:\n{task}\n\n"
        "Use loop recall to stay on task and improve until complete.\n"
        "Return in this exact format:\n"
        "STATUS: DONE or NEEDS_WORK\n"
        "OUTPUT:\n"
        "<your current best output>"
    )


def cross_talk_prompt(team: dict[str, Any], member: dict[str, Any], peer_snippets: str) -> str:
    role = member.get("role", "Specialist")
    style = member.get("style", "Clear and practical")
    task = member.get("task", "")
    current = member.get("last_output", "")
    return (
        f"You are {role}. Style: {style}\n"
        "You are doing a cross-talk revision pass.\n\n"
        f"Team goal:\n{team.get('goal', '')}\n\n"
        f"Your assignment:\n{task}\n\n"
        f"Your current output:\n{current}\n\n"
        f"Peer outputs:\n{peer_snippets}\n\n"
        "Revise to improve complementarity and reduce overlap.\n"
        "Return in this exact format:\n"
        "STATUS: DONE or NEEDS_WORK\n"
        "OUTPUT:\n"
        "<revised output>"
    )


def parse_status_output(text: str) -> tuple[bool, str]:
    raw = text.strip()
    status_match = re.search(r"STATUS\s*:\s*(DONE|NEEDS_WORK)", raw, flags=re.IGNORECASE)
    output_match = re.search(r"OUTPUT\s*:\s*(.*)$", raw, flags=re.IGNORECASE | re.DOTALL)
    is_done = bool(status_match and status_match.group(1).upper() == "DONE")
    if output_match:
        out = output_match.group(1).strip()
        return is_done, out if out else raw
    return is_done, raw


def parse_best_index(text: str, total_candidates: int) -> int:
    match = re.search(r"BEST\s*:\s*(\d+)", text, flags=re.IGNORECASE)
    if match:
        try:
            idx = int(match.group(1))
            if 1 <= idx <= total_candidates:
                return idx
        except ValueError:
            pass
    return 1


def parse_verdict(text: str) -> tuple[bool, str]:
    cleaned = text.strip()
    if cleaned.upper().startswith("PASS"):
        return True, "validated"
    if cleaned.upper().startswith("FAIL"):
        reason = cleaned.split(":", 1)[1].strip() if ":" in cleaned else cleaned
        return False, reason
    return False, cleaned or "validator returned unknown verdict"


def infer_count(text: str, default: int = 3) -> int:
    lower = text.lower()
    digit_match = re.search(r"\b(\d+)\b", lower)
    if digit_match:
        try:
            return max(1, min(8, int(digit_match.group(1))))
        except ValueError:
            pass
    word_map = {
        "one": 1,
        "two": 2,
        "couple": 2,
        "few": 3,
        "three": 3,
        "four": 4,
        "five": 5,
        "six": 6,
    }
    for word, value in word_map.items():
        if re.search(rf"\b{word}\b", lower):
            return value
    return default


def infer_agent_type(text: str) -> str:
    lower = text.lower()
    if any(token in lower for token in ("review", "audit", "qa", "regression")):
        return "reviewer"
    if any(token in lower for token in ("fix", "implement", "code", "refactor", "patch")):
        return "coder"
    if any(token in lower for token in ("strategy", "plan", "roadmap")):
        return "strategist"
    if any(token in lower for token in ("synth", "merge", "combine")):
        return "synthesizer"
    return "general"


def infer_role_task_style(text: str, agent_type: str) -> tuple[str, str, str]:
    lower = text.lower()
    if "powerpoint" in lower or "ppt" in lower or "slides" in lower:
        return (
            "Presentation Builder",
            "Build a polished deck structure, slide narrative, and action-ready content from the request.",
            "Concise, executive, slide-friendly",
        )
    if agent_type == "reviewer":
        return (
            "Regression Hunter",
            f"Review the requested target and find bugs, regressions, and missing tests. Request: {text}",
            "Severity-first, concrete evidence, no fluff",
        )
    if agent_type == "coder":
        return (
            "Implementation Engineer",
            f"Implement and fix the requested changes. Request: {text}",
            "Patch-ready, explicit, test-aware",
        )
    if agent_type == "strategist":
        return (
            "Strategy Planner",
            f"Produce a clear execution strategy for: {text}",
            "Structured, tradeoff-aware, decisive",
        )
    return (
        "General Specialist",
        f"Execute this request with practical output: {text}",
        "Clear and practical",
    )


def infer_cross_talk(text: str) -> bool:
    lower = text.lower()
    return "cross-talk" in lower or "cross talk" in lower or "communicate" in lower or "talk to each other" in lower


def infer_auto_dispatch(text: str) -> bool:
    lower = text.lower()
    blockers = [
        "only summon",
        "just summon",
        "do not dispatch",
        "don't dispatch",
        "plan only",
    ]
    return not any(token in lower for token in blockers)


def do_director(args: argparse.Namespace) -> int:
    request = " ".join(args.request).strip()
    if not request:
        print("Director request cannot be empty.")
        return 2

    lower = request.lower()
    is_panel = any(token in lower for token in ("panel", "experts", "diverse experts"))
    cross_talk = infer_cross_talk(request) or args.cross_talk
    auto_dispatch = infer_auto_dispatch(request) and not args.plan_only

    if is_panel:
        panel_args = argparse.Namespace(
            topic=request,
            size=args.size if args.size else max(3, infer_count(request, default=4)),
            name=args.name,
            cross_talk=cross_talk,
            refresh=args.refresh,
        )
        rc = do_panel(panel_args)
        if rc != 0:
            return rc
        if auto_dispatch:
            teams = read_teams()
            team = resolve_team_from_target("latest", teams)
            if not team:
                print("Unable to resolve latest panel team.")
                return 1
            dispatch_args = argparse.Namespace(
                target=str(team["id"]),
                model=args.model,
                timeout_seconds=args.timeout_seconds,
                member_loops=args.member_loops,
            )
            return do_dispatch(dispatch_args)
        return 0

    count = args.count if args.count else infer_count(request)
    agent_type = args.agent_type if args.agent_type else infer_agent_type(request)
    summon_args = argparse.Namespace(
        count=count,
        agent_type=agent_type,
        name=args.name,
        goal=request,
        cross_talk=cross_talk,
        refresh=args.refresh,
    )
    rc = do_summon(summon_args)
    if rc != 0:
        return rc

    role, task, style = infer_role_task_style(request, agent_type=agent_type)
    assign_args = argparse.Namespace(target="all", role=role, task=task, style=style)
    do_assign(assign_args)

    if auto_dispatch:
        teams = read_teams()
        team = resolve_team_from_target("latest", teams)
        if not team:
            print("Unable to resolve latest summoned team.")
            return 1
        dispatch_args = argparse.Namespace(
            target=str(team["id"]),
            model=args.model,
            timeout_seconds=args.timeout_seconds,
            member_loops=args.member_loops,
        )
        return do_dispatch(dispatch_args)

    print("Director executed summon+assign (dispatch skipped by request).")
    return 0


def do_summon(args: argparse.Namespace) -> int:
    if args.count < 1:
        print("count must be >= 1")
        return 2

    cache = load_cache_or_refresh(force_refresh=args.refresh)
    available = cache.get("orchestrator_models", [])
    if not available:
        print("No allowed models available for summon.")
        return 1

    agent_type = args.agent_type.lower()
    models = select_models_for_agent_type(agent_type=agent_type, count=args.count, available=available)
    if not models:
        print("No models available for this agent type.")
        return 1

    teams = read_teams()
    team_id = team_next_id(teams)
    members: list[dict[str, Any]] = []
    for idx in range(args.count):
        model = models[idx % len(models)]
        specialist = specialist_profile(model)
        member = {
            "id": idx + 1,
            "name": f"{agent_type}-{idx + 1}",
            "agent_type": agent_type,
            "model": model,
            "variant": preferred_variant_for_model(model),
            "role": default_role_for_type(agent_type, idx + 1),
            "style": specialist.get("style", "Clear and practical"),
            "task": default_task_for_type(agent_type),
            "status": "ready",
            "last_output": "",
        }
        members.append(member)

    team = {
        "id": team_id,
        "name": args.name if args.name else f"{agent_type}-team-{team_id}",
        "goal": args.goal if args.goal else "",
        "cross_talk": bool(args.cross_talk),
        "status": "drafted",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "members": members,
        "dispatch_history": [],
    }
    teams.append(team)
    write_teams(teams)

    state = read_state()
    state["current_team_id"] = team_id
    state["current_team_set_at"] = now_iso()
    write_state(state)

    append_event(
        "team.summon",
        {
            "team_id": team_id,
            "name": team["name"],
            "agent_type": agent_type,
            "count": args.count,
            "cross_talk": bool(args.cross_talk),
        },
    )

    print(f"Summoned team #{team_id} ({team['name']})")
    print(f"Cross-talk: {'on' if team['cross_talk'] else 'off'}")
    for member in members:
        variant = member.get("variant") or "default"
        print(f"  - member {member['id']}: {member['model']} ({variant}) | {member['role']}")
    return 0


def do_assign(args: argparse.Namespace) -> int:
    teams = read_teams()
    team, targets = resolve_assign_targets(args.target, teams)
    if not team or not targets:
        print("No matching team/member targets found.")
        return 1

    for member in targets:
        if args.role:
            member["role"] = args.role
        if args.task:
            member["task"] = args.task
        if args.style:
            member["style"] = args.style
        member["status"] = "ready"
    team["updated_at"] = now_iso()
    write_teams(teams)
    append_event(
        "team.assign",
        {
            "team_id": team["id"],
            "target": args.target,
            "count": len(targets),
            "updated_fields": {
                "role": bool(args.role),
                "task": bool(args.task),
                "style": bool(args.style),
            },
        },
    )
    print(f"Updated {len(targets)} member(s) in team #{team['id']}.")
    return 0


def do_cross_talk(args: argparse.Namespace) -> int:
    teams = read_teams()
    team = resolve_team_from_target(args.target, teams)
    if not team:
        print("Team not found.")
        return 1
    enabled = args.setting.lower() == "on"
    team["cross_talk"] = enabled
    team["updated_at"] = now_iso()
    write_teams(teams)
    append_event("team.cross_talk", {"team_id": team["id"], "enabled": enabled})
    print(f"Team #{team['id']} cross-talk: {'on' if enabled else 'off'}")
    return 0


def do_dispatch(args: argparse.Namespace) -> int:
    teams = read_teams()
    team = resolve_team_from_target(args.target, teams)
    if not team:
        print("Team not found.")
        return 1
    members = team.get("members", [])
    if not members:
        print("Team has no members.")
        return 1

    orchestrator_model = pick_orchestrator_model(args)
    team["status"] = "dispatching"
    team["updated_at"] = now_iso()
    write_teams(teams)
    append_event(
        "team.dispatch.start",
        {
            "team_id": team["id"],
            "member_count": len(members),
            "cross_talk": bool(team.get("cross_talk")),
            "orchestrator": orchestrator_model,
            "orchestrator_variant": preferred_variant_for_model(orchestrator_model),
            "member_loops": args.member_loops,
        },
    )

    for member in members:
        member.setdefault("history", [])
        member["status"] = "running"

    def run_member_round(member: dict[str, Any], round_index: int) -> tuple[int, str, bool]:
        prior = member.get("last_output", "")
        recall = ""
        if prior:
            recall = f"\nPrior output:\n{prior}\n"
        prompt = (
            team_member_prompt(team, member)
            + f"\n\nRound: {round_index}/{args.member_loops}."
            + recall
        )
        member_variant = member.get("variant") or preferred_variant_for_model(str(member["model"]))
        raw = run_model_text(
            model=member["model"],
            prompt=prompt,
            timeout_seconds=args.timeout_seconds,
            variant=member_variant,
        )
        done, output = parse_status_output(raw)
        return int(member["id"]), output.strip(), done

    for round_index in range(1, args.member_loops + 1):
        active = [m for m in members if str(m.get("status")) not in ("done", "failed")]
        if not active:
            break

        with concurrent.futures.ThreadPoolExecutor(max_workers=len(active)) as pool:
            futures = {pool.submit(run_member_round, member, round_index): member for member in active}
            for fut in concurrent.futures.as_completed(futures):
                member = futures[fut]
                try:
                    mid, output, done = fut.result()
                    member["last_output"] = output
                    member.setdefault("history", []).append(
                        {"round": round_index, "output": output, "done": done, "at": now_iso()}
                    )
                    member["status"] = "done" if done else "running"
                    append_event(
                        "team.dispatch.member_round",
                        {
                            "team_id": team["id"],
                            "member_id": mid,
                            "model": member.get("model", ""),
                            "variant": member.get("variant") or preferred_variant_for_model(str(member.get("model", ""))),
                            "round": round_index,
                            "done": done,
                            "chars": len(output),
                        },
                    )
                except Exception as exc:  # noqa: BLE001
                    member["last_output"] = f"[ERROR] {exc}"
                    member["status"] = "failed"
                    member.setdefault("history", []).append(
                        {"round": round_index, "output": member["last_output"], "done": False, "at": now_iso()}
                    )
                    append_event(
                        "team.dispatch.member_error",
                        {
                            "team_id": team["id"],
                            "member_id": member["id"],
                            "round": round_index,
                            "error": str(exc),
                        },
                    )

        # optional cross-talk recall between rounds
        if team.get("cross_talk") and round_index < args.member_loops and len(members) > 1:
            active_after = [m for m in members if str(m.get("status")) not in ("failed",)]
            for member in active_after:
                peers = [m for m in active_after if int(m.get("id", 0)) != int(member.get("id", 0))]
                peer_snippets = "\n\n".join(
                    f"member {p['id']} ({p['role']}):\n{p.get('last_output', '')[:1200]}" for p in peers
                )
                if not peer_snippets.strip():
                    continue
                try:
                    member_variant = member.get("variant") or preferred_variant_for_model(str(member["model"]))
                    revised_raw = run_model_text(
                        model=member["model"],
                        prompt=cross_talk_prompt(team, member, peer_snippets),
                        timeout_seconds=args.timeout_seconds,
                        variant=member_variant,
                    )
                    done, revised = parse_status_output(revised_raw)
                    member["last_output"] = revised
                    member.setdefault("history", []).append(
                        {"round": round_index, "cross_talk": True, "output": revised, "done": done, "at": now_iso()}
                    )
                    if done:
                        member["status"] = "done"
                except Exception as exc:  # noqa: BLE001
                    append_event(
                        "team.dispatch.cross_talk_error",
                        {"team_id": team["id"], "member_id": member["id"], "round": round_index, "error": str(exc)},
                    )

    valid_members = [m for m in members if str(m.get("status")) == "done" and m.get("last_output")]
    if not valid_members:
        # allow fallback to non-failed outputs if no member reported DONE
        valid_members = [m for m in members if str(m.get("status")) != "failed" and m.get("last_output")]
    if not valid_members:
        team["status"] = "needs_review"
        team["updated_at"] = now_iso()
        team.setdefault("dispatch_history", []).append(
            {"at": now_iso(), "status": team["status"], "reason": "all_members_failed"}
        )
        write_teams(teams)
        print(f"Team #{team['id']} dispatch failed: all members failed.")
        return 1

    candidate_block = "\n\n".join(
        f"[{i + 1}] member {m['id']} ({m['role']}, model={m['model']}):\n{m['last_output']}"
        for i, m in enumerate(valid_members)
    )
    synthesis_prompt = (
        "You are the team supervisor. Merge the best parts of member outputs into one final answer.\n"
        "Return clean final output only.\n\n"
        f"TEAM GOAL:\n{team.get('goal', '')}\n\n"
        f"MEMBER OUTPUTS:\n{candidate_block}\n"
    )
    try:
        final_output = run_model_text(
            model=orchestrator_model,
            prompt=synthesis_prompt,
            timeout_seconds=args.timeout_seconds,
            variant=preferred_variant_for_model(orchestrator_model),
        ).strip()
    except Exception as exc:  # noqa: BLE001
        final_output = valid_members[0]["last_output"]
        append_event(
            "team.dispatch.synthesis_error",
            {"team_id": team["id"], "error": str(exc), "fallback_member": valid_members[0]["id"]},
        )

    team["status"] = "completed"
    team["updated_at"] = now_iso()
    team["final_output"] = final_output
    team.setdefault("dispatch_history", []).append(
        {
            "at": now_iso(),
            "status": team["status"],
            "cross_talk": bool(team.get("cross_talk")),
            "orchestrator_model": orchestrator_model,
            "member_count": len(members),
            "member_loops": args.member_loops,
        }
    )
    write_teams(teams)
    append_event(
        "team.dispatch.finish",
        {
            "team_id": team["id"],
            "status": team["status"],
            "cross_talk": bool(team.get("cross_talk")),
            "result_chars": len(final_output),
        },
    )
    print(f"Team #{team['id']} completed.")
    print("\nFinal Output:\n")
    print(final_output)
    return 0


def do_panel(args: argparse.Namespace) -> int:
    topic = args.topic.strip()
    if not topic:
        print("Topic is required.")
        return 2

    roles = [
        ("strategist", "Strategy Planner"),
        ("coder", "Implementation Engineer"),
        ("reviewer", "Risk & QA Reviewer"),
        ("synthesizer", "Synthesis Editor"),
        ("speed", "Rapid Counterpoint"),
    ]
    size = max(1, min(args.size, len(roles)))

    cache = load_cache_or_refresh(force_refresh=args.refresh)
    available = cache.get("orchestrator_models", [])
    if not available:
        print("No models available.")
        return 1

    teams = read_teams()
    team_id = team_next_id(teams)
    members: list[dict[str, Any]] = []
    for idx in range(size):
        agent_type, role = roles[idx]
        model_choices = select_models_for_agent_type(agent_type=agent_type, count=1, available=available)
        model = model_choices[0] if model_choices else available[0]
        specialist = specialist_profile(model)
        members.append(
            {
                "id": idx + 1,
                "name": f"panel-{idx + 1}",
                "agent_type": agent_type,
                "model": model,
                "variant": preferred_variant_for_model(model),
                "role": role,
                "style": specialist.get("style", "Clear and practical"),
                "task": f"Provide your {role.lower()} perspective on: {topic}",
                "status": "ready",
                "last_output": "",
            }
        )

    team = {
        "id": team_id,
        "name": args.name if args.name else f"panel-{team_id}",
        "goal": topic,
        "cross_talk": bool(args.cross_talk),
        "status": "drafted",
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "members": members,
        "dispatch_history": [],
    }
    teams.append(team)
    write_teams(teams)
    state = read_state()
    state["current_team_id"] = team_id
    state["current_team_set_at"] = now_iso()
    write_state(state)

    append_event(
        "team.panel",
        {"team_id": team_id, "size": size, "cross_talk": bool(args.cross_talk), "topic": topic},
    )
    print(f"Panel team #{team_id} created for topic: {topic}")
    for member in members:
        variant = member.get("variant") or "default"
        print(f"  - member {member['id']}: {member['model']} ({variant}) | {member['role']}")
    return 0


def do_orchestrator_refresh(_: argparse.Namespace) -> int:
    cache = refresh_cache()
    print(f"Refreshed: {len(cache['orchestrator_models'])} orchestrator models available.")
    return 0


def do_orchestrator_list(args: argparse.Namespace) -> int:
    cache = load_cache_or_refresh(force_refresh=args.refresh)
    available = cache.get("orchestrator_models", [])
    state = read_state()
    current = state.get("current_orchestrator")

    if not available:
        print("No allowed orchestrator models found.")
        print("Allowed set: qwen3.5-plus, glm-5, kimi-k2.5, MiniMax-M2.5, gpt-5.3-codex-spark")
        return 1

    groups = {
        "Alibaba Coding Plan": [],
    }
    for model in available:
        label = source_label(model)
        if label not in groups:
            groups[label] = []
        groups[label].append(model)

    print("Available orchestrator models:")
    for label in ("Alibaba Coding Plan", *[k for k in groups.keys() if k != "Alibaba Coding Plan"]):
        models = groups[label]
        if not models:
            continue
        print(f"\n{label}:")
        for model in models:
            marker = "*" if model == current else " "
            print(f" {marker} {model}")
            details = model_details(model)
            print(
                f"    Bench C/R/S: {details['benchmark']} ({details['benchmark_note']}) | Vision: {details['vision']} | Context: {details['context']}"
            )
            print(f"    Official Benchmarks: {details['official_benchmarks']}")
            print(f"    Strengths: {details['strengths']}")
            print(f"    Weaknesses: {details['weaknesses']}")

    if current and current not in available:
        print(f"\nCurrent model is unavailable now: {current}")
    return 0


def do_orchestrator_current(args: argparse.Namespace) -> int:
    state = read_state()
    current = state.get("current_orchestrator", "")
    if args.raw:
        print(current)
        return 0

    if not current:
        print("Current orchestrator: not set")
        return 0

    print(f"Current orchestrator: {current}")
    print(f"Source: {source_label(current)}")
    set_at = state.get("set_at")
    if set_at:
        print(f"Set at: {set_at}")
    return 0


def do_orchestrator_set(args: argparse.Namespace) -> int:
    target = args.model
    if not target:
        print("Missing model. Usage: /orchestrator set <provider/model>")
        return 2

    cache = load_cache_or_refresh(force_refresh=args.refresh)
    available = set(cache.get("orchestrator_models", []))
    if target not in available:
        print(f"Model not allowed/unavailable: {target}")
        print("Run `/orchestrator` to view available choices.")
        return 2

    state = read_state()
    old = state.get("current_orchestrator")
    state["current_orchestrator"] = target
    state["set_at"] = now_iso()
    write_state(state)
    append_event("orchestrator.set", {"previous": old, "current": target})
    print(f"Orchestrator set to: {target}")
    return 0


def do_mode_current(args: argparse.Namespace) -> int:
    state = read_state()
    mode = state.get("launch_mode", "orchestrated")
    if args.raw:
        print(mode)
    else:
        print(f"Launch mode: {mode}")
    return 0


def do_mode_set(args: argparse.Namespace) -> int:
    state = read_state()
    old = state.get("launch_mode", "orchestrated")
    state["launch_mode"] = args.mode
    state["launch_mode_set_at"] = now_iso()
    write_state(state)
    append_event("mode.set", {"previous": old, "current": args.mode})
    print(f"Launch mode set to: {args.mode}")
    return 0


def do_models_report(args: argparse.Namespace) -> int:
    cache = load_cache_or_refresh(force_refresh=args.refresh)
    models = cache.get("orchestrator_models", [])
    report = build_model_capability_report(models=models)
    out_path = Path(args.out) if args.out else DEFAULT_REPORT_FILE
    ensure_parent(out_path)
    out_path.write_text(report, encoding="utf-8")
    append_event("models.report", {"path": str(out_path), "model_count": len(models)})
    print(f"Wrote model capability map: {out_path}")
    return 0


def do_task_add(args: argparse.Namespace) -> int:
    description = args.description.strip()
    if not description:
        print("Task description cannot be empty.")
        return 2

    tasks = read_tasks()
    task_id = task_next_id(tasks)
    title = args.title.strip() if args.title else description[:72]
    task = {
        "id": task_id,
        "title": title,
        "description": description,
        "domain": args.domain,
        "status": "todo",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    tasks.append(task)
    write_tasks(tasks)
    append_event("task.add", {"id": task_id, "title": title, "domain": args.domain})
    print(f"Added task #{task_id}: {title}")
    return 0


def do_task_list(args: argparse.Namespace) -> int:
    tasks = read_tasks()
    if args.status:
        tasks = [task for task in tasks if task.get("status") == args.status]

    if not tasks:
        print("No tasks.")
        return 0

    for task in sorted(tasks, key=lambda x: int(x.get("id", 0))):
        tid = task.get("id")
        status = task.get("status", "unknown")
        title = task.get("title", "")
        print(f"#{tid} [{status}] {title}")
    return 0


def do_task_show(args: argparse.Namespace) -> int:
    tasks = read_tasks()
    task = find_task(tasks, args.id)
    if not task:
        print(f"Task not found: {args.id}")
        return 1
    print(json.dumps(task, indent=2))
    return 0


def do_task_run(args: argparse.Namespace) -> int:
    tasks = read_tasks()
    task = find_task(tasks, args.id)
    if not task:
        print(f"Task not found: {args.id}")
        return 1

    domain = args.domain if args.domain else str(task.get("domain", "general"))
    orchestrator = pick_orchestrator_model(args)
    workers = pick_worker_models(
        orchestrator=orchestrator,
        worker_count=args.workers,
        refresh=args.refresh,
        domain=domain,
    )
    if not workers:
        print("No worker models available.")
        return 1

    task["status"] = "running"
    task["updated_at"] = now_iso()
    task.setdefault("run_history", [])
    write_tasks(tasks)

    append_event(
        "task.run.start",
        {
            "id": task["id"],
            "domain": domain,
            "orchestrator": orchestrator,
            "workers": workers,
            "worker_rounds": 1,
            "max_loops": args.max_loops,
        },
    )
    print(f"Running task #{task['id']} with orchestrator {orchestrator}")
    print(f"Domain: {domain}")
    print(f"Workers: {', '.join(workers)}")
    worker_specs = []
    for model in workers:
        specialist = specialist_profile(model)
        spec = {
            "model": model,
            "role": specialist.get("role", "General Specialist"),
            "style": specialist.get("style", "Clear, practical, and direct"),
            "objective": worker_objective(
                role=specialist.get("role", "General Specialist"),
                domain=domain,
            ),
        }
        worker_specs.append(spec)
        print(f"  - {spec['model']} -> {spec['role']} | {spec['style']}")

    task_prompt = task["description"]
    start = time.monotonic()

    def worker_job(spec: dict[str, str]) -> tuple[str, str, float]:
        model = spec["model"]
        started = time.monotonic()
        worker_prompt = (
            f"You are the {spec['role']}.\n"
            f"Operating style: {spec['style']}.\n"
            f"Immediate objective: {spec['objective']}\n"
            "Use loop-recall thinking internally to stay on objective.\n"
            "Return a concise, actionable answer.\n\n"
            f"TASK:\n{task_prompt}\n"
        )
        output = run_model_text(
            model=model,
            prompt=worker_prompt,
            timeout_seconds=args.timeout_seconds,
            variant=preferred_variant_for_model(model),
        )
        elapsed_ms = (time.monotonic() - started) * 1000.0
        return model, output.strip(), elapsed_ms

    worker_results: list[tuple[str, str, float]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(workers)) as pool:
        futures = {pool.submit(worker_job, spec): spec for spec in worker_specs}
        for fut in concurrent.futures.as_completed(futures):
            spec = futures[fut]
            model = spec["model"]
            role = spec["role"]
            try:
                model, output, latency_ms = fut.result()
            except Exception as exc:  # noqa: BLE001
                output = f"[WORKER_ERROR] {model}: {exc}"
                latency_ms = 0.0
            worker_results.append((model, output, latency_ms))
            append_event(
                "task.run.worker.result",
                {
                    "id": task["id"],
                    "domain": domain,
                    "model": model,
                    "role": role,
                    "chars": len(output),
                    "latency_ms": round(latency_ms, 2),
                },
            )

    ordered = sorted(worker_results, key=lambda x: workers.index(x[0]))
    viable = [item for item in ordered if not item[1].startswith("[WORKER_ERROR]")]
    if not viable:
        task["updated_at"] = now_iso()
        task["status"] = "needs_review"
        task["result"] = "All workers failed. Check logs and retry with different model selection."
        task["domain"] = domain
        task["run_history"].append(
            {
                "run_at": now_iso(),
                "domain": domain,
                "orchestrator": orchestrator,
                "workers": workers,
                "worker_specialists": worker_specs,
                "selected_worker_model": None,
                "max_loops": args.max_loops,
                "worker_rounds": 1,
                "loop_records": [],
                "outcome": task["status"],
                "reason": "all_workers_failed",
            }
        )
        write_tasks(tasks)
        append_event(
            "task.run.finish",
            {
                "id": task["id"],
                "domain": domain,
                "status": task["status"],
                "reason": "all_workers_failed",
                "loops": 0,
                "worker_rounds": 1,
                "selected_worker_model": None,
                "result_chars": len(task["result"]),
            },
        )
        print(f"Task #{task['id']} finished with status: {task['status']}")
        print("\nResult:\n")
        print(task["result"])
        return 1

    numbered_candidates = "\n\n".join(
        f"[{i + 1}] model={model}\n{output}" for i, (model, output, _latency_ms) in enumerate(ordered)
    )
    judge_prompt = (
        "You are the orchestrator judge.\n"
        "Choose the strongest candidate answer for the task.\n"
        "Return exactly:\n"
        "BEST:<number>\n"
        "FINAL:\n"
        "<best answer text>\n\n"
        f"TASK:\n{task_prompt}\n\n"
        f"CANDIDATES:\n{numbered_candidates}\n"
    )
    try:
        judge_output = run_model_text(
            model=orchestrator,
            prompt=judge_prompt,
            timeout_seconds=args.timeout_seconds,
            variant=preferred_variant_for_model(orchestrator),
        )
        best_idx = parse_best_index(judge_output, len(ordered))
        selected_model = ordered[best_idx - 1][0]
        candidate = ordered[best_idx - 1][1]
    except Exception as exc:  # noqa: BLE001
        selected_model = viable[0][0]
        candidate = viable[0][1]
        append_event(
            "task.run.judge.error",
            {"id": task["id"], "domain": domain, "error": str(exc), "fallback_model": selected_model},
        )

    loop_records: list[dict[str, Any]] = []
    passed = False
    final_reason = "max_loops_reached"

    for loop in range(1, args.max_loops + 1):
        elapsed = int(time.monotonic() - start)

        validator_prompt = (
            "You are a strict validator.\n"
            "Given TASK and CANDIDATE, decide if candidate fully satisfies task.\n"
            "Return exactly one line:\n"
            "- PASS\n"
            "- FAIL: <short reason>\n\n"
            f"TASK:\n{task_prompt}\n\n"
            f"CANDIDATE:\n{candidate}\n"
        )
        try:
            verdict_text = run_model_text(
                model=orchestrator,
                prompt=validator_prompt,
                timeout_seconds=args.timeout_seconds,
                variant=preferred_variant_for_model(orchestrator),
            )
        except Exception as exc:  # noqa: BLE001
            loop_records.append(
                {
                    "loop": loop,
                    "verdict": "FAIL",
                    "reason": f"validator_error: {exc}",
                    "elapsed_seconds": elapsed,
                }
            )
            final_reason = "validator_error"
            break
        is_pass, reason = parse_verdict(verdict_text)
        loop_records.append(
            {
                "loop": loop,
                "verdict": "PASS" if is_pass else "FAIL",
                "reason": reason,
                "elapsed_seconds": elapsed,
            }
        )
        append_event(
            "task.run.loop",
            {
                "id": task["id"],
                "loop": loop,
                "verdict": "PASS" if is_pass else "FAIL",
                "reason": reason,
                "elapsed_seconds": elapsed,
            },
        )

        if is_pass:
            passed = True
            final_reason = "validated"
            break

        repair_prompt = (
            "You are a repair agent.\n"
            "Revise CANDIDATE so it passes the TASK.\n"
            "Output only the revised final answer.\n\n"
            f"TASK:\n{task_prompt}\n\n"
            f"FAIL_REASON:\n{reason}\n\n"
            f"CANDIDATE:\n{candidate}\n"
        )
        try:
            candidate = run_model_text(
                model=orchestrator,
                prompt=repair_prompt,
                timeout_seconds=args.timeout_seconds,
                variant=preferred_variant_for_model(orchestrator),
            ).strip()
        except Exception as exc:  # noqa: BLE001
            final_reason = f"repair_error: {exc}"
            break

    task["updated_at"] = now_iso()
    task["result"] = candidate
    task["status"] = "done" if passed else "needs_review"
    task["domain"] = domain
    task["run_history"].append(
        {
            "run_at": now_iso(),
            "domain": domain,
            "orchestrator": orchestrator,
            "workers": workers,
            "worker_specialists": worker_specs,
            "selected_worker_model": selected_model,
            "max_loops": args.max_loops,
            "worker_rounds": 1,
            "loop_records": loop_records,
            "outcome": task["status"],
            "reason": final_reason,
        }
    )
    write_tasks(tasks)

    append_event(
        "task.run.finish",
        {
            "id": task["id"],
            "domain": domain,
            "status": task["status"],
            "reason": final_reason,
            "loops": len(loop_records),
            "worker_rounds": 1,
            "selected_worker_model": selected_model,
            "result_chars": len(candidate),
        },
    )

    for model, output, latency_ms in ordered:
        update_worker_stats(
            model=model,
            domain=domain,
            latency_ms=latency_ms,
            output_chars=len(output),
            selected=(model == selected_model),
            final_pass=passed,
        )

    print(f"Task #{task['id']} finished with status: {task['status']}")
    print("\nResult:\n")
    print(candidate)
    return 0


def do_launch(args: argparse.Namespace) -> int:
    opencode_exe = resolve_opencode_executable()
    cmd = [opencode_exe]

    mode = args.mode
    if mode == "auto":
        mode = read_state().get("launch_mode", "orchestrated")

    if mode == "orchestrated":
        state = read_state()
        model = state.get("current_orchestrator")
        if model:
            cmd.extend(["--model", model])

    cmd.extend(args.openc_args)
    append_event("launch", {"mode": mode, "command": cmd})
    proc = subprocess.run(cmd, check=False)
    return proc.returncode


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="OpenCode supervisor helper.")
    subparsers = parser.add_subparsers(dest="command")

    orch = subparsers.add_parser("orchestrator", help="Manage orchestrator model.")
    orch.add_argument(
        "action",
        nargs="?",
        default="list",
        choices=["list", "current", "set", "refresh"],
        help="Action to run.",
    )
    orch.add_argument("model", nargs="?", help="Model id for set.")
    orch.add_argument("--raw", action="store_true", help="For current: print only model id.")
    orch.add_argument("--refresh", action="store_true", help="Refresh model cache first.")

    mode = subparsers.add_parser("mode", help="Manage default launch mode.")
    mode.add_argument(
        "action",
        nargs="?",
        default="current",
        choices=["current", "set"],
    )
    mode.add_argument("mode", nargs="?", choices=["orchestrated", "vanilla"])
    mode.add_argument("--raw", action="store_true", help="For current: print only mode.")

    models = subparsers.add_parser("models", help="Model capability map and learned stats.")
    models.add_argument(
        "action",
        nargs="?",
        default="report",
        choices=["report"],
    )
    models.add_argument("--out", help="Output markdown path (default notes/model-capability-map.md)")
    models.add_argument("--refresh", action="store_true", help="Refresh model cache first.")

    task = subparsers.add_parser("task", help="Task board and orchestration loop.")
    task_sub = task.add_subparsers(dest="task_action")

    task_add = task_sub.add_parser("add", help="Add task")
    task_add.add_argument("description", help="Task description")
    task_add.add_argument("--title", help="Optional short title")
    task_add.add_argument(
        "--domain",
        default="general",
        help="Task domain label used for model learning (default: general)",
    )

    task_list = task_sub.add_parser("list", help="List tasks")
    task_list.add_argument("--status", choices=["todo", "running", "done", "needs_review"])

    task_show = task_sub.add_parser("show", help="Show task detail")
    task_show.add_argument("id", type=int)

    task_run = task_sub.add_parser("run", help="Run task through worker + repair loop")
    task_run.add_argument("id", type=int)
    task_run.add_argument("--model", help="Override orchestrator model")
    task_run.add_argument("--workers", type=int, default=DEFAULT_WORKER_COUNT)
    task_run.add_argument("--max-loops", type=int, default=DEFAULT_MAX_LOOPS)
    task_run.add_argument("--timeout-seconds", type=int, default=600)
    task_run.add_argument("--domain", help="Override task domain for this run")
    task_run.add_argument("--refresh", action="store_true")

    summon = subparsers.add_parser("summon", help="Summon a team of agents from pool.")
    summon.add_argument("count", type=int, help="Number of agents to summon")
    summon.add_argument("agent_type", help="Agent type (reviewer/coder/strategist/synthesizer/speed/general)")
    summon.add_argument("--name", help="Optional team name")
    summon.add_argument("--goal", help="Optional team goal")
    summon.add_argument("--cross-talk", action="store_true", help="Enable cross-talk for this team")
    summon.add_argument("--refresh", action="store_true", help="Refresh model inventory first")

    assign = subparsers.add_parser("assign", help="Assign role/task/style to team members.")
    assign.add_argument("target", help="all | <member_id> | <team_id>:all | <team_id>:<member_id>")
    assign.add_argument("--role", help="Role text")
    assign.add_argument("--task", help="Task text")
    assign.add_argument("--style", help="Style text")

    dispatch = subparsers.add_parser("dispatch", help="Dispatch a team and synthesize results.")
    dispatch.add_argument("target", nargs="?", help="Team id (defaults to current team)")
    dispatch.add_argument("--model", help="Override orchestrator model for synthesis")
    dispatch.add_argument("--timeout-seconds", type=int, default=600, help="Per-call timeout")
    dispatch.add_argument("--member-loops", type=int, default=5, help="Loop-recall rounds per member")

    panel = subparsers.add_parser("panel", help="Create a diverse expert panel team.")
    panel.add_argument("topic", help="Panel topic")
    panel.add_argument("--size", type=int, default=4, help="Panel size")
    panel.add_argument("--name", help="Optional panel team name")
    panel.add_argument("--cross-talk", action="store_true", help="Enable cross-talk")
    panel.add_argument("--refresh", action="store_true", help="Refresh model inventory first")

    cross_talk = subparsers.add_parser("cross-talk", help="Toggle cross-talk for current or specific team.")
    cross_talk.add_argument("setting", choices=["on", "off"], help="Cross-talk setting")
    cross_talk.add_argument("target", nargs="?", help="Team id (defaults to current team)")

    director = subparsers.add_parser("director", help="Natural-language orchestration (summon/assign/dispatch).")
    director.add_argument("request", nargs="+", help="Natural-language orchestration request")
    director.add_argument("--plan-only", action="store_true", help="Summon/assign only, skip dispatch")
    director.add_argument("--cross-talk", action="store_true", help="Force cross-talk on")
    director.add_argument("--count", type=int, help="Override agent count")
    director.add_argument("--size", type=int, help="Panel size override")
    director.add_argument("--agent-type", help="Override agent type")
    director.add_argument("--name", help="Team name override")
    director.add_argument("--model", help="Override orchestrator model for dispatch synthesis")
    director.add_argument("--timeout-seconds", type=int, default=600, help="Per-call timeout")
    director.add_argument("--member-loops", type=int, default=5, help="Loop-recall rounds per member")
    director.add_argument("--refresh", action="store_true", help="Refresh model inventory first")

    launch = subparsers.add_parser("launch", help="Launch OpenCode in vanilla or orchestrated mode.")
    launch.add_argument(
        "--mode",
        choices=["auto", "vanilla", "orchestrated"],
        default="auto",
        help="Run plain opencode or include selected orchestrator model.",
    )
    launch.add_argument("openc_args", nargs=argparse.REMAINDER, help="Arguments forwarded to opencode.")

    return parser


def normalize_argv(argv: list[str]) -> list[str]:
    if argv and argv[0] == "/orchestrator":
        return ["orchestrator", *argv[1:]]
    if argv and argv[0] == "/mode":
        return ["mode", *argv[1:]]
    if argv and argv[0] == "/models":
        return ["models", *argv[1:]]
    if argv and argv[0] == "/task":
        return ["task", *argv[1:]]
    if argv and argv[0] == "/summon":
        return ["summon", *argv[1:]]
    if argv and argv[0] == "/assign":
        return ["assign", *argv[1:]]
    if argv and argv[0] == "/dispatch":
        return ["dispatch", *argv[1:]]
    if argv and argv[0] == "/panel":
        return ["panel", *argv[1:]]
    if argv and argv[0] == "/cross-talk":
        return ["cross-talk", *argv[1:]]
    if argv and argv[0] == "/director":
        return ["director", *argv[1:]]
    return argv


def main(argv: list[str] | None = None) -> int:
    argv = normalize_argv(argv if argv is not None else sys.argv[1:])
    parser = build_parser()
    if not argv:
        parser.print_help()
        return 0

    args = parser.parse_args(argv)

    if args.command == "orchestrator":
        if args.action == "list":
            return do_orchestrator_list(args)
        if args.action == "current":
            return do_orchestrator_current(args)
        if args.action == "set":
            return do_orchestrator_set(args)
        if args.action == "refresh":
            return do_orchestrator_refresh(args)
        return 2

    if args.command == "mode":
        if args.action == "current":
            return do_mode_current(args)
        if args.action == "set":
            if not args.mode:
                print("Usage: /mode set <orchestrated|vanilla>")
                return 2
            return do_mode_set(args)
        return 2

    if args.command == "models":
        if args.action == "report":
            return do_models_report(args)
        return 2

    if args.command == "task":
        if args.task_action == "add":
            return do_task_add(args)
        if args.task_action == "list":
            return do_task_list(args)
        if args.task_action == "show":
            return do_task_show(args)
        if args.task_action == "run":
            return do_task_run(args)
        print("Usage: /task <add|list|show|run> ...")
        return 2

    if args.command == "summon":
        return do_summon(args)

    if args.command == "assign":
        return do_assign(args)

    if args.command == "dispatch":
        return do_dispatch(args)

    if args.command == "panel":
        return do_panel(args)

    if args.command == "cross-talk":
        return do_cross_talk(args)

    if args.command == "director":
        return do_director(args)

    if args.command == "launch":
        return do_launch(args)

    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())


