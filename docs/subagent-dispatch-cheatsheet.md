# Subagent Model Dispatch Cheat Sheet

> Generated 2026-06-29 from `docs/model-benchmark-scorecard.md`

## Quick Decision Tree

```
Need a subagent worker?
│
├─ Coding task (SWE-bench, code generation, refactoring)?
│  ├─ Budget allows → Claude Opus 4.7/4.8 (SWE-bench 83.5%, Code Elo 1557)
│  ├─ Mid-tier → Claude Fable 5 (Code Elo 1654, Text Elo 1508)
│  └─ Free fallback → DeepSeek V4 Flash (only free model with SWE-bench trail)
│
├─ Reasoning / Knowledge (GPQA, HLE, complex instructions)?
│  ├─ Budget allows → GPT-5.4/5.5 Pro (GPQA 94.0–94.6%)
│  ├─ Best HLE → Gemini 3.1 Pro (HLE 46.4%, GPQA 94.1%)
│  └─ Free fallback → Gemini 3.1 Pro Preview (free route available)
│
├─ Quick / Low-stakes (formatting, simple queries, data processing)?
│  ├─ Any tier → MiMo V2.5 (repo default, fast)
│  └─ Free → hy3-free, North Mini Code, or DeepSeek V4 Flash free
│
└─ Domain-specific (image, video, embedding, speech)?
   └─ Not suitable for general subagent work — use primary model instead
```

## Model Rankings by Category

| Category      | Best Paid           | Best Mid        | Best Free              |
| ------------- | ------------------- | --------------- | ---------------------- |
| **Coding**    | Claude Opus 4.7/4.8 | Claude Fable 5  | DeepSeek V4 Flash      |
| **Reasoning** | GPT-5.5 Pro         | Gemini 3.1 Pro  | Gemini 3.1 Pro Preview |
| **Knowledge** | GPT-5.4 Pro         | Gemini 3.1 Pro  | DeepSeek V4 Flash      |
| **Speed**     | MiMo V2.5           | North Mini Code | DeepSeek V4 Flash      |
| **Cost**      | —                   | —               | DeepSeek V4 Flash      |

## Key Benchmarks (Public Data)

| Model               | Text Elo | Code Elo | GPQA        | SWE-bench | HLE   |
| ------------------- | -------- | -------- | ----------- | --------- | ----- |
| Claude Opus 4.7/4.8 | 1494 ±4  | 1557 ±8  | —           | 83.5%     | —     |
| Claude Fable 5      | 1508 ±9  | 1654 ±16 | —           | —         | —     |
| GPT-5.5 Pro         | 1481 ±5  | —        | 94.0%       | 80.6%     | —     |
| GPT-5.4 Pro         | —        | —        | 94.6%       | —         | 44.3% |
| Gemini 3.1 Pro      | 1486 ±4  | —        | 94.1%       | 79.3%     | 46.4% |
| DeepSeek V4 Flash   | —        | —        | Top cluster | —         | —     |

## Routing Notes

- **All models** are accessed through the `openai` provider key in `model-providers.json` (they're routed via OpenAI-compatible endpoints)
- **Free routes** are marked with `free: true` in the config
- **Avoid** `owl-alpha` and `agnes-2.0-flash` for production subagent work (no public benchmark trail, reliability concerns)
- **Free-tier general-investigation pick:** `hy3-free` (bare ref → `opencode-zen/hy3-free`) — new lane, viable alternative to `mimo-v2.5-free` for free-tier workers
- **Embedding/image/video models** in the catalog are not suitable for general-purpose subagent tasks

## File Locations

- Full catalog: `docs/model-benchmark-scorecard.md`
- Leaderboard scores: `docs/ai-model-leaderboard-scores.md`
- Provider config: `tmp/model-providers.json`
- Lane inventory: `docs/subagent-models.md`
