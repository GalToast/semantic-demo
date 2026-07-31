# Subagent Lane Probe — 2026-07-31

Live health probe of every `logfare` model + `nvidia/z-ai/glm-5.2` + `zydit/z-ai/glm-5.2` (the lanes AGENTS.md `docs/subagent-lane-inventory.md` + `docs/subagent-models.md` cite as healthy free fallbacks). Performed by the main orchestrator session on 2026-07-31 ~19:55–20:15 local. Recorded fresh because `subagent-lane-inventory.md` and `subagent-models.md` were both dirty with another session's W58 (2026-07-30) graduation batches — this file is additive; the lane docs should fold these caveats in when their WIP settles.

## TL;DR — headline today

- **logflare is too volatile for reliable subagent dispatch.** Per-model 401/429 limits bite *under load*, not just on the known list. Even `deepseek-v4-pro` — the doc's "Reliable workhorse" — 429'd immediately on a real subagent prompt (it was healthy ~3.6 s on a 20-token probe minutes earlier). Do not treat any logflare model as a dependable subagent lane today.
- **`nvidia/z-ai/glm-5.2` is the STABLE healthy free lane** — but only for **bounded multi-file FIX tasks**, not for open-ended read-only audits (see harness caveat below).
- **zenmux deepseek-free is balance-gated** — `deepseek/deepseek-v4-flash-free` returns HTTP 402 `reject_no_credit` (must hold balance > 0, "an anti-abuse measure, not a usage charge"). The key-router FAILOVER_CHAINS.deepseek silently failovers that 402 → `nvidia/deepseek-ai/deepseek-v4-pro` (proven via `nvcf-reqid`/`nvcf-status` response headers). The "no thinking" symptom a consumer saw was the silent pro failover, not the free model.
- **`opencode-zen/deepseek-v4-flash-free` is the WORKING free deepseek path** — verified streams `reasoning_content` (121 thinking deltas, 27 blocks, `usage.reasoning=121`) under the lane's `extra_body` `{reasoning_effort:max, include_reasoning:true, reasoning_split:true, thinking:{type:adaptive}, enable_thinking:true}`.
- **`freeinference/deepseek-v4-flash` is self-hosted SGLang** — `owned_by:"sglang"`, own pricing (not a DeepSeek upstream proxy). Streams `delta.content` only; **no separate `reasoning_content`/reasoning stream** — thinking is internal and surfaced inline in content. By design (already documented in `model-providers.json` metadataNotes 2026-06-23).

## LOGFARE health matrix (2026-07-31)

Probe path: `http://127.0.0.1:8788/logfare/v1` (key-router logfare lane). Router `free_models` reports all 10 models accessible + free. Reality under live probes:

| Model (logfare/...) | Non-stream (20 tok) | Streaming (100s cap) | Verdict |
|---|---|---|---|
| `deepseek-v4-pro` | ✅ 3.6 s | ✅ 3.6 s completion | HEALTHY on light probes **but 429'd immediately on the real subagent prompt** → VOLATILE-under-load |
| `minimax-m3` | (timeout @40 s) | ✅ 57 s, reasoning_tokens present | HEALTHY but slow |
| `qwen-3.6-35b-a3b` | ✅ 36 s "OK" | — | HEALTHY but slow |
| `glm-5.2` | ✅ 2.6 s | ❌ 2.6 s **429** Service temporarily unavailable | RATE-LIMITED |
| `deepseek-v4-flash` | ❌ 3.3 s **429** | — | RATE-LIMITED |
| `kiro-auto` | ❌ 3.5 s **429** | — | RATE-LIMITED |
| `kimi-k2.7-code` | ❌ 38 s **429** | — | RATE-LIMITED |
| `kimi-k3` | ❌ 39 s **429** | — | RATE-LIMITED |
| `qwen-3.8-max` | ❌ mid-stream error | — | BROKEN |
| `kimi-k2.6` | (timeout @40 s) | ❌ 100 s hung, no output | HUNG |

**Net:** 3 of 10 reliably responded on *light* probes; ALL of them degrade to 429 under real subagent prompts. logflare's per-model limits fluctuate minute to minute and trip on heavier completions, so a healthy probe is not a dispatchable guarantee.

