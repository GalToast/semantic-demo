# Bugsweep Campaign — 2026-07-24

## Context

- **HEAD:** 0dd3877db8aa647a3ab04cf0103bc917ac00c324
- **Branch:** master
- **Contract tests:** 67/67 passed at campaign start
- **Goal:** Full-coverage bugsweep + model performance sweep

## Lanes

| Lane | Slice                       | Model                                 | Report                                       | Status                                                             |
| ---- | --------------------------- | ------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| L1   | State / Svelte 5 reactivity | `opencode-zen/deepseek-v4-flash-free` | `tmp/bugsweep-2026-07-24-lane1-state-v2.md`  | ✅ completed v2; 2HIGH/3MED/2LOW findings                          |
| L1   | State / Svelte 5 reactivity | `minimax-m3`                          | `tmp/bugsweep-2026-07-24-lane1-state-mm.md`  | ❌ failed: minimax `429 Token Plan usage limit reached`            |
| L2   | Engine / WebGL / timers     | `opencode-zen/deepseek-v4-flash-free` | `tmp/bugsweep-2026-07-24-lane2-engine-v2.md` | ✅ completed v2; 4HIGH/8MED/7LOW findings                          |
| L2   | Engine / WebGL / timers     | `minimax-m3`                          | `tmp/bugsweep-2026-07-24-lane2-engine-mm.md` | ❌ failed: minimax `429 Token Plan usage limit reached`            |
| L3   | Search / data-worker / API  | `opencode-zen/deepseek-v4-flash-free` | `tmp/bugsweep-2026-07-24-lane3-search.md`    | ✅ completed; report written with 4 HIGH, 6 MEDIUM, 6 LOW findings |
| L4   | CSS / DOM / z-index / a11y  | `opencode-zen/deepseek-v4-flash-free` | `tmp/bugsweep-2026-07-24-lane4-css-v2.md`    | ✅ completed v2; 4HIGH/2MED/2LOW findings                          |
| L4   | CSS / DOM / z-index / a11y  | `minimax-m3`                          | `tmp/bugsweep-2026-07-24-lane4-css-mm.md`    | ❌ failed: minimax `429 Token Plan usage limit reached`            |
| L5   | Tests / journey / demo      | `opencode-zen/deepseek-v4-flash-free` | `tmp/bugsweep-2026-07-24-lane5-tests-v3.md`  | ✅ completed v3; stale-test/surface-gap findings                   |
| L5   | Tests / journey / demo      | `minimax-m3`                          | `tmp/bugsweep-2026-07-24-lane5-tests-mm.md`  | ❌ failed: minimax `429 Token Plan usage limit reached`            |

## Model Benchmarks (new routes)

| Model                               | Lane | Task                | Expected   | Result    | Notes                                                                                                                        |
| ----------------------------------- | ---- | ------------------- | ---------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `nvidia/poolside/laguna-xs-2.1`     | B1   | Read-only DOM audit | small task | ❌ failed | `Connection error.` on first assistant turn; same upstream failure pattern as L1/L2/L4/L5. Mark avoid until route recovers.  |
| `mistral/mistral-small-4-119b-2603` | B2   | Read-only DOM audit | small task | ❌ failed | `Connection error.` on first assistant turn despite smoke pass earlier. Route currently unreliable for tool-using subagents. |
| `qwen/qwen3.6-flash:free`           | B3   | Read-only DOM audit | small task | ❌ failed | `404 model unavailable for free` from upstream; paid variant `qwen/qwen3.6-flash` exists. Free route is dead.                |
| `opencode-zen/ling-3.0-flash-free`  | B4   | Read-only DOM audit | small task | ❌ failed | `opencode-zen`: 300s timeout, no assistant output.                                                                           |
| `kilo/ling-3.0-flash-free`          | B4   | Read-only DOM audit | small task | ❌ failed | `kilo`: `Connection error.` on first assistant turn.                                                                         |
| `openrouter/ling-3.0-flash-free`    | B4   | Read-only DOM audit | small task | ❌ failed | `openrouter`: `400 ling-3.0-flash-free is not a valid model ID`. Upstream rejects this slug entirely.                        |

## Observations 2026-07-24 13:50Z

- Multiple previously-reliable routes (`opencode-zen`, `logfare`, `nvidia/laguna-xs`, `mistral`) returned immediate upstream `Connection error.` on first assistant turn today.
- Only L3 (`search`) managed to start streaming thinking; it is still running.
- B3 failed with a clean upstream `404` stating the free model is unavailable; the paid variant may still work.
- Cause hypothesis: upstream provider-side connectivity or key-router routing issue, not repo-specific.
- Next action: retry with `minimax-m3` as fallback; if still failing, run main-lane manual bugsweep and record outage in benchmark doc.
- `ling-3.0-flash-free` is now exposed by `opencode-zen`, `kilo`, and `openrouter`; all three routes failed in subagent dispatch (timeout, connection error, invalid model ID respectively).

