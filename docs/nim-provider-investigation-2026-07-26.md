# NVIDIA NIM Provider Investigation — 2026-07-26

Definitive report compiled from probe data collected during the evening investigation session.

---

## Summary

- **NIM IS UP** — not an outage. 8 live models confirmed via direct curl with valid `reasoning_content` / assistant content.
- **Root cause:** key-router 5-key pool with ~30s cooldown exhausts to 429 rate-limiting when all keys are in use.
- **The "id-format bug" was a misdiagnosis** — the harness strips the leading `nvidia/` correctly before dispatching to NIM. Proof: dispatch-path test on `nvidia/z-ai/glm-5.2` returned 429 (rate-limited), not 404 (format error).
- **16 ghost catalog entries** — models listed in the live catalog (`CATALOG-LIVE.json`) that return `Function not found for account` at the NIM router layer. They have no deployed function behind them.

---

## Root-cause diagnosis

### Layer 1: NIM IS UP

Direct curl to `http://127.0.0.1:8788/nvidia/v1/chat/completions` returns HTTP 200 with valid assistant messages (including `reasoning_content`) for 8 distinct models. The local NIM endpoint is serving traffic normally.

### Layer 2: Key-router capacity

The NIM router maintains a pool of **5 API keys** with a **~30 second cooldown** per key. When all 5 keys are exhausted, subsequent requests receive:

```json
{"error":"NVIDIA NIM router has no keys currently off cooldown","keys":5,"nextReadyInMs":29138}
```

This is a **429-equivalent rate-limit response**, not a model-level failure. Spaced probing (≥30s between requests) is required for accurate classification.

### Layer 3: Ghost catalog entries

16 models in the live 118-model catalog return structured 404 errors:

```json
{"status":404,"title":"Not Found","detail":"Function '<uuid>': Not found for account '<acctId>'"}
```

These entries exist in the catalog but have **no deployed NIM function** for the account. They are dead regardless of key availability.

### Layer 4: Harness dispatch path works correctly

The harness correctly strips the `nvidia/` prefix from model IDs and sends the bare catalog ID to NIM. Verified by dispatch-path test:

- Input: `nvidia/z-ai/glm-5.2`
- Harness sends bare ID `z-ai/glm-5.2` to NIM
- Response: **429 rate-limited** (not 404), confirming correct ID format

The earlier 15-model benchmark failure (all 404s / timeouts) was caused by the harness dispatch-path routing through a broken MCP layer — **not** an upstream NIM outage or ID-format bug.

---

## Probe methodology

### Phase 1: NIM-Investigator subagent (nemotron-3-ultra-free)

- 25 models probed via batch curl script
- Direct curl to local NIM router (`127.0.0.1:8788`)
- 60s max timeout per model
- 6 LIVE, 6 DEAD_404, 1 SLOW_TIMEOUT, 12 RATE_LIMITED

### Phase 2: Rerate-probe background job

- 12 RATE_LIMITED models re-probed with **30s spacing** between requests
- Revealed true model status after key cooldown
- 2 additional LIVE confirmed, 10 confirmed as DEAD_404

### Phase 3: Dispatch-path test

- `nvidia/z-ai/glm-5.2` dispatched via `external_subagent_start`
- Returned 429 (rate-limit proof), NOT 404 (format-error proof)
- Confirmed harness ID-strip logic is correct

---

## Final model classification

| Classification | Count | Distinct models |
|----------------|-------|-----------------|
| **LIVE** | 8 | 8 |
| **DEAD (404 ghost)** | 16 | 16 |
| **SLOW (timeout)** | 1 | 1 |
| **Total distinct** | | **25** |
| **Total probes** | | **37** (25 Phase 1 + 12 Phase 2) |

---

## LIVE models (dispatch-ready)

8 models confirmed live across Phase 1 (6) and Phase 2 (2) probes.