## Harness caveat — `nvidia/z-ai/glm-5.2` + `--thinking max` + bounded read-only audit = timeout

Two read-only audit subagents on `nvidia/z-ai/glm-5.2` both timed out at 360 s (`exit_code: 124`), each emitting **115 MB / 151 MB** of reasoning with **zero tool calls** (`tool_calls: []`): they thought endlessly about the audit and never ran a `read`/`git diff`/`write`. The harness launch args confirm `--thinking max` is forced for substantive subagents.

- glm-5.2's reasoning was genuinely good (it caught *"logfare/glm-5.2 - main lane via router-logfare ... INACCURATE — currently rate-limited, should redirect to nvidia"* and correctly reasoned the zenmux 402 failover) — it just never converged + acted within budget.
- **Recommendation for glm-5.2 subagent dispatch:** keep scope to **bounded multi-file FIX/patch tasks** with explicit deliverables + a tight tool-cadence expectation; for open-ended read-only audits prefer a non-`--thinking max` lane, or split the audit into per-file one-shot prompts with ≤2 files each. The bugsweep-bake-off note in `subagent-lane-inventory.md` already warns *"glm-5.2 over-reasons to death on >2-file scopes so keep its scope tight + timeout ≤600s"* — 2026-07-31 confirms it at 360 s too.

## ZENMUX deepseek-free balance gate (2026-07-31)

Direct probe `https://zenmux.ai/api/v1` with `deepseek/deepseek-v4-flash-free`:

```json
{"error":{"code":"402","type":"reject_no_credit","message":"Access denied: this model is only available to accounts with a balance greater than 0. This is an anti-abuse measure, not a usage charge."}}
```

This account holds $0 → the model is unreachable. `402` is in the key-router failover-status list, so `FAILOVER_CHAINS.deepseek` silently substitutes `nvidia/deepseek-ai/deepseek-v4-pro`. Consumers see pro behavior (no free-model thinking semantics) without being told they failovered. Surfacing `X-Router-Failover-Applied` to the TUI is the proposed transparency fix (open — main orchestrator).

NOTE: `zenmux/z-ai/glm-4.7-flash-free` (still listed ✅ in `subagent-models.md`) may be a *different* zenmux free model that does not trip this 402 — not re-probed today. The blanket "zenmux free tier" viability should still carry the deepseek-402 caveat.

## Recommended lane-doc corrections (for the owning sessions to fold in)

1. `subagent-models.md` "Primary": `logfare/glm-5.2 - main lane via router-logfare` is **no longer reliable** — redirect primary to `nvidia/z-ai/glm-5.2` (stable healthy free for bounded FIX).
2. `subagent-lane-inventory.md` "Strong free/shadow routes" `deepseek-v4-pro | router-logfare` row: relabel from "Reliable workhorse" to "VOLATILE — 429 under subagent load, dispatchable only when logflare caps are open."
3. Both docs: add a `zenmux deepseek-v4-flash-free` 402 balance-gate warning next to the glm-4.7 viability note, and document the silent 402 → nvidia pro failover.
4. Both docs: add the `glm-5.2 + --thinking max + open-ended read-only audit = timeout (115–151 MB reasoning, 0 tool calls, exit 124)` harness caveat for bounded-scope dispatch.

## Delegation-reality note

The main orchestrator ran three external_subagent workers today (campaign `w67-w68-cleanup`, owner `orchestrator`) to audit the lane docs + substantive uncommitted fixes:

- `ocw_15756787` `logfare/deepseek-v4-pro` → **429'd immediately**, auto-retries exhausted. (Confirms logflare is not dispatchable under load — see matrix.)
- `ocw_3da0416a` `nvidia/z-ai/glm-5.2` (substantive-fix audit) → **timeout exit 124**, 114 MB reasoning, never wrote report.
- `ocw_eaf5f1c0` `nvidia/z-ai/glm-5.2` (lane-doc audit v2) → **timeout exit 124**, 151 MB reasoning, never wrote report.

The main lane took over both audits (it was the ground-truth source for the probes) — verdicts live in chat + this file. All three workers are terminal and swept.