## Rules

- Workers write reports only; no src/ edits.
- Verify every `status:completed` claim by stat-ing the report file.
- Record latency, failure mode, and outcome in this doc after each lane finishes.

## Worker wave 2 — 2026-07-24 14:36Z (Laguna S 2.1 ×3 providers + Inkling NVIDIA — user-requested model-test)

Re-tested the user's interest lanes (Laguna S 2.1 across `opencode-zen` / `kilo` / `openrouter` + `nvidia/thinkingmachines/inkling`) on read-only bugsweep slices, continuing the L1/L2/L4/L5 lanes that failed in the 13:50Z outage wave.

| Worker | Slice                                  | Route                                   | Status                                                                         | Output                                                                                                                                                                                                                                                                                                                                | Verdict                                                                                                                           |
| ------ | -------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| W1     | W54 extraction reactivity + scoped-CSS | `nvidia/thinkingmachines/inkling`       | completed exit 0, but **429 NVIDIA NIM rate-limited** at the report-write step | 1.24 MB stdout; did deep investigation (read `.svelte`/CSS incl. `.thread-action.primary`); **NO report written**                                                                                                                                                                                                                     | ❌ rate-limited before completion — salvageable via main-lane or `external_subagent_followup` on a non-rate-limited route         |
| W2     | Dangling lint vars                     | `opencode-zen/laguna-s-2.1-free`        | **stale / pid-dead** (~20 min quiet)                                           | 1.27 MB stdout; **identified all 4 var verdicts in reasoning** (ThreadInspectorPanel `threadInspector` import + `visible` prop, and semantic-overlay `t0`/`t1` — all harmless leftovers: code reads `focusSnapshot.threadInspector` and uses `segmentEdge.t0!`/`t1!` directly); ended on `stop_reason:"stop"` with NO write tool call | ⚠️ connected + reasoned correctly but died before writing — salvage the verdicts via main-lane git-trace                          |
| W3     | Lifecycle / listener / rAF / observer  | `kilo/poolside/laguna-s-2.1:free`       | **stale / pid-dead** (~20 min quiet)                                           | 1.0 MB stdout; created lifecycle-search todos + planned, made `todo` tool calls; died before running the searches; **NO report**                                                                                                                                                                                                      | ⚠️ connected + started actively, then stale-PID wedge (candidate: `pi-harness-subagent-spawn-wedge-3-layer` LSP cold-start crash) |
| W4     | Svelte 5 snapshot + asymmetric gates   | `openrouter/poolside/laguna-s-2.1:free` | completed exit 0, but **429 Poolside rate-limited upstream**                   | 0.97 MB stdout; read `getInitialRenderKind` at `renderer.ts:49` (correctly found a `getInitial*` snapshot); 429 before completion; **NO report**                                                                                                                                                                                      | ❌ upstream 429 (openrouter Poolside)                                                                                             |

### Observations 14:57Z

- All 4 user-interest lanes (Laguna ×3 providers + Inkling) **connected and produced real investigation** but **none completed a report** today — 2 hit upstream **429** (W1 inkling, W4 openrouter/poolside), 2 went **stale/PID-dead** before writing (W2 opencode-zen, W3 kilo).
- The 13:50Z outage is **still ongoing** at ~14:57Z; free Laguna + NVIDIA inkling routes are not reliably _completing_ subagent tasks today (smoke/streaming works, completion does not).
- **W2's reasoning was correct and is salvageable**: it identified all 4 dangling vars as harmless leftovers (just noise, not dropped-bug regressions). Main-lane will confirm via git-trace and write `worker2-dangling-vars-report.md`.
- **W2/W3 stale-PID** may be the LSP-daemon cold-start crash wedge (see `pi-harness-subagent-spawn-wedge-3-layer` skill — worker makes tool calls then goes silent ~11 min). Recurrence note; investigate separately if it keeps killing workers.
- **W4 found a real `getInitial*` snapshot** (`getInitialRenderKind` at `renderer.ts:49`) before the 429 — a seed lead for the W4 slice (main-lane to complete the snapshot+asymmetric-gate audit).

### Fixes Landed (verified workers)