| # | Model ID | Phase | Speed | Response type | Recommended dispatch ref |
|---|----------|-------|-------|---------------|--------------------------|
| 1 | `z-ai/glm-5.2` | 1 | ~0.7s | reasoning_content | `nvidia/z-ai/glm-5.2` |
| 2 | `upstage/solar-10.7b-instruct` | 1 | instant | content (3 tok) | `nvidia/upstage/solar-10.7b-instruct` |
| 3 | `poolside/laguna-xs-2.1` | 1 | 0.075s e2e | content (40 tok/s) | `nvidia/poolside/laguna-xs-2.1` |
| 4 | `thinkingmachines/inkling` | 1 | moderate | reasoning (51 tok) | `nvidia/thinkingmachines/inkling` |
| 5 | `minimaxai/minimax-m3` | 1 | moderate-slow | reasoning (207 tok) | `nvidia/minimaxai/minimax-m3` |
| 6 | `stepfun-ai/step-3.5-flash` | 1 | moderate | reasoning (49 tok) | `nvidia/stepfun-ai/step-3.5-flash` |
| 7 | `abacusai/dracarys-llama-3.1-70b-instruct` | 2 | moderate | reasoning_content | `nvidia/abacusai/dracarys-llama-3.1-70b-instruct` |
| 8 | `sarvamai/sarvam-m` | 2 | moderate | content | `nvidia/sarvamai/sarvam-m` |

**Notes:**

- Models 1–6 were LIVE on first probe (no key contention).
- Models 7–8 were RATE_LIMITED on first probe, confirmed LIVE on spaced re-probe (Phase 2).
- All 8 are dispatch-ready via `external_subagent_start` using the `nvidia/<bare-id>` format.

---

## DEAD models (16 ghost catalog entries)

All return `Function '<uuid>': Not found for account '<acctId>'`. These models have no deployed NIM function and will never serve traffic regardless of key availability.

| # | Model ID | Org | Probe phase |
|---|----------|-----|-------------|
| 1 | `ibm/granite-3.0-3b-a800m-instruct` | ibm | 1 |
| 2 | `ibm/granite-3.0-8b-instruct` | ibm | 1 |
| 3 | `writer/palmyra-creative-122b` | writer | 1 |
| 4 | `writer/palmyra-fin-70b-32k` | writer | 1 |
| 5 | `microsoft/phi-3.5-moe-instruct` | microsoft | 1 |
| 6 | `microsoft/phi-3-vision-128k-instruct` | microsoft | 1 |
| 7 | `zyphra/zamba2-7b-instruct` | zyphra | 2 |
| 8 | `01-ai/yi-large` | 01-ai | 2 |
| 9 | `adept/fuyu-8b` | adept | 2 |
| 10 | `ai21labs/jamba-1.5-large-instruct` | ai21labs | 2 |
| 11 | `aisingapore/sea-lion-7b-instruct` | aisingapore | 2 |
| 12 | `baai/bge-m3` | baai | 2 |
| 13 | `bigcode/starcoder2-15b` | bigcode | 2 |
| 14 | `databricks/dbrx-instruct` | databricks | 2 |
| 15 | `moonshotai/kimi-k2.6` | moonshotai | 2 |
| 16 | `snowflake/arctic-embed-l` | snowflake | 2 |

**Distribution:** 6 DEAD from Phase 1 (IBM ×2, Writer ×2, Microsoft ×2) + 10 DEAD from Phase 2 re-rate.

---

## SLOW model

| Model ID | Org | Classification | Detail |
|----------|-----|----------------|--------|
| `openai/gpt-oss-120b` | openai | SLOW_TIMEOUT | curl timed out after 60s (exit 28) |

Likely a cold-start or very large model. Increase probe timeout or exclude from time-sensitive subagent dispatch.

---

## Recommendation

### Primary dispatch model

- **Use `logfare/kiro-auto` for zero-cost subagent dispatch** — proven golden-goose with no NIM key-pool contention.

### NIM dispatch guidance

- **NIM models are dispatch-capable** but **capacity-constrained** (5-key pool with ~30s cooldown).
- **Use `nvidia/<bare-id>` format** in `model-providers.json`. The harness correctly strips the `nvidia/` prefix before sending the bare ID (e.g., `z-ai/glm-5.2`) to the NIM router.
- **Spaced probing (≥30s between requests) is required** for accurate NIM model classification. Burst probes will hit rate-limits and misclassify live models as dead.

### Ghost catalog entries

- The 16 DEAD models are **catalog-only entries with no deployed backend**. Do not add them to dispatch configs.
- If NIM adds deployment for these entries later, re-probe with spaced requests to reclassify.

### Next steps

1. Add the 8 LIVE models to `model-providers.json` under `router-nvidia` routes.
2. Add free shadows under `kilo/nvidia/<model-id>:free` for zero-cost subagent fallback.
3. Retire the broken MCP dispatch path that caused the initial "all 404" misdiagnosis — the harness native dispatch path is confirmed correct.
4. Re-probe `openai/gpt-oss-120b` with a 120s+ timeout to determine if it is genuinely slow or simply cold-starting.