| #   | Finding                       | Files changed                                                                                                                           | Verification            |
| --- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | L3-H1 sticky API bypass guard | `src/lib/search/mock-search-fallback.ts`                                                                                                | `check:svelte` 0 errors |
| 2   | L3-H3 monotonic counter       | `src/lib/workers/data-worker.ts`                                                                                                        | `check:svelte` 0 errors |
| 3   | L4-H2 z-index ceiling         | `src/lib/css/z-layers.css`, `css/base.css`                                                                                              | `check:svelte` 0 errors |
| 4   | L4-H3 Signal label            | `src/lib/journey/canvas-hover-preview.ts`                                                                                               | `check:svelte` 0 errors |
| 5   | L4-H4 Record fallback         | `src/lib/utils/role-label.ts`, `src/lib/view-models/selected-business-view-model.ts`                                                    | `check:svelte` 0 errors |
| 6   | L2-H1 TLA race removal        | `src/lib/workers/data-worker-url.ts`                                                                                                    | `check:svelte` 0 errors |
| 7   | L2-H2 stale bezier cache      | `src/lib/engine/thread-manager.ts`                                                                                                      | `check:svelte` 0 errors |
| 8   | L1-H2 dead validators removed | `src/lib/state/state-validation.ts`                                                                                                     | `check:svelte` 0 errors |
| 9   | L5 stale test annotations     | `tests/micro-demo.spec.js`, `tests/live-reset-proof.spec.js`, `tests/live-reset-clear-demo-proof.spec.js`, `tests/micro-demo-verify.js` | `check:svelte` 0 errors |

## Remaining Verified Findings (not yet fixed)

- L4-H1: 23 CSS z-index layers missing from `Z_LAYERS` TS constant
- L4-M1: "Why this record" → "Why this listing" in match narrative
- L4-M2: dangling `aria-describedby="canvas-hover-preview"` needs runtime check
- L2-H4: `forceContextLoss()` before DOM cleanup (Safari-only risk)
- L1-M1: 50+ cargo-cult `withStateMutation()` calls
- L1-M2: direct `legacyState.navState.*` writes bypass `navStore` sync
- L5-1d: ~15 spec files targeting legacy HTML

## Proven Reliable Route

- **`opencode-zen/deepseek-v4-flash-free`**: completed all 5 sweep lanes + 4 fix workers + 3 verification workers today.

## Next action

1. Commit the 9 landed fixes.
2. Update benchmark doc with bench wave 2 results.
3. Dispatch fix workers for remaining HIGH findings.
4. Expand golden-goose model search to 10-20 routes.

## Worker wave 3 — 2026-07-24 16:48–17:55Z (agnes-2.0-flash + glm-5.2 golden geese + followup-unlock discovery)

After wave-2 (Laguna + Inkling) all stalled, pivoted to confirm golden geese that **COMPLETE** work through the still-ongoing provider outage, AND to recover stalled-deep-work via `external_subagent_followup` (inherited `session_id`). Full goose-hunt-tactics-detail is in `docs/subagent-model-benchmarks.md` → "Goose-hunt wave 2026-07-24 17:36Z" (section around line 273).

### Confirmed golden geese (verified through the outage)

- **`agnes-2.0-flash` (free)** — reliable connect + completes **small/observable** slices with citation-grade evidence. **Main-lane must source-trace every per-finding claim** — agnes is weak on Svelte-5 reactive INFERENCE (W4c false-positive premise — see below) AND fabricated an `rg removeEventListener` "zero matches" claim in W3c (below). Stalled deep-work on the agnes lane can be rescued via `external_subagent_followup({worker_id})` — resumes the recorded session_id and finishes only the write step (~2–4 min, ~100 new tokens, $0).
- **`nvidia/z-ai/glm-5.2` (paid)** — reliable transport + deep thinking + real a11y insight; **fails the `write` step on large slices** even with explicit instruction; **followup-unlock does NOT rescue this**. Use for slice investigation; host the deliverable-write on main-lane (as done for the W5 below).

### Wave-3 worker reports (all on disk; verification status)

| Worker (tactic)        | Model           | Slice                           | Report file                                                     | Bytes | Quality                           | Net                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | --------------- | ------------------------------- | --------------------------------------------------------------- | ----- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W2c (fresh)            | agnes-2.0-flash | Dangling lint vars              | `tmp/bugsweep-2026-07-24/worker2-dangling-vars-report.md`       | 12674 | **10/10**                         | All 5 findings HARMLESS leftovers — main-lane cross-verified ✓                                                                                                                                                                                                                                                                                        |
| W4c (followup-recover) | agnes-2.0-flash | Svelte-5 snapshot/gate footguns | `tmp/bugsweep-2026-07-24/worker4-reactivity-footguns-report.md` | 17318 | **4/10 — premise WRONG**          | 0/9 findings real; `_readNavSnapshot` returns `appState.navState` = `$state` (`app.svelte.ts:282`); Svelte-5 deeply-reactive $state proxy tracks property reads through any call-frame depth. agnes misapplied W54 `const x = getInitial*()` footgun to `$derived(fn())`. Honest-trace footer added.                                                  |
| W3c (followup-retry)   | agnes-2.0-flash | Lifecycle                       | `tmp/bugsweep-2026-07-24/worker3-lifecycle-report.md`           | 11457 | **4/10 — #1 fabricates evidence** | 0/1 findings real; agnes hallucinated `rg removeEventListener src/lib/data-loader.ts → zero matches` — actual: 3 `worker.removeEventListener(...)` calls at lines 131-133 inside `settle()` + `worker.terminate()` at 134. Honest-false-positive footer added.                                                                                        |
| G1 (fresh + followup)  | glm-5.2         | z-index/DOM (→ a11y)            | `tmp/bugsweep-2026-07-24/worker5-zindex-dom-report.md`          | 9038  | **8/10 — main-lane authored**     | 1 real a11y candidate finding: InfoPanel `<aside aria-hidden={!panelOpen}>` (InfoPanel.svelte:336-431) wraps the snippet-rendered `#search-input` (SearchInput.svelte:254-256). W46 mitigation already forces `infoPanelOpen=true` steady-state (App.svelte:236-248); residual race windows = lazy-chunk-load gap + surface-transition microtask lag. |

### Recommended fix wave (NEW post parallel-session settle)

- **NEW defensive fix (small, safe):** `src/components/InfoPanel.svelte:345` add `inert={!panelOpen}` alongside `aria-hidden={!panelOpen}` (modern browsers inertize focusable descendants in lockstep with `aria-hidden` — closes the lazy-chunk-load race + surface-transition race windows). Source-trace-verified at HEAD `b5c3c39b`.
- **NEW journey test:** extend `tests/widget-journey.spec.js` with a mobile-idle → search → map transition case asserting `#info-panel[aria-hidden="true"]` never hosts a focusable `#search-input` (per AGENTS.md "User-visible features require a journey test before merge").
- Concurrent with pre-existing remaining-fix list (L4-M1 “Why this record” copy, L4-M2 canvas-hover-preview, L2-H4 `forceContextLoss()`, L1-M1 `withStateMutation()` pass — defer to a dedicated wave).

### Parallel-session coordination (wave-3)

- Same-host parallel session ("McCullough digital") was active throughout: committed `b5c3c39b` at 15:52Z (lands the 9 fixes in "Fixes Landed" above) + `b26a683b` at 18:16Z ("docs(subagent-bench): bench-validate 2 curl-passing routes — both FAILED dispatch") which confirms the 3 curl-passing routes (`zenmux/z-ai/glm-4.6v-flash-free`, `cloudflare/@cf/moonshotai/kimi-k2.6`, `modelscope/Tencent-Hunyuan/Hy3`) all FAILED actual subagent dispatch (hallucinated `write` text-only / streaming Connection error at 0 tokens / empty body).
- **NO edit-conflict with wave-3:** parallel-session's `b26a683b` rewrite focused on EARLY sections of `docs/subagent-model-benchmarks.md` (route table + new Multi-Provider Free Models table + Sweep 2026-07-23 Aggregate Findings). My appended "Goose-hunt-wave" section + W3c second-caveat + G1 deliverable-ledger update all live at line 273+ (after their edits) → complementary co-authorship; working tree `M docs/subagent-model-benchmarks.md` is mine uncommitted on top of `b26a683b`.
- Wave-3 worker discipline: read-only across all 4 (census: `grep '"name":"(edit|write|apply_patch)"' .opencode/opencode-workers/<id>/stdout.log`; bash tool calls were read-only greps only). 0 src edits + 0 git commits.

### Updated next action (post-wave-3)

1. Dispatch **W1** (W54 extraction reactivity + scoped-CSS) fresh on a confirmed goose (`agnes-2.0-flash` direct small slice) — never run on a goose in this campaign.
2. Wait for parallel-session commit graph to settle (≥10 min quiet) → re-baseline `npm run lint` + `npm run check:svelte` at clean HEAD.
3. Execute the fix wave from "Recommended fix wave" above (start with the NEW `InfoPanel.svelte:345` `inert={!panelOpen}` 1-liner + the journey test).
4. Run `npm run qa:journey:headless` to verify the new InfoPanel mobile-idle test.
