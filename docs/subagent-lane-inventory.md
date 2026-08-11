# Subagent Lane Inventory — Semantic Explorer

> **COMPRESSED HISTORY (2026-08-11):** the 59 dated run-entries below are history; durable lessons → docs/subagent-delegation.md (Landmine classes). The live coordination state is in the un-dated sections.

Moved out of `AGENTS.md` (Prompt Budget: no large reference tables in the hot-path file). `docs/subagent-delegation.md` remains the source for lifecycle/rate/vision rules; this doc is just the live per-model viability table.

Probed 2026-07-27. Updated 2026-08-06 (live catalogue refresh; vision lanes refreshed by 670-probe sweep — see Vision Capability Matrix in `docs/subagent-delegation.md`; evidence `tmp/vision-probe/`). **See also `docs/subagent-models.md`** for the quick-reference version (verified table, conditional/avoid list, and untested backlog).

## Delegation-wave-1 logfare verdict (2026-08-11, main-lane measured)

8 logfare dispatches, deliverables-first. **minimax-m3 + kimi-k3 = the workhorses; deepseek-v4-flash family + qwen-3.6-35b-a3b throttled (429 per-model quotas, NOT concurrency — user confirmed logfare has no concurrent-use cap).** Critical protocol — NEVER trust first-shot exit-0: minimax routinely 'completes' with zero tool calls (17s observed) and kimi-k3 stream-dies at the final write ('Stream ended without finish_reason') after doing the full analysis. The reliable recipe that produced all deliverables: (1) rubric-first prompt with disk-gate; (2) ALWAYS issue a followup on the same session_id (context retained) with an explicit 'the file must exist on disk before you stop' mandate — this converts talkers into doers; (3) for kimi-k3 followups, add 'do NOT re-run analysis, only write' + ask for a compact report to dodge the long-stream death. This matches the earlier deliverable-first skeleton protocol (channel msg 160). Verify deliverables in worker tmp/, never exit codes.

## Delegation-wave-2 logfare addendum (2026-08-11)

Wave-2/main-lane burst on the same protocols: choreo step-1 migration (W2B) landed correctly — engine `cancelChoreography` has ZERO live callers, so canonical `cancelDemo()` is the complete teardown (M15 adjudicated); 1 demarcation note: worker claimed 'equivalent' without proof — main-lane verified, claim held. css-ownership Option-C redesign (W2A) rebuilt the selectorBaselines into min/max ownership model. Wave-3 (main-lane): deleted 3 dead contracts per W2C audit (filter-ownership, legend-ui-ownership, state-mutator noop) + manifest/runner sync. Pattern reinforced: EVERY logfare worker needs the disk-mandate followup; early exits stay the norm.

## Routing preference (session 2026-08-04, user directive)

**Prefer `kilo/*` and `openrouter/*` routes over `opencode-zen/*`** for subagent dispatch while opencode-zen keys are on cooldown (429 "no keys currently off cooldown" hit during ling review 2026-08-04). Same model on multiple routers — pick route in this order when both exist:

1. `kilo/...` (kilo gateway — claude/gemini/gpt lanes, incl. lang variants like `kilo/inclusionai/ling-3.0-flash:free`)
2. `openrouter/...` (e.g., `openrouter/inclusionai/ling-3.0-flash:free`, `openrouter/poolside/laguna-s-2.1:free`)
3. `opencode-zen/...` (fallback only — router-cooldown-prone)
4. direct providers (`router-poolside/poolside/laguna-s-2.1`, `router-agnes/agnes-2.5-*`) — poolside direct is the premium free carrier per earlier sweeps

Lane probes were run via opencode-zen 2026-07-27..08-04, so "opencode-zen" in the entries below means the lane was validated there; the same model refs generally resolve on kilo/openrouter too (ling-3.0-flash especially — see 2026-08-04 note).

## Lane inventory (from `model-providers.json`)

- **Primary:** `minimax-m3` (MiniMax-M3 — main lane; verified vision-capable 2026-07-15, routes: kilo/minimax, logfare, opencode-zen, minimax-direct). Previous `kilo/openrouter/owl-alpha` is dead (404 on both the kilo gateway and OpenRouter; absent from `/v1/models`) — do not re-add.
- **Registered alt (agnes 2.5 family, probed 2026-08-03):** direct provider lane `pi:router-agnes/*` (upstream apihub.agnes-ai.com, 2 keys).
    - `agnes/agnes-2.5-flash` ✅ **subagent-viable 2026-08-03** — FREE (successor to 2.0-flash; 512K ctx/65.5K out). Lane probe exit 0 in ~55s (`LANE OK agnes-2.5-flash`), zero retries. **FIX graduation 2026-08-04:** first real delegated fix (BUG-2 — `clearSearchState` withSearchNotify) completed exit 0 in ~14 min: correct 2-edit implementation + real regression test (main-lane proved the guard fails on unfixed code 2/4 → passes 4/4 on fixed), typecheck/lint clean, report written (`tmp/bugsweep-fix-bug2-REPORT.md`), no scope creep, committed `852ee6b4`. Recommended free fix lane alongside nvidia/z-ai/glm-5.2. Previous `agnes-2.0-flash` entry (2026-07-27: tool-use + write succeed; over-reaches into child components) retired from the allowlist 2026-08-03 in favor of 2.5-flash; 2.0 still callable via API if ever needed.
    - `agnes/agnes-2.5-pro` ✅ **subagent-viable 2026-08-03** — **free to us** (no billing configured on the account; the wiki's $0.45/M in / $0.90/M out "paid" label never hits our keys — if the gateway accepts, it's free), 1M ctx/65.5K out. Lane probe exit 0; **~116s first-token latency** (reasoning + `--thinking max`), so never use the 90s smoke cap for these — needs ≥5 min runway.
    - `agnes/agnes-2.5-pro-alpha` ✅ **subagent-viable 2026-08-03** — free to us (same no-billing account), same caps as pro. Pro is the commercial stable release (2026-08-01) of the same benchmark model (alpha = 2026-07-24 preview): same scores, prefer `agnes-2.5-pro`; alpha only for A/B.
    - **Config:** allowlist lives in `~/.qwen/settings.json` → `modelProviders.openai` (read per-call, no restart) + `~/.pi/agent/model-providers.json`; mmx.js `qwenLocalCapabilityOverride` has an agnes-2.5 caps branch (active after external-subagents MCP restart). Reasoning-agnus workers die at `output:16` without the maxTokens pin.
- **Free fallbacks:**
    - `ling-3.0-flash-free` ✅ **subagent-viable 2026-07-29** (via `opencode-zen/ling-3.0-flash-free` → `router-opencode-zen`) — passed a real find-and-fix graduation trial removing an unused `onMount` import; lint + 3380 unit tests passed. **W58 reconfirm (UI/chrome+demo slice, qwen harness):** found real UI bug where `DemoChoreography.requestReplay()` ignored the `?nodemo=1` suppress guard; main-lane fix committed `2b6821fb` (tmp/w58-findui-REPORT.md).
    - `laguna-s-2.1-free` **route-dependent** — ❌ on OpenCode Zen (2026-07-29: subagent tasks stuck in long reasoning loops and hit 200MB+ stdout cap), ✅ via `/poolside` `poolside/laguna-s-2.1` and `/openrouter` `poolside/laguna-s-2.1:free` for direct completion probes. **Subagent benchmark 2026-07-29 (Pi harness, poolside route):** ❌ NOT subagent-viable — launched with `--thinking max`, spun in reasoning loops producing zero output for 41–88s on both a complex audit task and a trivial one-sentence prompt. Root cause: Pi harness defaults to `--thinking max` for reasoning-capable models; laguna-s-2.1 supports reasoning but loops indefinitely at max thinking. The `external_subagent_start` API does not expose a thinking-level override. Avoid for subagent coding tasks until a `--thinking low/off` option is available. **W58 re-verify 2026-07-30 (post hermes session_start hang fix):** `poolside/laguna-s-2.1` via `router-poolside` SUCCEEDED exit-0 on a same-scope UI components+css jargon audit (sentinel `UI AUDIT DONE POOLSIDE-LAGUNA`, `provider_health: ok`, `stop_reason: stop`, clean report `tmp/jargon-audit-ui-poolside-laguna.md`, ~$0.003 paid). The 2026-07-29 "reasoning loops / 41-88s zero output" was the hermes `session_start` DB contention (4.5GB sessions.db) misattributed to laguna — now fixed by `apply-hermes-session-start-defer-patch.mjs` (full-defer via `setImmediate`). **`poolside/laguna-s-2.1` IS subagent-viable for audit tasks via `router-poolside`** (provider-qualified model ref); the `--thinking max` concern stands for heavy coding tasks until a thinking-override is exposed.
    - `laguna-xs-2.1-free` ✅ **subagent-viable 2026-07-27** (via `openrouter/poolside/laguna-xs-2.1:free`)
    - `mimo-v2.5-free` ✅ **subagent-viable 2026-07-28** (resolves via `router-opencode-zen`) — strong for UI code edits but emits very long reasoning traces; use conciseness steering.
    - `deepseek-v4-flash-free` ✅ **subagent-viable 2026-07-28** (resolves via `router-opencode-zen`) — reliable for multi-step coding and read-only audits.
    - `nemotron-3-ultra-free` ✅ **subagent-viable 2026-07-28** (via `opencode/nemotron-3-ultra-free` → `router-opencode-zen`) — reliable but counts against the ~3–4 worker OpenCode Zen concurrency limit. **W58 reconfirm (engine deep slice, qwen harness):** found + fixed three real engine issues — RAF loop continuity when `_shouldSkipFrame()` returns true (MED), `ResourceTracker` double-dispose of GPU resource holders (MED), and dev-only window-global/module-ref retention after teardown (LOW) → committed `e33d0364` (tmp/w58-engine-REPORT.md).
    - `north-mini-code-free` ≈ **FIND scout only; NOT a trusted fix subagent** (reconfirmed 2026-07-29 via `opencode-zen/north-mini-code-free` on the **qwen harness**).
        - **Earlier "36 MB reasoning / 0 edits" verdict was a harness wedge, not the model**: `shouldSpawnThroughShell()` shelled spaced `.exe` paths → cmd.exe mangled `--prompt`/`--mcp-config` → worker died before editing. Fixed this session (patch `mmx.ts`: only shell `.cmd`/`.bat`; `shell:false` for `.exe`).
        - **Post-fix graduation (2026-07-29):** FIND ✅ — found the real `.legend-panel` dead-CSS bug with cross-referenced `file:line` evidence (34 `read_file`, 24 `grep_search`); find-grade ~7/10 (dinged for duplicate findings + weak "device check" reasoning). FIX ❌ — on a bounded 7-site removal it removed only **3/7 sites** (missed 1082/1150 in the same file + the entire `mobile_premium__state.css` comma-list), left a **stray 4-space line**, and **skipped the required `npm run build:svelte`** step (0 `run_shell_command` calls). fix-grade ~3/10.
        - **Use:** read-only bugsweep FIND/report scouting (feed its findings to main lane or a stronger fixer). Do NOT assign it multi-site edits or rely on its self-reported "done".
        - Also ⚠️ viable for read-only audits via `openrouter/cohere/north-mini-code:free`.
    - `freemodel/gpt-5.6-luna` ✅ **subagent-viable 2026-07-29** (qwen harness).
        - **Round 1:** Found and correctly fixed dead `window.refreshSearchResultHierarchy` guard in `src/lib/search/result-renderer.ts`.
        - **Round 2:** Found and correctly fixed stale `layer` → `side` field name in `SemanticState.routeTraceConnectionPairs` (`src/lib/state/types/engine-types.ts:375`). Runtime sites in `app.svelte.ts` and `route-trace.ts` already use `side`; the interface was the only stale reference. Build + tsc passed; main-lane applied and committed (`340ca34b`).
        - **Note:** First attempt in `w57-freemodel-luna-r2` hit a corrupted/pre-deleted worktree (missing `src/`, files staged as `D`). Luna tried to recover via `git checkout HEAD -- src` and removing a stale `index.lock`, but failed. Fresh worktree `w57-freemodel-luna-r2b` was created and Luna completed successfully.
        - **Round 3 (2026-07-29, qwen harness, isolated worktrees with separate `node_modules`):** Two bounded fixes from Sol's findings.
            - **Weather fallback (`src/lib/ui/weather-ui.ts`):** Correctly identified `renderWeatherFallback` queries `.weather-condition-icon use` (cast `SVGSVGElement`) which never exists in the DOM (`WeatherWidget.svelte` renders inline svg via `iconSvg` snippet). Removed the dead `weatherIconEl` + `conditionUseEl` queries and the unreachable `setAttribute` line; kept the live text-fallback assignments. Build + tsc passed.
            - **Dead semantic-lane bindings (`src/lib/ui/semantic-lane-bindings.ts`):** Correctly found `bindSemanticLaneControls()` is never called and references a nonexistent `#btn-semantic-lane-retry`. **Judgment call:** the module is NOT fully dead — `global-bindings.ts:11` imports `handleSemanticLaneWindowFocus` + `handleSemanticLaneVisibilityChange`. Luna removed only the dead function + dead imports (`loadSemanticThreads`, `handleError`) + 2 unused type aliases, kept the 2 live exports (rather than blindly deleting the whole module as the prompt suggested, which would have broken the build). Build + tsc passed.
            - **Result: 3/3 real bugs found and correctly fixed across 3 distinct slices (search, engine/state, UI).** Luna is fully **subagent-viable** for bounded fix tasks.
    - `freemodel/gpt-5.6-sol` ❌ **not subagent-viable 2026-07-29** (qwen harness).
        - **Round 1:** Correctly identified `appState.searchResults` bypass bug but asked for confirmation instead of fixing it; zero edits.
        - **Round 2 (UI/chrome slice):** Found several real bugs (weather UI `SVGSVGElement`/`SVGUseElement` type mismatch, dead `btn-semantic-lane-retry` reference, missing `#search-status` element referenced in `orchestration.ts`) but completed without applying any fix; zero edits, no `FIX_REPORT_READY`.
    - `freemodel/gpt-5.6-terra` ❌ **not subagent-viable 2026-07-29** (qwen harness).
        - **Round 1:** False-positive dead export (`areAdaptersInitialized`) — missed active regression test `tests/unit-active/w11-t7-adapters-init.test.ts`.
        - **Round 2 (journey slice):** Submitted a weak cosmetic-only fix — removed redundant bare `{ }` blocks around `canvasThreadInspectionClearTimer = null` assignments in thread-inspector files. Build passes, but no real bug was found.
    - `nvidia/mistralai/mistral-nemotron` ✅ **subagent-viable 2026-07-29** (qwen harness, free NVIDIA API tier → route `qwen:openai:nvidia/mistralai/mistral-nemotron`).
        - **Graduation trial (controls/keyboard slice, isolated worktree `w57-grad`):** Found a HIGH-severity real functional bug and fixed it correctly. `Ctrl+5` in `src/lib/keyboard/global-shortcuts.ts` dispatched the nav transition + updated the URL but never called `executeJourneyCompassAction(JOURNEY_ACTIONS.ENTER_INSIDE)` — the only path that runs `setSemanticDiveMode(true)` + `journeySetTrailDepth(2)` to activate the semantic-dive inside/pocket surface. The Header chip path (`Header.svelte:64`) already made the call; the keyboard path was the only one that skipped it → Ctrl+5 left the inside view inert. Fix added the missing call (mirrors `Header.svelte:64`; idempotent setters, no double-fire). Build + tsc + `vitest tests/unit-active/` (3361 passed) all green.
        - **Judgment:** Did NOT fall for the `bindGlobalEvents` "never-called = wiring-broken" false-positive trap (listeners were migrated to `triggers.ts` / `setupGlobalShortcuts`); investigated and correctly identified the _different_ real bug instead. Strong skepticism — correctly dismissed a "missing `setJourneyPhase`" candidate by tracing the parity-attrs resolver derives phase from `nav.mode`. ~7 min, 45 turns, exit 0.
        - Main-lane applied + verified + committed (`a13ab982`).
    - `nvidia/mistralai/codestral-22b-instruct-v0.1` ❌ **not autonomously subagent-viable 2026-07-29** (qwen harness, free NVIDIA API tier → route `qwen:openai:nvidia/mistralai/codestral-22b-instruct-v0.1`).
        - **Graduation trial (focus/thread-inspector/info-panel slice, isolated worktree `w57-codestral`, fresh `npm install`):** Worker did strong deep analysis (~45 turns traversing `clearThreadInspector`, `walkThreadNeighbor`, `__APP_ACTIONS__`, parity/surface plumbing) but **wedged before any edit** — `quiet_for_seconds: 576` (~9.6 min silent after a grep tool result was delivered). An `external_subagent_followup` continuation (steerable=true) **also stalled** — "Blowing on the cartridge…" spinner 6m 41s with `text_blocks:0`, `tool_calls:[]`, `provider_health:"ok"` (zero tokens). Cancelled both runners via the exact recorded PIDs. Worktree + cwd were correct (no scope/guardrail breach); failure is upstream of the model emitting tokens, not discipline.
        - **Verdict:** route resolves + cold start is fine, but the model emits **zero assistant tokens** under the qwen harness for an open-ended bugsweep — the same intermittent `mistral-nemotron` cold-stall signature noted at L159; Nemotron eventually worked, Codestral did not across two attempts. NOT a trusted autonomous fix channel; revisit only after the streaming-tool_call / cold-stall adapter fix (Cause 2 § L141) lands, then retry scoped.
    - `openai/gpt-oss-20b:free` ❌ **not subagent-viable** (qwen harness, 2026-07-29): provider returns `422 Provider returned error`. Lane dead for subagent work.
    - `qwen/qwen3-14b` ❌ **not subagent-viable** (qwen harness, 2026-07-29): provider returns `410 status code (no body)`. Lane dead for subagent work.
    - `hy3-free` / `tencent/hy3` ❌ not subagent-viable 2026-07-27 (OpenCode Zen 429 / cold stall)
    - `qwen3.6-plus` ❌ **not free-launchable 2026-07-30 (W58)**: `opencode-zen/qwen3.6-plus` returns `401 CreditsError` (needs OpenCode credits, not a free-tier model); `kilo/qwen/qwen3.6-plus` is 402 (paid). Dead lane for free subagent work.
    - `qwen3.6-flash` ❌ `qwen/qwen3.6-flash` is not in the unified v4 catalog via `zyditv4` (2026-07-27)
    - `qwen3.6-27b` (untested recently — not retried in W58)
    - `qwen-3.6-35b-a3b` ✅ **subagent-viable 2026-07-29** (via `logfare/qwen-3.6-35b-a3b` → `router-logfare`) — passed a real UX-copy audit + fix graduation trial (Splash.svelte jargon fix); all tools (read, edit, bash, write) worked; cold start ~1-2s, subsequent calls near-instant; 24K tokens, $0 cost. Only logfare model besides deepseek-v4-pro confirmed healthy.
    - `mistral/codestral-latest` ⚠️ **transport-viable but NOT a trusted FIND channel 2026-07-30 (W58, Pi harness, route `router-mistral/codestral-latest`)**: boots/reads/completes exit 0 in ~95s, $0.009 cost, writes structured output. BUT find-grade ~2/10 — fabricated a HIGH finding (`Math.random()` at `node-manager.ts:123`, with a fake grep-evidence claim; actual code uses `seededUnit`, zero `Math.random` in engine), a missed-sibling false positive (claimed unhandled WebGL context loss in `webgl-context.ts` — it IS handled in `three-listener-registration.ts` + `app-init.ts`), and a rule violation (reported `initMicroDemoBridge` as dead despite an explicit "intentionally NOT wired" retention comment + wrong file location + self-contradictory with its own dismissed list). Found 0 confirmed real bugs. Use only as a candidate-generator with mandatory main-lane source verification of every finding.
    - `mistral/devstral-latest` ⚠️ **inconclusive 2026-07-30 (W58, Pi harness)**: transport-viable (produced output, ~31 text blocks, $0.002) but too slow — timed out at 420s mid-analysis on the orchestration slice (was deep in grepping timers/clearTimeout). Retry with a 900s budget or a narrower single-file scope before gradable.
    - `deepseek-v4-flash-free` (W58 reconfirm, state slice): timed out at 420s in a ~153 MB thinking loop (the known deepseek thinking-loop / 200 MB-cap issue) — BUT its thinking surfaced a REAL verified lead (`CompassPhase` type missing `'trail'`, confirmed + fixed by main lane as `b6490d91`). Lesson: deepseek's mid-flight thinking output is valuable even when it fails to deliver a report; salvage leads from the stdout log before discarding.
    - `mimo-v2.5-free` ✅ **STRONG find channel 2026-07-30 (W58, Pi harness, orchestration sweep)**: completed exit 0 in ~6 min, $0 cost, 3 thinking blocks + 4 text blocks, wrote a structured report with file:line citations + evidence + a false-positive-dismissed section that correctly cleared the tricky `?story=`/`?record=` deep-link cases. **3 real findings** (F1 MED trailSeedIndex write-side omission in CAMERA_NODE_FOCUSED — the WRITE-side root cause of the b9f61225 read-side fix; F2 LOW teardownToastHooks dead cleanup; F4 LOW context-restore cleanup leak) and **1 false positive** (F3 — claimed redundant `preserveDomForcedFocusSearchSurface` call; actually an intentional re-assertion that restores `mode:'search'` after the SEARCH_FOCUS_REQUESTED publish clobbers it to `mode:'focus'`). find-grade ~7/10. F1 + F2 fixed + committed (`15a70d43`, `b3ef5e35`); F4 documented-deferred (cross-module refactor, double-cleanup risk, rare context-restore). **mimo is the best free find channel seen this wave** — surpasses codestral-latest (0 real / 4 FP) and deepseek (real lead but thinking-loop timeout).

### W58 wave summary (2026-07-30)

Bugsweep wave run on the now-wedge-fixed harness (pi-hermes-memory excluded from workers via mmx.ts `-ne`; all round-1 workers reached the provider with no hang — wedge fix confirmed). 3 slices (engine, orchestration, state) dispatched across 8 model attempts (incl. a mimo re-run of both the orchestration + engine slices after devstral/codestral underperformed). **Real bugs shipped (9 total, all green: typecheck + nav-mirror + targeted contract tests + parity 4/4)**: `CompassPhase` type missing `'trail'` (MED, deepseek lead) + `ResourceTracker` material-array `[0]`-only leak (MED, main-lane) → `b6490d91`; `trailSeedIndex` WRITE-side omission in `CAMERA_NODE_FOCUSED` (MED, mimo lead — closes the pattern with the `b9f61225` read-side fix) → `15a70d43`; `teardownToastHooks` dead HMR cleanup wired (LOW, mimo) → `b3ef5e35`; engine fixes — `detectWebGLSupport()` probe-context leak (MED), `void initThreeJS()` swallowed restore-reinit errors (MED), `rawPositionsBuffer!` unguarded non-null assertion (LOW), dead `point.x/y/z` else-branch reads (LOW) → `32ed619e`; plus F1 read-side `trailSeedIndex` fallback (`b9f61225`). **Deferred**: F3 (MED — postprocessing `.then()` captures stale renderer/scene/camera via closure; subtle microtask race, needs a liveness-check design). **Pre-existing (not W58)**: `three-resource-lifecycle-contract` reads the W47-retired `three-engine.ts` barrel instead of `three-engine-core.ts` → stale-path failure since `ec658636`. Dead lanes confirmed: `qwen3.6-plus` (401 credits), `nvidia/*` via key-router (404 — path not wired), `freemodel/gpt-5.6-terra` (401 billing). **New golden goose: `mimo-v2.5-free`** — strongest free find channel seen this wave (orchestration 3 real/1 FP, engine 4 real/0 FP-but-2-self-dismissed, correct `?story=`/`?record=` + shared-geometry-double-dispose dismissal, rigorous self-correction); `mistral/codestral-latest` transport-viable but a poor find channel (fabricates evidence).

### W58 continuation — late findings (2026-07-30)

Continued the same bugsweep wave after the main W58 summary:

- `ling-3.0-flash-free` UI/chrome+demo sweep found a real `?nodemo=1` suppress bypass in `DemoChoreography.requestReplay()`; main-lane fix committed `2b6821fb`.
- `nemotron-3-ultra-free` engine deep sweep found and fixed 3 real engine issues (RAF loop continuity, `ResourceTracker` double-dispose, teardown GC leaks); main-lane took over after worker wedged post-edit → committed `e33d0364`.

Both sets passed `npm run build:svelte`, `npx tsc --noEmit`, and `npx vitest run tests/unit-active/` (3363 passed).

### W58 harness-audit + untested-model qualification campaign — 2026-07-30

Goal: graduate untested models to the subagent allowlist by having them find/fix real harness issues while the main lane verifies.

**Graduated in this campaign:**

- `nvidia/z-ai/glm-5.2` ✅ **FIX subagent** — bounded search-bug fix in `global-shortcuts.ts` + `search.svelte.ts`; zero scope creep; main-lane verified + committed (`a3a0a5bd`).
- `nvidia/minimaxai/minimax-m3` ✅ **AUDIT subagent** — deep `mmx.ts` analysis; found the real no-hard-cancel wedge (`quiet_for_seconds` is informational, only 30-min timeout or manual cancel terminates stuck workers). Did not persist its report file (stdout-only), but findings were captured.
- `nvidia/google/gemma-4-31b-it` ✅ **AUDIT subagent** — wrote a 4-finding key-router report with file:line citations (blocking auto-shard health checks, no exponential backoff, sync `writeFileSync`, linear provider scan). Function names/behavior verified against source; line numbers drifted slightly. Model self-identified as "gpt-4o" in report header, but route metadata confirms it was `nvidia/google/gemma-4-31b-it`.

**Dead lanes / not subagent-viable on tested routes:**

- `nvidia/moonshotai/kimi-k2.6` ❌ 404 on chat completions
- `nvidia/ibm/granite-34b-code-instruct` ❌ Pi model resolver "Model not found"
- `nvidia/deepseek-ai/deepseek-v4-pro` ❌ 502 "Upstream stream failed"
- `nvidia/deepseek-ai/deepseek-v4-flash` ❌ 529 upstream overloaded
- `nvidia/google/gemma-3-12b-it` ❌ 404
- `nvidia/ibm/granite-3.0-8b-instruct` ❌ 404
- `nvidia/ibm/granite-3.0-3b-a800m-instruct` ❌ 404
- `nvidia/zyphra/zamba2-7b-instruct` ❌ 404
- `nvidia/mistralai/mistral-nemotron` ❌ EngineCore crash before output

**Zydit provider diagnosis:**

- `zydit/z-ai/glm-5.2` is the **only** reliably working subagent model on zydit; all other zydit-routed candidates hit upstream instability:
    - `zydit/google/gemma-4-31b-it` — resolves, 500 inference connection errors
    - `zydit/deepseek-ai/deepseek-v4-pro/flash` — 502 "Upstream stream failed before output"
    - `zydit/moonshotai/kimi-k2.6` — 404 (catalog lists it, upstream doesn't serve that exact ID)
    - `zydit/mistralai/mistral-nemotron` — resolves, produced a plan but did not complete the patch
- Key-router recent failure signature for `zydit` v1: `z-ai/glm-5.2` occasionally returns status 200 with message `"Stream ended after reasoning without content/tool output"` (provider streams reasoning then stops before content/tools). glm-5.2 usually retries through this; other models do not.
- Root cause: upstream Zydit capacity/backoff/flakiness, not our key-router config. All tested model IDs are listed in `/zydit/v1/models` or `/zydit/v4/models`.

**Harness issues found (verified):**

1. **key-router HIGH**: `chooseAutoShard` blocks every sharded request on `await Promise.all(candidates.map(fetchAutoShardHealth...))` (~1.2s/request).
2. **key-router MEDIUM**: `saveState()` uses sync `fs.writeFileSync`/`fs.renameSync` on the hot path.
3. **mmx HIGH**: No hard cancel for stuck workers — only 30-min timeout or manual cancel.
4. **Pi 0.83.0 race**: `_wrapDetachableTool` inline patch can be missing when external-subagent Pi workers spawn after a `pi update`.

**Applied + verified (2026-07-30):** All four harness fixes applied to live source and verified. Proven-model workers produced reviewable unified-diff patches; main lane reviewed, applied, and verified each.

**Deployed + verified live (2026-07-30):** Harness commit `97272e2` (phase3-restoration-clean) selectively staged the 4 fix hunks in `mmx.ts` (out of 18 total) + 20 key-router hunks (out of 32 total), excluding parallel-session mmx.ts changes (novita/infron providers, logfare quota-2056 detector, shell quoting, kimi-k3 phantom removal). `dist/mmx.js` rebuilt (07:36) with both mmx fixes present. Key-router restarted (PID 28972→23144, `/health` ok). Old external-subagents MCP instances (PIDs 8040+11340) killed; fresh instance launched from rebuilt `dist`. Remaining 2 workers ended (kiro-auto — canceled after logfare 429 storm; glm-5.2 — killed after 8h hung interactive-session state). 3 pre-existing TS2367 errors in `mmx.ts` (provider-type union comparisons at lines 1282/1310) are NOT from these fixes; `npx tsc` still emits `dist/` despite them (no `--noEmit`).

1. **key-router health cache** (HIGH) — `fetchAutoShardHealthCached()` wrapper with short-TTL in-memory cache (`AUTOSHARD_HEALTH_CACHE_MS`, default 3000ms). Null results intentionally not cached. Worker: `nvidia/minimaxai/minimax-m3` (valid patch, applied). Canonical patch: `tmp/harness-fix-keyrouter-healthcache-canonical.patch`. `node --check` passes.
2. **key-router async saveState** (MEDIUM) — `saveState()` converted to async via `fs.promises.writeFile`/`rename` with a serialized promise chain (`saveStateChain`) to prevent concurrent temp-file corruption. All 18 call sites updated to `await saveState()`. Worker: `nvidia/z-ai/glm-5.2` (valid patch, applied — superior serialization design vs main-lane canonical). Canonical patch: `tmp/harness-fix-keyrouter-asyncstate-canonical.patch`. `node --check` passes.
3. **mmx idle-cancel watchdog** (HIGH) — `EXTERNAL_SUBAGENT_IDLE_CANCEL_SECONDS` (default 600s) auto-cancel in `refreshMetadata`: if `quietForSeconds` exceeds the threshold and the worker is still starting/running, kills both PIDs via `killExactPid` and marks as stale. Worker: `nvidia/minimaxai/minimax-m3` (produced placeholder patch — main lane wrote canonical). Canonical patch: `tmp/harness-fix-mmx-idlecancel-canonical.patch`. `tsc --noEmit` passes (only pre-existing TS2367 errors).
4. **mmx pre-spawn background-detach patch** (Pi 0.83.0 race) — `ensureBackgroundDetachPatch()` called before every Pi worker spawn (idempotent, try/catch, non-blocking). Fixes the `_wrapDetachableTool is not a function` crash when workers spawn after `pi update` overwrites `agent-session.js`. Worker: `nvidia/minimaxai/minimax-m3` (valid patch, applied). Canonical patch: `tmp/harness-fix-mmx-prespawnpatch-minimax.patch`. `tsc --noEmit` passes.

**Model qualification results:** `nvidia/minimaxai/minimax-m3` ✅ FIX subagent (produced 3/4 valid patches — healthcache, prespawn, idle-cancel placeholder), `nvidia/z-ai/glm-5.2` ✅ FIX subagent (produced superior async saveState patch with serialization chain). Both graduated for harness fix work. `nvidia/google/gemma-4-31b-it` ✅ AUDIT subagent (findings verified against source). All nvidia-routed.

### W58 graduation batch — logfare/zydit-v4/mistral/kilo (2026-07-30T12:09Z)

Spawn-path re-verification post hermes `session_start` FULL-DEFER patch + DB shrink (4.75GB→2.29GB). **All 5 workers booted + reached providers within ~33s — the previous spawn-wedge (no assistant tokens, no provider_request events) is FIXED.** Root cause was hermes `session_start` DB contention on 4.5GB sessions.db, not key-router/LSP/MCP-init layers. `mcp_profile=subagent` (doctor-recommended default) used for all.

**Graduated:**

- `mistral/devstral-2512` ✅ **subagent-viable 2026-07-30** (Pi harness, route `pi:router-mistral/devstral-2512`, FREE to us; cost tracking shows ~$0.0074/task but no budget constraint). Full e2e: boot (18s) → `read package.json` → `write` report (163 bytes) → sentinel `GRAD TRIAL DONE devstral-2512`, `exit_code: 0`, 2 tool calls, ~2min total. Minor accuracy issue (undercounted devDeps 27 vs 28, scripts 100 vs 136) but agent loop perfect. mistral lane healthy (2/2 active keys, 0 cooling). Launch ref: `mistral/devstral-2512`.

**Failed / not viable:**

- `logfare/qwen-3.8-max` ❌ **429 rate-limited** across 6 retries (2s→64s exponential backoff) — logfare provider capacity issue, NOT spawn issue. Spawn path confirmed working (API calls succeeded, responses received). Retry when logfare recovers.
- `logfare/kimi-k3` ❌ **429 rate-limited** across 6 retries (same logfare throttle). Same diagnosis. Both logfare models were cancelled at attempt 6/10 to free slots for healthy-provider trials.
- `zydit-v4/minimax-m2.5` ❌ **TIMED OUT** (`exit_code: 124`, 420s). 6+ min to first response — reasoning model too slow for subagent use. The provider eventually returned "Request timed out" at ~12:16:53, but the worker's 420s timeout killed it first.
- `kilo/kwaipilot/kat-coder-pro-v2.5:free` ❌ **404** — "The free period of this model ended. Please use kilo-auto/balanced for affordable inference or kilo-auto/free for limited free inference." Free tier gone; not viable.

**Stream-idle-timeout GAP confirmed:** The 60s `withIdleTimeout` patch in `proxySseWithoutComments` did NOT fire during the 6min zydit-v4 silence. The "Request timed out" came from the provider's own timeout, not the key-router patch. Likely cause: zydit-v4 sends SSE keepalive frames (`:`) that reset the idle timer (each `iterator.next()` resolves on keepalive data), OR the zydit-v4 route bypasses `proxySseWithoutComments`. **Action item:** investigate whether keepalive-sending providers defeat the idle timeout, and consider a content-aware idle timer (reset only on actual content chunks, not comment/keepalive frames).

### W58 graduation batch #2 — zenmux / opencode-zen / mistral / cloudflare / modelscope (2026-07-30T13:09Z)

Continuation of the model-qualification campaign after the first batch. Task: read `package.json`, report 5 counts, write report to `tmp/`, end with sentinel.

**Graduated (clean e2e):**

- `zenmux/z-ai/glm-4.7-flash-free` ✅ **subagent-viable 2026-07-30** (Pi harness, route `pi:router-zenmux/z-ai/glm-4.7-flash-free`, genuinely free). Boot → `read package.json` → `write` report → sentinel `GRAD TRIAL DONE glm-4.7-flash-free`, `exit_code: 0`, `stop_reason: stop`, ~210-byte report, all 5 answers correct (deps=1, devDeps=28, scripts=136). zenmux lane has 2 free GLM variants; this one is accurate and fast.
- `opencode-zen/laguna-s-2.1-free` ✅ **subagent-viable 2026-07-30** (Pi harness, route `pi:router-opencode-zen/laguna-s-2.1-free`, genuinely free). Boot → `read` → `write` → sentinel, `exit_code: 0`, `stop_reason: stop`, 226-byte report, all 5 answers correct. 27 text blocks, no thinking blocks, ~2.5 min. **OVERTURNS prior 2026-07-29 ❌** on OpenCode Zen (reasoning-loop / 200MB cap) — that failure was the hermes `session_start` DB-contention wedge misattributed to laguna.
- `mistral/mistral-small-latest` ⚠️ **transport-viable 2026-07-30** (Pi harness, route `pi:router-mistral/mistral-small-latest`, free to us). Completed `exit_code: 0`, `stop_reason: stop`, wrote report, sentinel emitted. BUT accuracy is poor: devDeps 35 vs 28, scripts 140 vs 136. Use for quick tasks where exact counts are not critical; avoid for precision audits.
- `mistral/magistral-medium-latest` ⚠️ **transport-viable 2026-07-30** (Pi harness, route `pi:router-mistral/magistral-medium-latest`, free to us). Completed `exit_code: 0`, `stop_reason: stop`, wrote report, sentinel emitted. Accuracy poor: devDeps 26 vs 28, scripts 162 vs 136. Same caveat as mistral-small: loop works, counting is unreliable.

**Completed-but-already-known:**

- `kilo/kilo-auto/free` ✅ completed `exit_code: 0` with all 5 answers correct (deps=1, devDeps=28, scripts=136), but runtime `response_model` resolved to `inclusionai/ling-3.0-flash:free`. Confirms the kilo auto/free route is healthy but routes to an already-graduated model; not a new model graduation.

**Failed / not viable:**

- `mistral/mistral-medium-latest` ❌ **"Model not found"** — Pi CLI cannot resolve `router-mistral/mistral-medium-latest` even though the mistral provider catalog lists it. Registration/key mismatch in the Pi model-providers extension; other mistral models resolve fine on the same route prefix.
- `mistral/devstral-small-2:24b` ❌ **400 status code (no body)** — mistral API rejected the model ID (likely the `:` in `2:24b`), `willRetry: false`.
- `mistral/mistral-vibe-cli-latest` ⚠️ **output-length-limit** — booted, called `bash`, produced 19 text blocks, but hit `stopReason: length` mid-report ("semantic-expl"). Output token cap too low for this task. Not viable without a higher `maxTokens` harness config.
- `cloudflare/@cf/openai/gpt-oss-20b` ❌ **no real tool calls** — model emitted 21 thinking blocks explaining the plan and even printed tool-call JSON as thinking content, but never executed a real `read` or `write`. No report file. Cost $0.0024 wasted. Not viable for tool-use subagents.
- `modelscope/deepseek-ai/DeepSeek-V4-Pro` ❌ **401 Authentication failed** — "valid ModelScope token is supplied." Keys appear misconfigured or quota-related for this specific model.
- `modelscope/deepseek-ai/DeepSeek-V4-Flash` ❌ **429 insufficient_quota** — retest with the proven 2026-07-29 model ID also failed: "You exceeded your current quota, please check your plan and billing details." Modelscope lane is currently dead due to exhausted quota, not missing keys.
- `zenmux/z-ai/glm-4.6v-flash-free` ❌ **429 → 400** — zenmux free-tier usage cap reached ("You have reached the usage limit for the current free model"). Agent loop did engage (`read` tool call) before the cap tripped. Retry when zenmux caps reset.
- `opencode-zen/deepseek-v4-flash-free` ❌ **Internal server error → timeout** — provider returned 500-class error, retried, then worker timed out at 420s (`exit_code: 124`). Differs from prior thinking-loop failure; the opencode-zen deepseek-v4-flash-free route is currently failing outright.

### W58 graduation batch #3 — mistral / nvidia (2026-07-30T14:29Z)

Third continuation of the model-qualification campaign. Same package.json audit task.

**Graduated (clean e2e):**

- `nvidia/thinkingmachines/inkling` ✅ **subagent-viable 2026-07-30** (Pi harness, route `pi:router-nvidia/thinkingmachines/inkling`, FREE). Boot → `read` → `bash` (cwd) → `write` report → sentinel, `exit_code: 0`, `stop_reason: stop`, 158-byte report, **all 5 answers correct** (deps=1, devDeps=28, scripts=136). 7 thinking blocks, 7 text blocks, ~1 min. Strong new free carrier on the nvidia lane.

**Transport-viable but inaccurate:**

- `mistral/mistral-large-latest` ⚠️ (Pi harness, route `pi:router-mistral/mistral-large-latest`, FREE to us). Completed `exit_code: 0`, `stop_reason: stop`, wrote report, sentinel emitted. Accuracy poor: devDeps 30 vs 28, scripts 130 vs 136. Loop works; counting is unreliable.
- `mistral/devstral-latest` ⚠️ (Pi harness, route `pi:router-mistral/devstral-latest`, FREE to us). Completed `exit_code: 0`, `stop_reason: stop`, wrote report, sentinel emitted. Same inaccuracy as `devstral-2512`: devDeps 26 vs 28, scripts 100 vs 136. Alias behaves identically to `devstral-2512`.

### W58 graduation batch #4 — poolside / nvidia (2026-07-30T14:33Z)

Fourth continuation; same package.json audit task.

**Graduated (clean e2e):**

- `poolside/laguna-s-2.1` ✅ **subagent-viable 2026-07-30** (Pi harness, route `pi:router-poolside/poolside/laguna-s-2.1`, FREE to us). Boot → `read` → `bash` (mkdir) → `write` report → sentinel `GRAD TRIAL DONE laguna-poolside-direct`, `exit_code: 0`, `stop_reason: stop`, 226-byte report, **all 5 answers correct** (deps=1, devDeps=28, scripts=136). ~1.5 min. Heavy reasoning (35 thinking blocks) but accurate and cheap. **Direct poolside route is the premium free carrier** — user confirms "a beast".

**Transport-viable but inaccurate:**

- `mistral/codestral-latest` ⚠️ (Pi harness, route `pi:router-mistral/codestral-latest`, FREE to us). Completed `exit_code: 0`, `stop_reason: stop`, wrote report, sentinel emitted. Accuracy very poor: devDeps 26 vs 28, scripts 182 vs 136. Confirms earlier assessment: codestral transports well but is not a precise audit carrier.
- `mistral/magistral-small-latest` ⚠️ (Pi harness, route `pi:router-mistral/magistral-small-latest`, FREE to us). Completed `exit_code: 0`, `stop_reason: stop`, wrote 207-byte report, sentinel emitted. Transport excellent (~7s). Accuracy off-by-one: devDeps 29 vs 28, scripts 137 vs 136 (deps=1 correct). Same pattern as other mistral graduates: reliable loop, imprecise counting.

**Failed / not viable:**

- `mistral/mistral-code-latest` ❌ **output-token cap too low** — assistant emitted a `read` tool call but `stopReason: length` after only 16 output tokens, truncating the path to `C:\Users\HP\repos\`. Could not complete even the first `read`. Same family of cap issue as `mistral/mistral-vibe-cli-latest`.
- `nvidia/nemotron-3-super-120b-a12b` ❌ **404 page not found** — `router-nvidia` does not expose this model path, even though it appears in the NVIDIA catalog. `exit_code: 0` but provider returned 404 with no output. Not launchable via current router path.
- `logfare/qwen-3.6-35b-a3b` ❌ **Service temporarily unavailable** — logfare lane still degraded ~3.5h after the earlier 429 burst. Not viable right now. **2026-08-04 degradation note:** logfare upstream (logfare.ai/v1) had a 500 Internal Server Error storm + /v1/models + chat completions both hanging ≥40s (root 200 but slow ~5s); router cooldowns expired so this is upstream-side, not router-imposed. Router automically retries (`logfare quota-2056 detector` patched). Check before dispatching logfare lanes.
- `nvidia/openai/gpt-oss-120b` ❌ **Request timed out** — provider returned timeout after ~5.5 min of silence; auto-retry also failed. Same family as the cloudflare `gpt-oss-20b` that never emitted real tool calls. Not viable for subagent use.
- `nvidia/meta/llama-3.3-70b-instruct` ❌ **too slow / stuck** — successfully called `read` and retrieved package.json, but then sat at `turn_start` for >2 min without emitting the `write` tool call. Not a reliable carrier.
- `nvidia/google/gemma-4-31b-it` ❌ **too slow** — prompt delivered, no assistant output after >2 min. Same nvidia free-tier overload that stalled llama-3.3-70b. Not a reliable carrier today.

### W58 graduation batch #5 — priority-provider probes (2026-07-30T15:07Z)

User-requested quick probes across the five priority groups: `infron` free tiers, `zenmux` free frontier, `novita` free, `mistral` remaining free IDs, and `cloudflare`. Same package.json audit task (read `package.json`, report 5 counts, write report, emit sentinel).

**Graduated:**

- `novita/tencent/hy3` ✅ **subagent-viable 2026-07-30** (Pi harness, route `pi:router-novita/tencent/hy3`, FREE). Boot → `read` → `write` → sentinel `GRAD TRIAL DONE novita-hy3`, `exit_code: 0`, `stop_reason: stop`, all 5 answers correct (deps=1, devDeps=28, scripts=136). Fast and accurate. The OpenCode Zen bare `hy3-free` route remains degraded (429), but the Novita-qualified route works.

**Failed / not viable / inaccurate:**

- `infron/moonshotai/kimi-k2.6:free` ❌ **404** — route returns 404 with no body; model not served on this path right now. Infron's `:free` models may require a balance gate or be phantom listings.
- `zenmux/anthropic/claude-opus-5` ❌ **402 `reject_no_credit`** — requires account balance >0 (anti-abuse gate), not genuinely free to us on this route.
- `mistral/devstral-medium-latest` ⚠️ **transport-viable but inaccurate** — completed exit 0 and wrote the report, but reported scripts=100 vs ground-truth 136. Same count-drift pattern as other Mistral IDs.

### Mistral bugsweep bake-off (2026-07-30, W61 stale-closure class)

Controlled bake-off: same prompt + same scope (`WeatherWidget`/`InfoPanel`/`FocusPocket`/`AppBoot` — main-lane ground truth: **0 stale-closure bugs + 1 LOW missing-cleanup** in AppBoot's `requestIdleCallback` no-`cancelIdleCallback`) + anti-over-reasoning guardrails + an explicit "fetch→global-store is NOT stale-closure" KEY DISTINCTION. Ranked by false-positive rate (precision is king — main-lane verifies every finding):

| Model                            | Real    | FP    | Verdict                                                                                                                                                                                               |
| -------------------------------- | ------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mistral/magistral-small-latest` | 0\*     | **0** | 🏆 **BEST mistral bugsweep channel** — perfect precision, correct reasoning on all 8 callbacks, followed the global-store + `$effect`-reads-live distinctions. Open-source 24B reasoning model, free. |
| `mistral/devstral-latest`        | 1 (LOW) | 2     | found AppBoot but fabricated a HIGH "async WebGL" in FocusPocket (`applyLocalNeighborhoodFocus` is synchronous)                                                                                       |
| `mistral/devstral-medium-latest` | 1 (LOW) | 2     | same — even ADMITTED "captures no component-scoped state" then flagged it HIGH, ignoring the KEY DISTINCTION prompt                                                                                   |
| `mistral/magistral-medium-2509`  | 0       | 1     | terse 649B, missed AppBoot, cleared nothing                                                                                                                                                           |
| `mistral/devstral-2512`          | 0       | 4     | poor (prior W61-G run, same class)                                                                                                                                                                    |
| `mistral/codestral-latest`       | 0       | 4     | fabricated a `setTimeout` in `toggleExpanded` (it's just `expanded=!expanded`) + hallucinated an `AbortController` "Cleared" section. Useless.                                                        |
| `mistral/mistral-code-latest`    | —       | —     | **wedged 2/2** (output-token cap truncates `read` path → `stopReason: length`) — confirms the line-190 smoke on a real task. Unusable on current harness.                                             |

\*0 real because the scope had 0 stale-closure bugs; the AppBoot LOW is missing-cleanup (a different class), which magistral-small correctly excluded.

**Key insight:** for careful stale-closure/reasoning bugsweeps, **reasoning models (Magistral-small, glm-5.2) >> coding models (Devstral/Codestral)**. The entire Devstral family (2512/latest/medium) is consistently imprecise — flags the fetch→global-store trap + fabricates async/WebGL concerns + misunderstands `$effect` reactivity, _even with explicit guidance_. **Default mistral-lane bugsweep channel = `mistral/magistral-small-latest`** (0 FP, cheap, correct). Caveat: recall untested here (scope had 0 real stale-closure bugs) — pair with `nvidia/z-ai/glm-5.2` (best recall: found M10 + M12) on fresh scopes; glm-5.2 over-reasons to death on >2-file scopes so keep its scope tight + timeout ≤600s.

- `cloudflare/@cf/moonshotai/kimi-k2.6` ❌ **403** — not launchable today; Cloudflare Workers AI route rejects this model ID.

### Strong free/shadow routes for coding

| Model                    | Route                 | Best for                                      | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mimo-v2.5-free`         | `router-opencode-zen` | UI code edits, component extractions          | Long reasoning; set tight scope and steer for conciseness.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `deepseek-v4-flash-free` | `router-opencode-zen` | Multi-step coding, bugsweep, read-only audits | Proven on L1/L2/L4/L5 sweep tasks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `deepseek-v4-pro`        | `router-logfare`      | Complex UI refactor / extraction              | Reliable workhorse; 900s timeout may be needed for large tasks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `qwen-3.6-35b-a3b`       | `router-logfare`      | Audits, copy fixes, small scoped edits        | Graduated 2026-07-29; cold start ~1-2s, fast tools, $0 cost.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `deepseek-v4-flash`      | `router-modelscope`   | **Focused bug fixes, scoped engine edits**    | ✅ **VIABLE 2026-07-29**: fixed 4 engine bugs (CRITICAL+HIGH+2×MEDIUM), build+lint passed, clean report, $0.005 cost, ~6 min, 22 thinking blocks. 49 models, 3 keys, no balance/credit issues. Launch ref: `modelscope/deepseek-ai/DeepSeek-V4-Flash`. Note: earlier bugsweep trial (open-ended) went off-task — best for well-scoped fix tasks with precise instructions, not open-ended exploration. Also passed a simple `onMount` removal trial with lint clean, but the provider returned `429 insufficient_quota` mid-test-run; rerun needed for clean graduation record. |
| `devstral-2512`          | `router-mistral`      | Scoped coding tasks, file audits (FREE to us) | ✅ **VIABLE 2026-07-30**: full e2e graduation (boot→read→write→sentinel, exit 0), 18s boot, ~2min total. Minor count inaccuracy on large package.json (undercounted scripts). Launch ref: `mistral/devstral-2512`. mistral lane: 2/2 active keys, 0 cooling.                                                                                                                                                                                                                                                                                                                    |
| `laguna-s-2.1-free`      | `router-opencode-zen` | Read-only audits, quick code edits            | ✅ **VIABLE 2026-07-30**: free gateway tier, accurate package.json counts, exit 0 in ~2.5 min. Overturns prior reasoning-loop ❌ (was hermes wedge). Launch ref: `opencode-zen/laguna-s-2.1-free`.                                                                                                                                                                                                                                                                                                                                                                              |
| `glm-4.7-flash-free`     | `router-zenmux`       | Read-only audits, quick code edits            | ✅ **VIABLE 2026-07-30**: zenmux free tier, all 5 counts correct, exit 0. Fast and disciplined. Launch ref: `zenmux/z-ai/glm-4.7-flash-free`.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `inkling`                | `router-nvidia`       | Read-only audits, quick code edits            | ✅ **VIABLE 2026-07-30**: nvidia free tier, all 5 counts correct, exit 0 in ~1 min. 7 thinking blocks. Launch ref: `nvidia/thinkingmachines/inkling`.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `poolside/laguna-s-2.1`  | `router-poolside`     | Read-only audits, complex coding tasks        | ✅ **VIABLE 2026-07-30**: direct poolside route, FREE to us, all 5 counts correct, exit 0 in ~1.5 min. 35 thinking blocks. User-confirmed "beast" carrier. Launch ref: `poolside/laguna-s-2.1`.                                                                                                                                                                                                                                                                                                                                                                                 |
| `tencent/hy3`            | `router-novita`       | Read-only audits, quick code edits            | ✅ **VIABLE 2026-07-30**: Novita free route, all 5 counts correct, exit 0, fast. Avoid OpenCode Zen `hy3-free` route. Launch ref: `novita/tencent/hy3`.                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Provider health snapshot — 2026-07-29

Probed from main lane via `/v1/models` and completion calls.

| Provider / Route | Model                                                                             | Verdict | Latency  | Notes                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------- | ------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `/poolside`      | `poolside/laguna-s-2.1`                                                           | ✅      | ~0.5 s   | Direct Poolside endpoint; 200 OK                                                                           |
| `/openrouter`    | `poolside/laguna-s-2.1:free`                                                      | ✅      | ~0.4–1 s | OpenRouter free tier; 200 OK                                                                               |
| `/logfare`       | `qwen-3.6-35b-a3b`                                                                | ✅      | ~1.1 s   | Subagent-viable; passed coding trial 2026-07-29 (Splash.svelte jargon fix)                                 |
| `/logfare`       | `kimi-k2.7-code`                                                                  | ❌ 429  | —        | Rate-limited upstream                                                                                      |
| `/logfare`       | `minimax-m3`                                                                      | ❌ 429  | —        | Rate-limited upstream (was `content: null` — confirmed 429 throttle, not a model bug)                      |
| `/kilo`          | `kilo-auto/frontier`                                                              | ❌ 402  | —        | Paid model; credits required                                                                               |
| `/kilo`          | `openrouter/auto`                                                                 | ❌ 402  | —        | Paid model; credits required                                                                               |
| `/kilo`          | `openrouter/auto-beta`                                                            | ❌ 402  | —        | Paid model; credits required                                                                               |
| `/kilo`          | `kilo-auto/free`                                                                  | ⚠️      | —        | 200 OK; maps to `stepfun/step-3.7-flash`; returns reasoning content (not raw answer) — usable with caution |
| `opencode-zen`   | free routes (deepseek-v4-flash-free, mimo-v2.5-free, nemotron-3-ultra-free, etc.) | ✅      | varies   | All probed free routes via OpenCode Zen are subagent-viable                                                |
| `/openprovider`  | all models                                                                        | ❌ 502  | —        | `/v1/models` endpoint returning 502; provider unavailable                                                  |

### Changes from 2026-07-27

- **`laguna-s-2.1-free`**: flipped from ❌ to route-dependent — still ❌ on OpenCode Zen for subagent work (reasoning-loop / 200MB cap, 2026-07-29), but ✅ via `/openrouter` and `/poolside` for direct completion probes.
- **`north-mini-code-free`**: route-dependent — ❌ via OpenCode Zen (hallucination), ⚠️ via `/openrouter` for read-only audits.
- **`minimax-m3`** (main lane): `content: null` on `/logfare` suggests Logfare is degraded for this model; other routes (kilo/minimax, minimax-direct) may be unaffected — probe those before assuming main-lane blockage.
- **OpenCode Zen free routes**: all reconfirmed viable; cap concurrency at ~3–4 workers to avoid stuck stores (observed 8 workers → 192MB+ stdout and 600s timeouts).
- **New dead entries**: `kimi-k2.7-code` (logfare 429), `/openprovider` 502 — both new to inventory.

### 2026-07-29 UI cleanup dispatch plan

| Task                         | Worker         | Route                                           | Rationale                                                  |
| ---------------------------- | -------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Mobile header overlap (B-S7) | `ocw_195ae...` | `router-opencode-zen/mimo-v2.5-free`            | Proven UI code edits; steer for conciseness.               |
| Focus facts separator (5g)   | `ocw_7a362...` | `router-opencode-zen/mimo-v2.5-free`            | Proven UI code edits.                                      |
| Role label (5k)              | `ocw_bb661...` | `router-opencode-zen/mimo-v2.5-free`            | Proven UI code edits.                                      |
| Journey suite timeout        | `ocw_763fe...` | `router-logfare/deepseek-v4-pro`                | Proven multi-step workhorse; keeps OpenCode Zen load down. |
| Visual audit catalog         | `ocw_a6844...` | `router-opencode-zen/deepseek-v4-flash-free`    | Proven read-only audits.                                   |
| Drift audit                  | `ocw_e7fdd...` | `direct-openrouter/cohere/north-mini-code:free` | Read-only; tests openrouter north-mini viability.          |

OpenCode Zen load: 4 workers (3 mimo + 1 deepseek), within the ~3–4 safe zone but at the edge. If any mimo worker stalls due to long reasoning, it will be steered/canceled and relaunched on another provider.

## Orchestration bugsweep trial — 2026-07-29 (free routes, max reasoning)

Goal: trial untrialed free-catalogue models (max reasoning where supported) on a real bugsweep of 5 orchestration files. Route-health barriers blocked every free subagent from completing the trial end-to-end; the main lane finished the sweep manually (`tmp/trial-2026-07-29/main-lane-findings.md` — 1 MED + 4 LOW + 1 investigated-resolved). Trial detail: `tmp/trial-2026-07-29/trial-summary.md`.

| Route                                          | Health                                                                                            | Launchable?                                                                                                                                                                                                                                                                             | Verdict                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **OpenRouter key-router** `/openrouter/v1`     | ✅ alive (direct API + key-router 200 for `openai/gpt-oss-20b:free` `reasoning_effort:max`, 1-3s) | ❌ workers exit 124 (120s timeout); 0 assistant output                                                                                                                                                                                                                                  | upstream works, launch harness times out — NOT viable                               |
| **NVIDIA upstream** `integrate.api.nvidia.com` | ✅ alive (direct API 200, 370-850ms, all reasoning variants)                                      | ❌ key-router `/nvidia/v1/chat/completions` → **404** (path listed but not wired). 5 workers stalled 7+ min, cancelled.                                                                                                                                                                 | upstream alive, key-router broken — NOT viable                                      |
| **ModelScope** `/modelscope/v1`                | ✅ alive (after warmup)                                                                           | ⚠️ partial. **Qwen3-30B-A3B-Thinking-2507** produced 23 tool calls but an **off-task** report (project-wide `any` grep). PROMPT-v3 got it on-task but it **completed without writing the report**; followup rescue stalled. DeepSeek-V4-Flash hit **429 insufficient_quota** ~9 min in. | route works; models lack report-writing discipline — NOT viable without heavy steer |
| **Cloudflare** `/cloudflare/v1`                | ✅ alive (`@cf/qwen/qwen3-30b-a3b-fp8` chat OK)                                                   | ⚠️ `qwq-32b` produced reasoning text but **0 tool calls** — can't read files                                                                                                                                                                                                            | NOT viable for code-intelligence sweep                                              |
| **kilo** `*/kilo*`                             | ❌ HTTP 402 (balance -0.00003)                                                                    | ❌ all models fail                                                                                                                                                                                                                                                                      | dead                                                                                |
| **zenmux**                                     | ❌ HTTP 000                                                                                       | ❌ down                                                                                                                                                                                                                                                                                 | dead                                                                                |
| **airforce**                                   | ✅ alive                                                                                          | ❌ not a key-router provider lane — not launchable via external_subagents                                                                                                                                                                                                               | not launchable                                                                      |
| **freeinference.org**                          | ✅ alive (7 models, 292K tokens/6.3s)                                                             | untested as Pi harness provider                                                                                                                                                                                                                                                         | candidate, untested                                                                 |

Cross-cutting:

- `--thinking max` is applied to ALL subagent workers regardless of model reasoning support (gemma got it too); no override exposed by `external_subagent_start`. User confirmed: keep it.
- NVIDIA `nvidia/*` free nemotron models are NOT exposed via OpenRouter in this subagent catalogue — they only reach the broken nvidia key-router lane.
- The one model that produced output (ModelScope Qwen3-30B) went off-task — a prompt-discipline problem surfaced, not just a route problem; PROMPT-v3 (ordered read→find→report, forbid project-wide grep) fixed on-task-ness but the model still didn't deliver the report artifact.
- 2026-07-27 bench ground truth (`docs/bugsweep-bench-2026-07-27.md`) had no orchestration entries → all main-lane findings are NEW.

Next lane to trial (not yet done): freeinference.org as a direct Pi harness provider — alive, fast, has reasoning-capable models; only untested piece remaining.

### 2026-07-30 late qualification (Pi harness 0.83.0)

Goal: graduate `nvidia/z-ai/glm-5.2`, `nvidia/minimaxai/minimax-m3`, `logfare/minimaxai/minimax-m3`, and `zydit/*` routes.

| Model / route                  | Smoke / task                                            | Verdict                                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nvidia/z-ai/glm-5.2`          | bounded FIX: `global-shortcuts.ts` + `search.svelte.ts` | ✅ **FIX subagent**                         | Zero scope creep; main-lane verified + committed (`a3a0a5bd`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `nvidia/minimaxai/minimax-m3`  | AUDIT of `mmx.ts`                                       | ✅ **AUDIT subagent**                       | Found real no-hard-cancel wedge; stdout-only report.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `nvidia/google/gemma-4-31b-it` | key-router audit                                        | ✅ **AUDIT subagent**                       | Wrote 4-finding report with file:line citations; line numbers drifted slightly.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `logfare/minimaxai/minimax-m3` | read-only smoke + 600s focus bugsweep                   | ✅ **FIX subagent (slow for broad sweeps)** | Smoke exit 0, wrote report, ~14K cache-read tokens, $0. Focus bugsweep timed out at 600s but was actively working (14 text blocks + bash tool calls, reading `AGENTS.md`/`docs/important-files.md`). Produces a `Model 'minimaxai/minimax-m3' not found for provider 'router-logfare'` warning at boot but falls back to a custom model id and succeeds. For substantive sweeps budget 900s and narrow scope, or run on the main lane. **Bounded FIX confirmed 2026-07-30**: completed the BUG-002 consolidate-on-`isNew` gate fix in `search-dispatch.ts` cleanly (~2.5 min, 12 text blocks, one `write` tool call, exit 0, $0); main-lane verified (tsc 0, 23/23 + 37/37 related search tests, build:svelte 0) and committed `f01d502a`. Narrow bounded-FIX = reliable. **Open-ended read-only bugsweep has a HIGH false-positive rate** (audited 2026-07-30 on the info-panel 4-file sweep: of 7 reported findings, 3 were fabricated/false — including a made-up "Svelte 5 strict-mode compiler bug documented in AGENTS.md" CRITICAL and a mis-assumption that `testCompatStore` is prod-null, disproved by the body-MutationObserver + parity bridge in `test-compat.svelte.ts`; the report was even self-contradictory, clearing `panelPanel` derived from the same store it flagged). Only ONE of the 7 was a verified real bug (HIGH: `info-panel-error`/`info-panel-loading`/`@keyframes spin`/`prefers-reduced-motion` nested inside `@media (max-width:768px)` ⇒ desktop loading/error unstyled). **Minimax-m3 is a useful audit lead-generator, NOT a verifier — its verdicts MUST be main-lane source-checked before any action.** Audited report: `tmp/bugsweep-infopanel-AUDIT.md`. Open-ended sweeps still need 900s+. |
| `zydit/z-ai/glm-5.2`           | read-only smoke                                         | ❌ **flaky**                                | Chat completions work, but subagent stream terminates with `"Upstream stream ended before a completion terminator was received"`. Root cause: upstream Zydit capacity/backoff/flakiness, not key-router config.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `zydit/minimaxai/minimax-m3`   | read-only smoke                                         | ❌ **NOT subagent-viable**                  | Same stream-termination as `zydit/z-ai/glm-5.2` (`Upstream stream ended before a completion terminator was received`). The stream-hang wedge is **zydit-wide, not model-specific** — chat completions work but the subagent streaming tool loop dies after the first reasoning block. Do not retry zydit models for subagent work until the upstream stream-hang fix (stream-idle timeout + SSE teardown on worker kill) lands.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Note on `logfare/kiro-auto`:** Launched on a bounded FIX task; immediately hit logfare upstream `429 "Logfare upstream rate-limited model kiro-auto"` (auto-retry up to 10× with 128s+ delays) and never produced assistant output. Completion probes previously accepted `max`, but the subagent dispatch path is rate-blocked right now. Retry after logfare quota/cap resets.

## Free-lane billing investigation — 2026-07-29

Probed all alternate free providers for Macaron-V1-Venti subagent access. Findings:

| Provider             | Free models?                      | Verdict               | Details                                                                                                                                                                                                                                                                                  |
| -------------------- | --------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Modelscope**       | 49 models, 3 keys                 | ✅ **best free lane** | No balance/credit/rate-limit issues. DeepSeek-V4-Flash returns `reasoning_content`, Qwen3-Coder-30B clean responses. 75 entries seeded in settings.json. Launch-ready.                                                                                                                   |
| **Novita**           | 0 of 143 models free              | ❌ dead end           | All 143 models have pricing; `403 NOT_ENOUGH_BALANCE` on $0 account. "Free" Macaron listing was misleading — Novita requires balance for every model.                                                                                                                                    |
| **Infron**           | `:free` models exist but need $5+ | ❌ dead end           | `:free`-suffixed models (kimi-k2.6:free, macaron-v1-venti:free, etc.) require account balance > $4.999999. Not truly free. Also `insufficient_user_quota` (credits exhausted).                                                                                                           |
| **Zenmux**           | 5 genuinely free (`-free` suffix) | ⚠️ rate-limited       | `z-ai/glm-4.7-flash-free`, `z-ai/glm-4.6v-flash-free`, `x-ai/grok-4.5-free`, `moonshotai/kimi-k3-free`, `stepfun/step-3.7-flash-free`. Usage-capped (429 "usage limit reached"), NOT balance-required — resets periodically. 152 entries seeded. Infra ready when caps reset.            |
| **Macaron-V1-Venti** | infra fixed, upstream blocked     | ⚠️ pending billing    | Routing pipeline fixed (mmx.js piModelRef + extension providerIdForBaseUrl patched for novita/infron). Both Infron ($5 balance) and Novita (balance) need account top-up. When billing clears, re-launch with `infron/mindai/macaron-v1-venti:free` or `novita/mindai/macaron-v1-venti`. |

**Recommendation:** Use **Modelscope** (49 models, no billing wall) + **Logfare** (3 confirmed viable) for free subagents. Avoid Novita/Infron until accounts are topped up. Zenmux free models are a secondary option when rate caps reset.

## W57 subagent cold-stall root cause — 2026-07-29 19:18 UTC

Follow-up to the earlier "Orchestration bugsweep trial" openrouter/nvidia/cloudflare/groq "exit 124 / 0 assistant output" verdicts. Direct key-router probes that **mimic the harness** (`stream:true + tools + reasoning_effort:max`) pinpoint three distinct causes — most "model not viable" verdicts were **harness/adapter bugs**, not model failures:

- **Cause 1 — `reasoning_effort: "max"` rejected.** The harness hardcodes `--thinking max`. **Groq** returns HTTP 400 (`allowed values ['none','default','low','medium','high']` — `max` not allowed). **ModelScope `deepseek-ai/DeepSeek-V3.2`** returns `choices: null` / empty. Harness swallows the error → logs-only forever. Fix: harness should send `high`/omit for these providers.
- **Cause 2 — streaming `tool_calls` deltas not parsed.** `google/gemma-4-26b-a4b-it:free` (openrouter) and `mistralai/mistral-nemotron` (nvidia) emit **textbook-correct OpenAI tool_call streams** (`function.name:"read"`, correct path arg, `finish_reason:"tool_calls"`) in 1–5 s, yet the harness shows `tool_calls: []` / `assistant_output_seen: false` indefinitely. Routes that work (`router-opencode-zen`, `router-logfare`, `router-modelscope` DeepSeek-V4-Flash) normalize streaming tool_calls; `direct-openrouter`/`router-nvidia`/`router-groq`/`router-cloudflare` do not. Fix site: Pi core OpenAI-completions stream parser (compiled dist) — file a harness issue, not a local patch.
- **Cause 3 — genuinely flaky model.** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` under _no_ thinking returned pure gibberish (`ξηξη ． Velerik...`). Avoid.

**Bottom line:** `google/gemma-4-26b-a4b-it:free` and `mistralai/mistral-nemotron` are **likely subagent-viable once the streaming-tool_call adapter is fixed** — both streamed correct tool calls today. Until then, restrict subagent dispatch to `router-opencode-zen`, `router-logfare`, and `router-modelscope`. Full breakdown: `tmp/w57-root-cause-breakthrough-2026-07-29.md`.

## W57 reasoning-level / "configured poorly" audit — 2026-07-29 19:44 UTC

User steer: "those models don't support max reasoning flag? We should still launch with THEIR highest reasoning level" + "ensure they don't expose xhigh and max reasoning settings that we just configured poorly" + "same check on logfare models". Probed every route with the full candidate set `{max, xhigh, high, medium, low, default}` AND the OpenRouter-native nested `reasoning:{effort}` field. `external_subagent_start` exposes NO reasoning/thinking override (confirmed in live schema: only cwd/name/model/harness/timeout/mode/mcp\_\*/live_steer/keepalive params) — so harness hardcodes flat `reasoning_effort:"max"` and we cannot route per-model ceilings from the launch API.

### Non-logfare (cold-stall suspects)

| Model                                                 | max                                            | xhigh                 | high                                | Verdict                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------- | ---------------------------------------------- | --------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Groq `llama-3.3-70b-versatile`                        | 400 allowed:[none,default,low,medium,high]     | 400 same allowed-list | 400 "not supported with this model" | **Genuinely non-reasoning** — ALL `reasoning_effort` values 400. There is no "their highest"; harness must OMIT the field. Blocked at harness level today.                                                                                                                                       |
| ModelScope `DeepSeek-V3.2`                            | flat → 200 `choices:null` (empty)              | flat → empty          | flat → empty                        | **"Configured poorly" CONFIRMED.** Flat `reasoning_effort` returns empty; nested `reasoning:{effort:"max"}` (and `"high"`) → 200 with valid output. V3.2 wants the OpenRouter-native **nested `reasoning` field**, not flat. Harness sends flat → cold-stall. Wrong FIELD NAME, not wrong level. |
| ModelScope `DeepSeek-V3.1`                            | flat → 200 ok                                  | flat → 200 ok         | flat → 200 ok                       | Works with BOTH field names at all levels. No config issue — harness flat `max` already works.                                                                                                                                                                                                   |
| ModelScope `DeepSeek-V4-Flash`                        | flat → 200 empty (non-stream); streaming works | —                     | —                                   | Non-stream returns empty but streaming (the harness path) works. Level fine.                                                                                                                                                                                                                     |
| OpenRouter `gemma-4-26b:free` + `ling-3.0-flash:free` | 200 (ling returns content)                     | 200                   | 200                                 | Accept `max`/`xhigh`. Cold-stall is Cause 2 (streaming tool_call adapter), NOT reasoning config.                                                                                                                                                                                                 |
| NVIDIA `mistral-nemotron`                             | flaky TIMEOUT                                  | 200 ok                | flaky TIMEOUT                       | Accepts `xhigh`; `max` times out intermittently. Not a config lever.                                                                                                                                                                                                                             |
| Cloudflare `llama-3.3-70b`                            | 200 ok                                         | 200 ok                | 200 ok                              | Accepts every level. Cold-stall = Cause 2 (adapter) + genuinely flaky (gibberish w/o reasoning).                                                                                                                                                                                                 |

**`xhigh` is NOT a higher ceiling we're missing anywhere** — on every route where `xhigh` returns 200, `max` also works; on groq BOTH `max` and `xhigh` are rejected with the same allowed-values 400.

### Logfare (10 models) — the actual ask

Clean signal on 4 of 10 (rest 429 rate-limited this run): `kiro-auto`, `minimax-m3`, `kimi-k2.7-code`, `glm-5.2`.

- **All 4 accept `max` → HTTP 200 with content or tool_calls.** None 400-reject `max`/`xhigh`. No `xhigh`-only-higher tier to chase.
- **`minimax-m3`** returned tool calls at `max`/`xhigh`/`default` but EMPTY at `high`/`medium`/`low` → so for the workhorse, sending `max` is materially correct; `high` would produce nothing.
- **Conclusion: for logfare we ARE using the max the models accept. Not misconfigured.** Rate-limited logfare models (deepseek-v4-pro/flash, kimi-k2.6/k3, qwen-3.8-max, qwen-3.6-35b-a3b) to re-probe after upstream quota resets.

### Actionable levers

1. **ModelScope DeepSeek-V3.2** — real graduation opportunity IF the harness is patched to send nested `reasoning:{effort:max}` for it (or if pi-model-providers catalog maps the field). Likely viable; re-trial after fix.
2. **Groq non-reasoning models** — need harness to OMIT `reasoning_effort` for models that don't support it. Requires a per-model reasoning capability flag in the catalog feeding the harness. Not reachable today via `external_subagent_start`.
3. **File a harness issue**: (a) expose a `reasoning_effort` override + auto-recognize non-reasoning models (groq llama-3.3-70b → omit); (b) ModelScope V3.2: send nested `reasoning:{effort}` not flat `reasoning_effort`.

## W57 kimi-k3 deep-dive — 2026-07-30 (corrected after per-key audit)

User: "kimi k3 from zydit and from logfare but we haven't got it to work, not sure we have them set correctly." Live key-router source inspection (`C:\Users\HP\Desktop\Temp while my comp is at the shop\harness\servers\key-router\src\opencode-key-router.mjs`) + streaming tool_call probes against all three paths. **Verdict: NOT a pi-config bug.**

### [Logfare] Kimi K3 (`https://logfare.ai/v1`, direct-logfare)

- **pi config CORRECT (fixed 2026-07-29).** Key-router `providerModelRequestProfiles.logfare["kimi-k3"]` was added 2026-07-29 (was MISSING → that alone caused cold-stall: no `stripToolStream` → streaming tool_calls not parsed, W57 Cause 2). Mirrors kimi-k2.6 (stripToolStream + thinking + retries + finish-reason synthesis). Regenerated catalog has `supportsTools:true`, `supportsReasoningEffort:true`, per-entry `thinkingLevelMap` max→max.
- **Per-key opt-in audit (direct, 7 keys):** #3 `...UgCfWR` + #4 `...p_rZpc` → **ELEVATED/opted-in** (kimi-k2.6 = 200). #2 `...zkTYT8` (acct `pi-probe-5357606`, the singular `LOGFARE_API_KEY`) → **NOT opted-in** (403 `training_optin_required` for both k2.6+k3). ~4 others indeterminate (503/timeout).
- **kimi-k3 on the ELEVATED keys → 503 (NOT 403)** → **kimi-k3 is NOT training-gated on the elevated keys.** Retry x5: kimi-k3 503 all 5; `deepseek-v4-flash` (known-deployed) ALSO 503s on those same keys while kimi-k2.6 was 200 two minutes earlier → **logfare-side transient 503 capacity wobble**, not a k3 deployment gap and not an opt-in issue.
- **logfare chat/completions is currently in a sustained 503 outage** (all models, all elevated keys, all body shapes; `/v1/models` still 200). Upstream issue — nothing config-side fixes it. The non-opted-in #2 key is a dead probe account that 403s every premium model and wastes a router slot (flag for removal).

### [Zydit] Kimi K3 (`http://127.0.0.1:8788/zydit/v4`) — PHANTOM

- Key-router SYNTHETICALLY injects `kimi-k3` into the zydit/v4 `/models` roster via `addKimiK3ToZyditV4ModelsListing()` (hardcoded `created:1700000000` — matches roster entry; real zydit models use `created:1`/`1785361801`). zydit upstream `https://api.zydit.in/v4` **REJECTS kimi-k3** — live probe: `data: {"error":"All router keys failed"}`. Catalog note "probe-confirmed working 2026-07-16 + stream-strip shim" is STALE — the only shim is the listing injection, not a stream handler. No `providerModelRequestProfiles.zyditv4["kimi-k3"]` entry either. **Dead end — recommend removing the [Zydit] Kimi K3 catalog entry + `addKimiK3ToZyditV4ModelsListing`.**

### Key-router watchdog + logfare lane infra (2026-07-30)

- **Watchdog was DOWN ~1 day** (last log 2026-07-28T10:02); router unsupervised so the logfare lane failure never auto-recovered. **Started watchdog** (pid 29256, running) via `control.ps1 -Action watchdog-start`. Watchdog runs `ensure` every 20s.
- **Restarted router** (new PID, fresh process) — logfare lane did NOT recover because the router wasn't the problem: logfare chat/completions is upstream-503. The router's "fetch failed" = all-keys-non-200 (elevated 503 + probe 403 + others timeout), NOT a network wedge.
- **Watchdog health check probes nvidia kimi-k2.6 ONLY** → a logfare-only lane outage does NOT trip it, so the watchdog won't restart for logfare. logfare lane recovery is handled by the router's own ~30s route-backoff retry → **auto-recovers promptly once logfare restores chat capacity** (no manual action needed).

### Bottom line (corrected)

- "Not set correctly" was PARTLY true historically (logfare kimi-k3 had no key-router request profile → cold-stall). **Fixed 2026-07-29.** Remaining blockers: (1) **logfare chat/completions upstream 503 outage** (all models, waits itself out; auto-recovers via 30s backoff retry), (2) **zydit-v4 kimi-k3 phantom** (dead end). **Training-optin is NOT the kimi-k3 blocker on elevated keys** (they 503, not 403). Once logfare recovers, kimi-k3 should stream via router-logfare (config already correct, elevated keys cover it) → run find-and-fix-bug trial.

### Zydit v1/v4 untested graduation candidates

zydit-v4 is viable for profiled models (minimax-m3 graduated via it). Unprofiled models cold-stall (no stripToolStream). **Catalog cleaned 2026-07-30:** phantom `kimi-k3`/`kimi-k3-thinking` injection removed from key-router source + `settings.json` + `model-providers.json`; roster now 36 real bare-id models. A roster cross-ref also removed 53 dead phantom entries pointed at `/zydit/v4` and fixed 97 mis-pointed `/zydit/v4` entries to `/zydit/v1` (they are served by zydit v1, not v4). Added `providerModelRequestProfiles.zyditv4` entries for graduation candidates: `qwen3-coder-next`, `qwen3-coder:480b`, `devstral-2:123b`, `kimi-k2.5-thinking`, `glm-4.7`, `gpt-oss:120b`. Still to profile/trial once rate-limits clear: `kimi-k2-thinking`, `kimi-2.6-thinking`, `minimax-m2.5`, `nemotron-3-super`, `nemotron-3-ultra`.

Full breakdown: `tmp/w57-kimi-k3-diagnosis-2026-07-29.md` (updated with corrected per-key audit). Probe artifacts: `tmp/w57-kimi-k3-streaming-probe.mjs`, `tmp/w57-kimi-k3-followup-probe.mjs`, `tmp/w57-logfare-perkey-optin-probe.mjs`, `tmp/w57-logfare-body-shape-probe.mjs`.

## W71f-gate verification wave — 2026-08-04 (pathc-verify evidence)

Dispatch evidence from the deep-link determinism wave (see `tmp/pathc-verify-20260804/`):

- **`nvidia/z-ai/glm-5.2` (router-nvidia) — strong ANALYST, weak at finalizing.** Read-only search/url-state audit: correct deep interleaving analysis (owner-vs-piggyback lease release ordering, onMount `?q=` dedup, intentional SEARCH_FOCUS_REQUESTED double-fire) — all converged on "safe". **But:** with `timeout_seconds: 1200` it exited 124 mid-analysis with no final verdict (thinking-max burns the budget), and the followup resume died on provider connection errors ("Connection error" x7) re-loading its 8 MB context. **Recipe:** budget ≥ 1800s AND steer-to-finalize at ~60% (steer lands on the NEXT turn — it does not interrupt an in-flight reasoning turn), or plan to salvage the reasoning log and have the main lane author the report (worked well here).
- **`poolside/laguna-s-2.1` (router-poolside) — proven e2e DETERMINISM verifier.** Ran the W71/W71b deep-link journey 3× consecutive (fresh browser each) — 6/6 pass incl. the exactly-one-request invariant — plus a full-suite pass; wrote `REPORT.md` + run transcripts on its own. Reliable for repeat-run/verification loops; don't schedule it over a heavy concurrent suite (its full run hit a WebGL stack-overflow worker crash → 46 did-not-run; environmental).

## Full-provider health sweep + graduation wave — 2026-08-04 (W71f continuation)

User directive: health-test every available model/provider and graduate the viable ones to the subagent allowlist. Two phases: (1) batched chat-completions sweep of every router provider (`tmp/health-sweep-models.mjs`, `tmp/health-sweep-logfare.mjs`, `tmp/health-sweep-zydit.mjs` — 92 probes total, `max_tokens: 24/256`, PONG echo check, 15–60s timeouts); (2) real Pi-harness graduation trials (read package.json → count → write report → sentinel). Ground truth at probe time: `deps=1 devDeps=28 scripts=137` (note: **137, not the 136 used in earlier batches** — one script added since; treat old `scripts=136` verdicts as ±1).

### New graduations (clean e2e, Pi harness)

- **`infron/poolside/laguna-s-2.1:free` ✅ subagent-viable 2026-08-04** (route `pi:router-infron/poolside/laguna-s-2.1:free`, genuinely free $0.00). Boot → read → write report → sentinel `GRAD TRIAL DONE infron-laguna21free`, `exit_code: 0`, `stop_reason: stop`, **all 3 counts exact** (deps=1, devDeps=28, scripts=137), 10 thinking blocks, ~4.5 min (worker id `ocw_418f1d30`). Note: the rest of infron's catalog is dead for us (403 "credits used up" / 429 "free model requires account balance > $4.99" on every other `:free` ref — only laguna-s-2.1:free is accessible). **Adds a second free laguna carrier** alongside `poolside/laguna-s-2.1` (router-poolside).

### Transport-viable but imprecise (count-drift class)

- **`cloudflare/@cf/mistralai/mistral-small-3.1-24b-instruct` ⚠️ 2026-08-04** (route `pi:router-cloudflare/...`). Loop perfect (boot → read → write 29B report → sentinel, `exit_code: 0`, `stop_reason: stop`), but scripts=136 vs 137 (off-by-one; deps/devDeps exact). **Not free**: $0.0057/run. Same mistral-family count drift as other mistral IDs; usable for transport-cheap audits where ±1 on a count is acceptable, not for exact-count work.

### Failed / not viable (new evidence)

- **`groq/llama-3.3-70b-versatile` ❌ 2026-08-04 — 413 TPM ceiling, not subagent-viable.** Chat probe is instant (174ms PONG), but the Pi harness system prompt (~43.3K tokens) exceeds Groq's free-tier on_demand **12K TPM** limit → 413 `rate_limit_exceeded` before any assistant output (worker `ocw_d07db677`). Entire groq lane is chat-only for us; the same cap applies to `groq/qwen3.6-27b` / `gpt-oss-*`. Do not dispatch subagents on groq.
- **`neuralwatt/*` ❌ NOT launchable for subagents 2026-08-04** — router chat probes healthy (`glm-5.2-fast` PONG 17.6s, `glm-5.2-short-fast` PONG 17.6s) but the external-subagents launch allowlist has **zero `neuralwatt/` refs** (`external_subagent_free_models` confirms 0). Bare `z-ai/glm-5.2-fast` **resolves to infron**, not neuralwatt — and the infron glm-5.2-fast trial died 403 insufficient-quota (worker `ocw_161db2d2`, infron only serves us `laguna-s-2.1:free`). Dead for dispatch until the allowlist is extended (likely next model-providers regeneration).
- **`zydit/v4/*` ❌ mostly dead 2026-08-04** — `minimax-m3`, `minimax-m2.5`, `glm-4.7`, `gpt-oss:120b/20b` → 404 "Not Found"; `kimi-k2.5`, `devstral-2:123b`, `qwen3-coder-next` → 429 HTML error page. Only `kimi-k2.6` returns 200 (but empty content at 256 tokens — likely silent/phantom). Treat v4 catalog as phantom until re-verified.

### Health-sweep results by provider (chat-level, 2026-08-04 15:40Z)

| Provider                                                                        | Status                                                                                                                                                                                                                                   | Verdict                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| logfare (11 models)                                                             | **ALL DOWN** — 5× timeout ≥45s (deepseek-v4-flash/-0731/-pro, glm-5.2, kimi-k2.6, kimi-k2.7-code), 6× 429 upstream-backoff (kimi-k3, minimax-m3, qwen-3.6-35b-a3b, kiro-auto, qwen-3.8-max)                                              | Fully degraded again; upstream-side. Check before any logfare dispatch; do not retry storm.                                                                               |
| zydit v1 (8 models)                                                             | **4 HEALTHY**: inkling PONG 3.2s, z-ai/glm-5.2 PONG 18.2s, stepfun-ai/step-3.7-flash PONG 1.5s, poolside/laguna-xs-2.1 PONG 682ms; deepseek-v4-pro PONG 55.8s (slow); deepseek-v4-flash 529; kimi-k2.6 404; minimaxai/minimax-m3 timeout | v1 lane alive again — inkling/glm-5.2/laguna-xs-2.1/step-3.7-flash are launchable via `zydit/...` refs. Was previously "untested candidates" (§W57) — now chat-confirmed. |
| neuralwatt (9)                                                                  | glm-5.2 family OK (17–20s), kimi-k2.7-code 404, qwen3.6-35b 410 (EOL), deepseek-v4-flash 401 no-payment, gemma-4-31b 402                                                                                                                 | Chat-healthy for glm-5.2/fast/short-fast/flex; unlaunchable (see above)                                                                                                   |
| llm7 (12)                                                                       | gemini-3.5-flash-low PONG 1.2s, minimax-m2.7 PONG 2.1s, deepseek-v4-pro PONG 7.3s; most others 402 insufficient balance (Inkling, MiMo-V2.5, gpt-5.6-_, grok-4.5), kimi-_ 404                                                            | Partial lane: 3 healthy models; rest credit-gated.                                                                                                                        |
| groq (4)                                                                        | llama-3.3-70b-versatile PONG 174ms, qwen3.6-27b PONG 236ms, gpt-oss-120b/20b 200 (empty @24 tok)                                                                                                                                         | Chat-fast; TPM-capped for subagents (above)                                                                                                                               |
| cloudflare (4)                                                                  | mistral-small-3.1 PONG 381ms; qwen3-30b-a3b-fp8 200/497ms, nemotron-3-120b 200/1s (empty @24 tok); kimi-k2.6 403 (not on free plan)                                                                                                      | mistral-small usable (imprecise); others token-hungry                                                                                                                     |
| novita (10)                                                                     | **ALL 403 "not enough balance"**                                                                                                                                                                                                         | Lane dead for us (credit-gated)                                                                                                                                           |
| infron (12)                                                                     | laguna-s-2.1:free PONG 2.9s; everything else 403 credits-up / 429 $5-balance-gate                                                                                                                                                        | One-model lane (graduated above)                                                                                                                                          |
| openprovider (1)                                                                | glm-5.2 429 backoff                                                                                                                                                                                                                      | Degraded                                                                                                                                                                  |
| zenmux (5)                                                                      | z-ai/glm-5.2 PONG 19.4s; glm-4.7-flash-free 200/13.5s; kimi-k3 404; qwen3.8-max 410 (EOL); deepseek-v4-flash-free timeout                                                                                                                | glm-5.2 viable (slow); flash-free still alive                                                                                                                             |
| mistral (4)                                                                     | mistral-medium-3.5 PONG 657ms, magistral-small-latest PONG 1.1s, codestral-2508 PONG 361ms, devstral-latest PONG 418ms                                                                                                                   | All healthy; medium-3.5/codestral-2508 are new confirmed IDs                                                                                                              |
| opencode-zen / nvidia / kilo / openrouter / zydit / agnes / poolside / zydit-v4 | n/a this sweep (already documented)                                                                                                                                                                                                      | see existing entries                                                                                                                                                      |

### Notes

- `max_tokens: 24` produces `finish=length` empty content on reasoning models (thinking burns the budget) — re-probe at 256 tokens before declaring a 200 dead. `zydit` inkling/glm-5.2/step-3.7-flash looked empty at 24 and PONGed cleanly at 256.
- groq 413 message pins the exact ceiling: "Limit 12000, Requested 43330" — a documented, stable limit worth remembering before anyone tries groq again.
- `z-ai/glm-5.2-fast` (bare) routes to **infron**; if a fast glm-5.2 variant is needed, prefer `nvidia/z-ai/glm-5.2` (graduated) or accept infron routing.
- Sweep scripts + outputs archived under `tmp/health-sweep-*.mjs`; grad reports under `tmp/grad-*-report.md`.

### Gap-sweep addendum (2026-08-04 16:10Z) — providers missed by the first pass

First sweep missed four keyed providers (gemini's `/v1/models` uses a different JSON shape so it appeared empty; modelscope/kilo/freemodel had recent failures and were skipped). Follow-up probes (`tmp/health-sweep-gaps.mjs`, 256-token budget):

- **`gemini/*` ✅ ALL HEALTHY 2026-08-04** — 3 keys, previously NEVER swept (my first catalog call assumed OpenAI `data[]` shape; gemini returns `models[]`). `gemini-3.5-flash` PONG 2.6s, `gemini-3.1-flash-lite` PONG 1.2s, `gemini-2.5-flash` PONG 734ms. **Launchable via `gemini/...` refs (verified in launch allowlist). New primary-quality lane (Google first-party models, 1M ctx, free via our keys).** Subagent graduation trial still pending — chat-healthy but not yet grad-trialed.
- **`modelscope/*` ✅ RECOVERED 2026-08-04** — was "quota-dead" per §W57 (401/429 exhausted), but now: `zai-org/GLM-5.2` PONG 3.4s, `Qwen/Qwen3.5-35B-A3B` PONG 7.2s, `Qwen/Qwen3-Coder-30B-A3B-Instruct` PONG 1.2s. Only `deepseek-ai/DeepSeek-V4-Flash` fails (400 "no provider supported"). **The W57 quota-death verdict is OVERTURNED — modelscope is back.**
- **`kilo/*` ✅ HEALTHY 2026-08-04** — `kilo-auto/free` PONG 2.1s, `kilo/inclusionai/ling-3.0-flash:free` PONG 1.6s, `kilo/nvidia/nemotron-3-ultra-550b-a55b:free` PONG 1.4s. The 14:56 502 was transient (routeBackoff expired). Existing kilo entries stand.
- **`freemodel/*` ❌ STILL DEGRADED 2026-08-04** — `gpt-5.6-luna` 401 invalid token, `gpt-5.6-sol`/`terra` 429 (single key on ~6h cooldown, `nextReadyInMs≈21.6M`). Only `freemodel/gpt-5.6-luna` had a prior graduation (2026-07-29); the whole lane is currently unusable — key needs attention.
- **9 configured-but-keyless providers (0 keys — dead until keys are added):** `bazaarlink`, `ainative`, `deepseek`, `siliconflow`, `together`, `cerebras`, `cohere`, `hyperbolic`, `aimlapi`. Router exposes the routes (404/empty catalogs) but there are no API keys to serve them. Do not attempt dispatch on these; re-check router `/health` if keys ever appear.
- Also confirmed: `gemini-3.5-flash` and `modelscope/zai-org/GLM-5.2` looked empty at 24 tokens and PONG cleanly at 256 (same reasoning-burn pattern as zydit — the 256-token rule applies everywhere).

### Vision worker-path re-probe (2026-08-05, post pi-model-providers harness fix)

The subagent worker `read`-path was silently dropping images before 2026-08-05 (bare {id}
catalog rows -> input:[text] -> openai-completions stripped image parts). After the
visionInputFromModelId fallback fix, a 6-lane worker-path probe found:

- WORKER-VISION ✅ `modelscope/Qwen/Qwen3-VL-235B-A22B-Instruct` — PIXELS OK ×2 (real phone # read)
- WORKER-VISION ✅ `zenmux/stepfun/step-3.7-flash` — PIXELS OK (real phone # read)
- TEXT-ONLY (worker path) `zenmux/sapiens-ai/agnes-2.0-flash` — VISION UNAVAILABLE (read says image/bytes)
- BILLING/LANE `zenmux/z-ai/glm-4.6v-flash-free` — 429 insufficient_quota (Aliyun)
- DEAD 404 `openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`
- INVALID 400 `zenmux/mimo-v2.5-free` model not valid this routing
- 429-UPSTREAM `openrouter/google/gemma-4-26b-a4b-it:free`

Rule change: with the harness fixed, "VISION UNAVAILABLE" now means TEXT-PATH, and provider
errors (429/400/404) are honest failures. The earlier confounded "19 stable lanes" sweep
should be re-validated on the worker path before trusting a lane for subagent vision work.

### Registry coverage correction (2026-08-05)

The external-subagents broker previously described the Qwen settings plus the parent-router
catalog as exhaustive. That was incomplete. The current inventory contract reads seven local
registry surfaces: Qwen settings, Pi model providers, Pi native models, the Pi model store, and
the three OpenCode config locations. It reports source provenance, duplicate records, unmapped
entries, protocol type, catalog status, and Pi launch status separately.

The broker also parses the key-router source definition: 31 carrier routes, including the
keyless welfare lanes (`deepseek`, `siliconflow`, `together`, `cerebras`, `cohere`, `hyperbolic`,
and `aimlapi`) plus the `clinefree` route, and the 8-entry V2 routing overlay. Overlay quality
labels are advisory and do not establish live model availability.

Important routing rule: a provider-qualified ref must resolve to a registered Pi provider/model
pair. If it does not, the broker refuses to substitute another provider with the same model ID.
FreeInference remains visible in inventory but excluded from external-subagent launch refs;
Anthropic-only records are not probed as OpenAI `/models` routes. Re-run the broker inventory
smoke after provider-registry or router changes, then restart the external-subagents MCP before
using the live tool descriptions.

The inventory now also reports the active auto-shard policy, disk-backed router cooldown/
rotation/failure state (counts and observed model IDs only), the broker's static fallback
tables with static-only refs, and the Pi model-provider extension's built-in metadata and
runtime route adapter. These are separate evidence layers: runtime state is not a model
catalog, static refs are not launch proof, and the Pi adapter must still register the selected
provider/model pair before a provider-qualified launch ref is accepted.

## 2026-08-06 correction: kimi-k3 family is NOT route-mapped despite registry claims

- Registry `external_subagent_free_models` listed kimi-k3 (zenmux/novita/infron) with
  `route_status: {ok:true, key_configured:true, status:200}` — a completion probe
  returns **404** (zenmux) / **403** (novita). `/v1/models` lists ZERO kimi ids.
- LESSON: free*models' route_status reflects \_catalog* entries, not runtime mapping.
  Always verify a candidate lane with a 2-token chat probe before dispatching work.
- TokenRouter now lists `tokenrouter/moonshotai/kimi-k3-free` and
  `tokenrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` as cataloged and
  launchable. A real Kimi K3 Pi worker smoke still failed all three attempts with
  zero tokens and `Connection error`; classify the route as catalog-visible, not
  execution-healthy. Nemotron remains unbenchmarked and unprobed.
- Verified live this wave: `zenmux/deepseek/deepseek-v4-flash-free` → 200 (use it
  for future telemetry/audit workers), `opencode-zen/deepseek-v4-flash-free` → 200.

## Verified-dead lane probe table (2026-08-06, live key-router on 8788)

Probe method: POST /<real-segment>/v1/chat/completions {model:"<id>", max_tokens:2}, timeout 15s.
Real segments: opencode-zen, zenmux, poolside, zydit, novita (NOT the catalog prefixes opencode/qwen/openai).
NOTE: these are dead at the PROVIDER/BILLING layer (our config listing is inert — a map, not a cause).

| lane                                | segment               | status    | why dead                           |
| ----------------------------------- | --------------------- | --------- | ---------------------------------- |
| hy3-free                            | opencode-zen          | 401       | key credits exhausted              |
| qwen3.6-plus-free                   | opencode-zen          | 401       | key credits exhausted              |
| kimi-k2.6                           | zenmux / novita       | 404 / 403 | model removed / key not authorized |
| gpt-5.6-sol, gpt-5.6-terra          | zenmux (openai/)      | 402       | paid-only, never free              |
| gpt-oss-20b:free, gpt-oss-120b:free | zenmux                | 404       | removed                            |
| laguna-xs-2.1-free                  | opencode-zen          | 401       | key credits exhausted              |
| nemotron-3-super-free               | opencode-zen          | 401       | key credits exhausted              |
| deepseek-v4-pro-free                | opencode-zen          | 401       | key credits exhausted              |
| deepseek-v4-flash-free (CONTROL)    | opencode-zen + zenmux | 429       | LIVE, quota-lagged (do not prune)  |
| mimo-v2.5-free (CONTROL)            | opencode-zen          | 429       | LIVE (do not prune)                |

CAVEAT: 401/429 rotate with keys/quota — re-probe before relying on "dead". 402/403/404 are stable.

## 2026-08-07 operational lessons (fleet sweeps, logfare workhorses)

### Two-lane redundancy dispatch pattern

For sweep seams where a miss is expensive (engine/state/keyboard), dispatch TWO lanes on the
same read-only seam: the primary workhorse (`logfare/deepseek-v4-flash-0731`) plus a
cross-check lane (`logfare/deepseek-v4-pro`). The workhorse verdict is authoritative; the
second lane's report is a cross-check against missed findings. Cons: only dispatch both when
the seam is high-value — the pattern costs double tokens for a converge-difference check.
(Origin: search-bugsweep W60/W61 "two-lane redundancy protects against transient model
failures".)

### kind-1 failure mode (reports without diffs) — always inspect the diff, not the report

Workers frequently settle having written `tmp/*-REPORT.md` while the actual source diff did
NOT land (or landed partially). Lesson: after any fix-worker settles, verify with
`git diff --stat <scoped files>` + read the diff hunks. Do not trust the REPORT body. This
session caught 3 kind-1s (banner-focus, unicode-highlight, boot-event) — re-did the work
main-lane.

### Provider lockout symptom 2026-08-07 (flight-recorder evidence)

Three simultaneous wave-5 workers settled with ZERO deliverables (no report / no docs write)
at ~10 min. `flight_recorder status/tail` revealed deepseek-v4-flash-0731 provider responses
struck at 408s / 161s / 5,414s (90 min) — the workers were starved into empty settles, not
model failures. Recovery: `external_subagent_followup` on the SAME session_id with a firm
"you DO have tools, execute now" directive. If the provider remains hot, prefer main-lane for
small deterministic docs tasks (do docs yourself rather than re-dispatching).

### Provider metric: doc-writing / small deterministic edits

Flash-class models (deepseek-v4-flash) drift on multi-paragraph docs (one drifted into
explaining OpenCode Zen billing instead of writing the doc). For doc updates < 1 page, do
them main-lane or give the worker a byte-budget + a paste-only target.

### Dead-model roster (do NOT re-add; measured 2026-08-06/07)

- `grape-2-pro` — talks then settles, ~75 tokens (useless for agentic work) [2026-08┐11: 4× exit-0-noop fatal — warm-standby only, never dispatch execution or analysis].
- `glm-5.2`, `kimi-k2.6/k3`, `qwen-3.8-max`, `kiro-auto` — silent-settle / wedge after probe-ok.
- `kilo/openrouter/owl-alpha` — dead lane, do not re-add.

### Rail split (measured 2026-08-08): logfare bare-chat vs cline agent loop

- Same model (deepseek-v4-flash family) on two rails, same task class (God-files split):
    - **logfare bare chat (direct-mcp-worker)**: w28 got the task, echoed the 1138-line
      file 4×, then 0 tool calls, settled into a generic "Svelte 5 is at v5.56.8"
      tutorial as its final answer. Ear-0-tool derail on big in-context task blobs.
    - **cline agent loop (cline-shim)**: same model retains the task frame, does
      real tool excavation (reads callers, event subscribers).
- Lesson: flash-0731's head-context decay (measured: fails early-fact recall in
  a 40-turn needle test, deepseek-v4-pro does not) is _harness-framing-dependent_ —
  it bites as a bare one-shot chat but the same weights work inside cline's agent
  loop. **Default long/code work to cline; keep logfare only for short/simple or
  vision tasks.**

### Task-shape lemma (measured 2026-08-08, w28-w32)

Delegation success is dominated by TASK SHAPE, not rail or model:

- w11-w25 (bounded per-finding fixes: "close M1-M6", "second safety valve",
  "converge surface+phase") — all committed, verified, green.
- w28-w31 (open-ended sweeps: "split 1138-line file", "hunt 6 categories
  across 7 files") — ALL failed on both rails (logfare flash: 0 tools + settle;
  cline flash: narration-only; cline glm-5.2: launch 502; pro: pending).
- The swarm mirrors the prompt's premise. Verify the task's premise against
  the real module graph BEFORE dispatch (url-state.ts "pure helpers" were
  store-entangled — the split was a bad task, not just a bad model).
- Rule: dispatch = per-finding bounded fixes with file:line targets + exact
  verify commands. Open-ended sweeps = main-lane, or pre-hunt the seam
  main-lane first and delegate only the confirmed findings.

### Camera-choreography sweep result (main-lane, 2026-08-08)

Main-lane sweep of all 7 camera files (the w29/w32 delegation target):

- All 16 public exports have callers (no dead code).
- Events all via typed EVENTS bus (no orphan/string events).
- zoomCamera: finite-guards + distance clamping correct.
- Two-writer race: only choreography writes camera.position; controls only
  read (no external writers). The P1 centroid re-arm guard already landed
  2026-08-07. NO new HIGH/MED findings — subsystem is clean.
- Lesson: w29/w32 "let me verify" narration chased a recently-hardened
  subsystem. Sweep verdicts must be main-lane-confirmed; a negative sweep is
  a valid deliverable.

### CORRECTION: prescription vs discovery (2026-08-08, supersedes task-shape lemma)

w33 falsified "bounded = reliable": a bounded 3-file conversion ALSO failed
(narrated analysis, zero edits). The real differentiator across 11 dispatches:

- PRESCRIPTION prompts (w11-w25): file:line + exact defect + exact fix
  ("remove aria-activedescendant from SearchInput.svelte:294-298") → COMMITTED,
  verified, green. The model executes precise edits reliably.
- DISCOVERY prompts (w28-w33): any task requiring the worker to READ code,
  DECIDE what to change, then write it — even with a bounded file list —
  → narration-only, zero tool calls, zero edits. On every model+rail tried.

Rule: delegate ONLY prescription-grade fixes (exact file:line + exact change).
Anything requiring design judgment (test conversions, refactors, sweeps)
= main-lane. The external-subagent fleet is an edit-executor, not an engineer.

### FINAL: step-count boundary (2026-08-08 — reconciles all w28-w34 data)

The external-subagent harness executes SINGLE direct commands but NOT
self-directed multi-step work. Verified across every variable:

- PROBE tasks (one command, then stop): kiro-auto ✅ executed, minimax-m3 ✅
  executed (files created, exit 0). Model/rail irrelevant.
- MULTI-STEP tasks (read → decide → edit → verify → commit): w28-w34 ALL
  narrated — flash-0731, pro, minimax-m3, cline, logfare, bounded or not.
  Even minimax-m3 (6/6 tool_calls at API level) narrated in the harness.
- Tool-support matrix (API-level, via router): minimax-m3 6/6, 0731 4/6,
  pro 3/6, plain flash 0/6, grape 0/6. BUT harness multi-step fails on all.

Rule (final): subagents = single-command executors (probe/one-edit tasks).
Any read-decide-edit-verify-commit loop = main-lane. The fleet cannot be
an engineer, only a finger. Prescription prompts do not rescue it.

### LIVE logfare subagents (probe-verified 2026-08-08) — execution-proven

Probe = "run EXACTLY this one bash command, create file, report". File-on-disk
is the execution proof (not the reply text).

- minimax-m3 ✅ probe file + exit 0 (also 6/6 tool_calls at API level) ← best
- kiro-auto ✅ probe file + exit 0
- kimi-k3 ✅ probe file + exit 0 (~4min thinking first — be patient)
- qwen-3.6-35b-a3b ✅ probe file + exit 0 (~4min thinking first)
- glm-5.2, kimi-k2.7-code, qwen-3.8-max ❌ 429 "upstream rate-limited model X"
  — logfare throttles these routes (3 auto-retries, all fail). NOT launchable
  from this account right now.
- deepseek-v4-pro: API 3/6 tool_calls — flaky, no probe execution.
- deepseek-v4-flash-0731: 4/6 — flaky. plain flash/grape: 0/6 dead.

Use: minimax-m3 for anything multi-turn; kiro-auto for cheap quick tasks;
kimi-k3/qwen-3.6 for reasoning-heavy one-shots (long thinking budget).
Avoid: pro/flash routes (flaky tools), 429 models (until rate limit clears).

### CORRECTED live matrix (2026-08-08, burst-free sequential probes)

Earlier "flaky/dead" verdicts were CONTAMINATED by self-inflicted burst load
(5 concurrent probes + 11-model API sweep with 0.5s spacing → tripped logfare
rate limiter). Clean sequential re-test (one worker at a time, spaced):

LIVE (execute commands in the harness):

- minimax-m3 ✅ + completed a real write→verify→commit (w35)
- deepseek-v4-pro ✅ (doc's "workhorse" was right; earlier ❌ was burst)
- deepseek-v4-flash ✅ (API sweep 0/6 was burst-wrong; harness executes)
- kiro-auto ✅ / kimi-k3 ✅ / qwen-3.6-35b-a3b ✅
- deepseek-v4-flash-0731 ✅ **STRONG** — real-task verified 2026-08-08: read file,
  found both blocks, removed the dead `outline: none` (commit 1a3ee3d0, exact
  surgical edit), ran the verify suites pre-commit. The earlier "claims-not-
  executes" verdict was a ONE-COMMAND-PROBE ARTIFACT — 0731 is the primary
  workhorse (see below). Probe verdicts do not predict task quality.

THROTTLED now (account-level, may clear): kimi-k2.7-code (25×429),
qwen-3.8-max (39×429). NOT dead — retry later.
SILENT: glm-5.2 (0 bytes no-op — NOT the 429 I mislabeled it).

Rule: verify a probe file on disk, never the reply text. Prefer minimax-m3
or pro for real tasks; flash works for quick probes.

### Quality survey (2026-08-08, real task: L3 a11y cleanup)

Same bounded task to 4 routes; judged by DELIVERABLE + reasoning quality (not
probe files — probes misled me on 0731).

| Route                  | Verdict   | Evidence                                                                           |
| ---------------------- | --------- | ---------------------------------------------------------------------------------- |
| deepseek-v4-flash-0731 | ✅ STRONG | committed the real fix (1a3ee3d0) surgically, verified pre-commit                  |
| kimi-k3                | ✅ STRONG | "no change needed" — verified post-fix file, refused blind edit, selector analysis |
| deepseek-v4-pro        | ✅ GOOD   | "no change needed" + 28/28 tests, commit N/A (honest)                              |
| minimax-m3             | ✅ STRONG | detected the fix already at HEAD (1a3ee3d0), full state analysis, verifying        |

**Quality rule:** all 4 quality lanes made the RIGHT call (fix or correct no-op);
probe-probes are not predictive of task quality. 0731 re-proven as primary
workhorse. The "which lanes NOT to run" answer: glm-5.2 (silent no-op), the
429-throttled (kimi-k2.7-code/qwen-3.8-max) until limiter clears.

### Freeze ≠ death (2026-08-08, w37 close call)

w37 (0731) looked frozen (bytes static, no tool events, still "running") — I
killed it main-lane... then found its COMPLETE fix already committed (f05ed2a4)
the byte-freeze was POST-commit (the worker had delivered; the driver just
never flushed CLIENT-END). My kill was wrong.
LESSON: verify by GIT LOG + FILE STATE before killing any stalled worker.
A "frozen" worker can have a landed commit. Prefer: check git log HEAD, check
the target file's diff, then kill.

Concurrency: 3 concurrent logfare lanes (0731+k3+pro) on the shared account →
all three entered [willRetry] loops (k3+pro were killed legitimately; 0731
survived to commit). Lesson: logfare lanes run SEQUENTIALLY, not in parallel
(the earlier burst lesson applied to fewer lanes than I tested). 2 lanes may
still contend; 1 at a time is safest for heavy reasoning work.

### Wave-g live roster check (2026-08-09, sequential probe)

Re-probed all known models; logfare account reportedly unlimited now.

| Model                                 | Probe                   | Verdict                                                                                               |
| ------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| **grape-2-pro**                       | LIVE (11.4s TTF)        | 🆕 **NEW model** — trial lane this wave (dead-import audit of src/components, main-lane jury via w45) |
| deepseek-v4-flash                     | LIVE (6.5s)             | healthy base lane                                                                                     |
| deepseek-v4-flash-0731                | proven (quality survey) | primary workhorse                                                                                     |
| minimax-m3 / kimi-k3 / pro / qwen-3.6 | proven                  | quality lanes                                                                                         |
| kimi-k2.7-code                        | 45s timeout             | ❌ throttled/backed-off                                                                               |
| qwen-3.8-max                          | 45s timeout             | ❌ throttled/backed-off                                                                               |
| glm-5.2                               | 45s timeout             | ❌ still silent no-op                                                                                 |

Roaster decision policy: launch the new model on a REAL bounded task + independent
jury review (grape-2-pro ← w45 minimax review of its report/diff); replace an inept
lane with proven quality lanes. Dead now: grape-2-pro verdict pending; k2.7/qwen-3.8/glm
removed from dispatch rotation until probes recover.

### grape-2-pro trial verdict (2026-08-09, w43)

NEW model on logfare (created 2026-08-07). FIRST REAL TASK = dead-import audit
trial. Result: **ZERO tool calls across TWO launch attempts** — both instances
emitted an opening narration block ("I'll perform a comprehensive dead-import
audit...") then agent_end'd without invoking read/grep/bash, produced no report,
no commit, exited "completed". stderr clean; willRetry=false; no provider error.

VERDICT: **not a tool-executing lane yet** — "claims-not-executes" confirmed by
task evidence (not probe prediction). The 0731 lesson stands reversed: 0731
Eventually executes and commits; grape never did in 2 trials. REPLACED in wave-h
by deepseek-v4-flash (w46, same task). Re-trial grape-2-pro only after a model
update / with a trivial tool-forcing prompt (e.g. "run ls and report"), and judge
on whether it executes.

### Provider wall at 3-way concurrency (2026-08-09, wave w44+w45+w46 — measured)

User said "don't worry, provider is unlimited"; the same shared logfare account
was run with 3 concurrent lanes anyway to measure. Result — **all 3 froze at the
same instant** (all stdout.logs mtime-identical at 17:40:30):

- w44 (0731, trail contract): frozen on bare `{"type":"turn_start"}` — mid turn.
- w45 (minimax, components audit): `auto_retry_start attempt 1/3, "Request timed out."` never advanced.
- w46 (deepseek-v4-flash, engine audit): same `auto_retry_start 1/3` freeze.
  All drivers CLIENT-ENDed at their 900s timebox after that. ZERO deliverables
  from the whole wave (no commits left, no test file on disk).
  LESSON (measured, 3rd occurrence): 3 concurrent logfare lanes = all-land
  freeze, even when the account reports unlimited. The "unlimited" claim does
  not extend to concurrent agent turns surviving. **Correct op: logfare lanes
  run SEQUENTIALLY (1 at a time), relaunching losers as singles.** w44-again
  relaunched solo as w44b (0731) — the proven workhorse.

### Router odown — the "rotate" directive needs a provider-health pre-check (2026-08-09)

After the w44b (0731) mute (thinking streamed, 0 tool calls) and w44c (minimax)
boot-stall, probe of 127.0.0.1:8788/logfare/v1/chat/completions timed out at 15s
while :8788 stayed LISTENING (pid 32524). Conclusive: the logfare router's
upstream completion calls hung — a PROVIDER failure, not a model failure.
ROTATION RULE UPDATE: "when a model doesn't work, rotate" MUST first confirm
the provider answers a trivial probe (models endpoint OK ≠ completions OK —
completions were the hang). If the router is wedged, no model rotation helps;
pause the fleet and retry the probe until it recovers (or restart the router
process if owned). Keep ONE parked slot, don't spin lanes into a dead upstream.

### Flapping provider (2026-08-09, 2 wedges in 40min — measured)

18:39 local: w44d (0731) was GENUINELY executing (23 tool_call, real reads of
lifecycle/a3-2-focus-trap/vitest-config) when its stream died mid-thinking
(process gone, log frozen at 1.56MB). Direct probe right after: completions
timeout 15s. This is the 2nd wedge of the session (~23:09 recovery, then re-wedge
~23:40). Earlier "rotate" wins (0731 fruit) only because the router was UP then.

FAILURE-MODE MAP (3 distinct, all measured):

1. WEDGE-freeze: router accepts, completions hang; worker process STAYS alive,
   thinking streams, tool calls invisible → looks like "prose-loop" (w44b).
   Fix: probe completions (not models), wait for recovery.
2. WEDGE-kill: same upstream hang kills the worker process itself → log frozen
   mid-delta, 0 mmx procs (w23.4). Fix: relaunch after sustained recovery.
3. Model non-execution: no tool use even with router healthy → real rotate signal.
   So far only grape-2-pro showed this (0/2 attempts).
   Date: two router tests at interval; DO NOT spend a token on a rotation while
   completions endpoint answers with timeout. Park until 2 consecutive probes OK.

### Provider gate at dispatch time (2026-08-10, 00:49 UTC)

Two consecutive completion probes FAILED (20s/15s timeouts) right when the
url-state audit (w47, k3) was about to dispatch. Applied the recorded rule:
DO NOT launch into a flapping endpoint. The url-state prompt is written at
tmp/w47-urlstart-prompt.txt and waits; dispatch resumes on 2 consecutive OK.
Third wedge of the session — the logfare completion upstream is in a
sustained bad window (00:40-00:50 UTC span, previously recovered 23:09-23:40).
No lanes spinning, no tokens wasted.

### Pro's orphan sweep is a DEAD END (2026-08-10)

tmp/\_orphans.json (pro css sweep artifact) lists 18 "orphan modules" — but
12 of the paths DO NOT EXIST in this repo (src/lib/focus/anchor-indicator.ts,
state/mutators.ts, search/mock-catalog.ts, types/events.ts, ui-renderers.ts
etc. all absent with a clean find). The list was generated against an
imagined/stale tree. Do NOT dispatch lanes on that file. The real orphan-hunt
(if wanted) must regenerate from a correct file inventory first.

### Logfire slow-not-dead: the 45s first-token trap (2026-08-10, root-caused)

SYMPTOMS: all completions hung (15-60s probes failed); w44/w47 lanes mute/retry-
spun. Blamed "router down" — wrong on both ends.
ROOT CAUSE (proven by router log + long probe):

- key-router pid 32524 served /models fine but its stream log showed
  `first_patch_ms=47874` — upstream ACCEPTS (headers 1s) but the first line
  arrives ~48s for real messages.
- A CLEAN 150s probe of logfire completions returned **200 in 44.7s** for a
  1-token "OK" (vs 2s normal and 2.0s for OpenCode Zen).
- So logfire is ALIVE but ~20x slower than normal right now — the traces
  that "timed out" (15-60s) were simply shorter than logfire's real latency.

**The router restart DID help** (old worn pid → new healthy pid 22724 with
working slot rotation). The lingering slowness is logfire-side (queue/GPU).

**RULES ADDED:**

- Never conclude "provider down" from a sub-60s probe of logfire — it can be
  alive at 45s TTFT. Use a 90-150s probe or cross-check a second route.
- Failover for time-sensitive lanes: **OpenCode Zen /opencode-zen/v1 answers
  in ~2s** — route model `opencode-zen/deepseek-v4-flash-free` works.
  w47b (url-state audit) dispatched on this route 2026-08-10 01:42.

### Lane taxonomy + quality ROLES (user directive 2026-08-10)

Roles are prompt-shaped, not backend roles — external-subagents has ONE
start tool; role = model + prompt template. All roles run on LOGFARE
(cline fallback; never zen/nvidia).

| Role           | When it adds quality                                                                                                                              | Model default       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| EXECUTOR       | does the bounded fix/audit                                                                                                                        | 0731 (proven)       |
| PLANNER        | decomposes a big/ambiguous task into explicit steps + expected evidence BEFORE the executor runs (prevents the 25-tool re-derivation death)       | kimi-k3             |
| REVIEWER/JUDGE | independent verdict on the executor's deliverable vs the success criteria (catches self-flattering FPs — measured: w42 caught the focus-trap lie) | qwen-3.6 or minimax |
| READER         | cheap parallel documentation/API/websearch gathering to feed a decision (uses websearch MCP if needed)                                            | deepseek-v4-flash   |

Flow to use: PLAN (only for tangled tasks) → EXECUTE (logfare, bounded) →
JUDGE (independent, checks git diff not the executor's claims) → main-lane
verifies gates once.

### Provider landscape (2026-08-10, gate wave)

- **logfare**: flapping all session — OK windows ~20-40min, then wedges kill
  long runs (w44b/w44d/w48/w50/w51 all died mid-2); solo short tasks OK in
  healthy windows. Parked fast lanes on it; smoke (scripts/logfare-per-model
  -smoke.mjs) will quantify which models survive a bounded launch NOW.
- **NVIDIA NIM** (/nvidia/v1): healthy 200/0.7s — used for the gate wave
  (w50b minimax, w51b glm). Route string nvidia/<model>.
- **cline** shim: fallback for tool-free/simple lanes.
- Smoke runner committed 4ab8b471: 11 logfare models × bounded getViewportSize-
  export verification worker, sequential, judge by tm2/smoke-REPORT.md.

### Logfare auth-wall (2026-08-10 ~03:25, measured): 9/11 models HTTP 403/401

Full per-model live probe: minimax-m3 403, deepseek-v4-pro 403, deepseek-v4-flash
401, deepseek-v4-flash-0731 401, kimi-k3 403, kiro-auto 403, glm-5.2 403,
kimi-k2.7-code 403, qwen-3.8-max 403, grape-2-pro 403, qwen-3.6 timeout.
So the earlier "flapping" was likely the BEGINNING of an auth/credit deplete;
now the router rejects launches outright. The per-model smoke (4ab8b471) will
record this as UNAVAILABLE for most, EXECUTING only if a window reopens.
Action when smoke runs: treat any live model as the current usable lane; file
the auth-state to the user; NVIDIA stays the fleet workhorse until restored.

### Logfare state — SERVICE-side (200-403 + SSE "Service temporarily unavailable") 03:31 UTC

Deeper diagnosis via router log: health probes return "Logfare upstream status
200 on key slot 1/6", but real generation streams error "SSE error ... Service
temporarily unavailable", and direct HTTP probes return 403/401 (this is
logfire rejecting its key slots / quota state — NOT a missing credential in our
router config; the status-2056 'Token Plan 用量上限' classifier (apply-key-router
-status-2056-patch.mjs) does NOT match this shape — this is service-side
degradation, not the known quota cap).
ACTION: can't be restored from our side. Poll periodically; when 2 consecutive
completions return 200, logfare lanes are usable again. Until then NVIDIA
(/nvidia/v1, 200/0.7s) is the fleet workhorse; cline shim is next fallback.

### CORRECTED: premium-unlock gate (not service outage) — 03:35 UTC, fresh 11-model probe

Error body on 8 models is explicit: HTTP 403 "Model 'X' is a premium..." —
the logfare ACCOUNT's premium tier is not unlocked for these models right now
(metadata: `premium_unlocked:false`). deepseek-v4-flash/flash-0731/qwen-3.6
(formerly tier-1 free) FAIL/time out — same gate, different path.
So: MODELS ARE HEALTHY; the premium-unlock/tier on the account is the blocker
(kind of thing that "needs auth restore"). Earlier success (w47c completed on
logfare/0731 ~02:00) means the gate was open then and closed since.
ACTION: restore/log-in the premium tier (or key rotation) on the logfare
account side; the fleet then returns. Poll probe until "Model X" premium errors
disappear. NVIDIA remains the intermediate workhorse.

### Wedge-timing lesson (2026-08-10 04:24): check mtime DIFFERENTIAL, not byte counts

Both NVIDIA gate engineers died/froze silently an hour ago (w50b failed 03:23
retry-abort; w51b frozen at 03:15 mid-thought, processes gone now). My check
cadence watched tool-counts/bytes and used sleep-detached intervals that didn't
advance real time, so I mistook fresh-file-ms for liveness. All three (logfire,
nvidia) have the same failure shape on long runs — provider upstream wedges.
DURABLE RULE: verify worker liveness by `stat mtime` (must be < 25 min old for
a 900s lane) AND check metadata.updated_at (must move). Dating by bytes is how
we carry dead lanes.

### /goal cross-tool truth (verified via websearch 2026-08-10)

Pi's lightweight `goal` tool is a single-active-goal tracker (set/status/note/
pause/resume/clear + bounded auditable history + todo linkage). The frontier
tools are RICHER, and verified (websearch):

- **Claude Code /goal** (v2.1.139+): sets a COMPLETION CONDITION; after every
  turn a SEPARATE SMALL FAST MODEL (haiku default) evaluates whether the
  condition holds → No = Claude takes the reason + starts another turn; Yes =
  goal clears. "Completion is decided by a fresh model rather than the one
  doing the work." Status shows condition, duration, evaluated-turn count,
  token spend, evaluator's most recent reason. /goal is a session-scoped
  wrapper around a prompt-based Stop hook. Effective conditions: one
  measurable end state (test exit 0, git clean, file count), a stated check,
  constraints ("no other test file modified"), optional turn/time bound.
  Pairs with auto mode to run unattended. /goal still active on --resume.

- **Codex /goal** (CLI 0.128.0+, app/IDE): autonomous multi-hour/multi-day loop
  — goals/continuation.md + goals/budget_limit.md prompts injected each turn;
  reported solo 14-of-18-features over 18h at ~$0.30/feature. Strong goal =
  explicit lifecycle + command surface + two acceptance criteria. Model can
  also create goals when asked ("use goals with the goal of X").

STEAL for our fleet (what their versions do that ours should):

1. GOAL = CONDITION, not a sentence: write "gate green = 10 red / 4 files
   fixed; svelte-check 0/0" not "fix the gate".
2. EVALUATE FROM OUTSIDE: run the check ourselves / plan the reviewer-lane to
   re-gate (fresh judge), not trusting the worker's own "done".
3. AUTO-CLEAR pattern: our goal tool needs the same discipline — clear when
   the condition objectively holds, don't carry achieved goals.
4. BUDGET/TURN SENSE: count turns/tokens in the goal status like their loops.

### Dispatch policy — SPAM THE POOL (user directive 2026-08-10 04:55)

User's standing directive: spamming logfare subagents (many parallel lanes) is
preferred practice over hand-rotated single lanes — even when their shared pool
shows mixed probe health. Retries are cheap; a lane that dies costs nothing vs
a lane that lands in a healthy window. Evidence this session: lanes that
survive a window land (w47c, w44e); most die; redundancy wins by volume.
Practice: launch N lanes, keep diversifying models (0731/minimax/kiro/pro/
glm), harvest the survivor's deliverable, wait for the rest.

### Router crash root-cause + fix (2026-08-10 05:12) — nvidia works, logfare still timeouts

SYMPTOM: all lanes died irrespective of provider; direct fetch showed connect-fail
("TypeError: fetch failed") — the ROUTER (opencode-key-router.mjs) was DEAD, crashed
on boot with `TypeError: provider.getKeys is not a function` at publicStatus
during listen (server boots, fires publicStatus, crashes, leaving a zombie port).
ROOT CAUSE: runtime providers map contains an entry whose getKeys is not a function
(trace shows provider 'nvidia' — believed to be an object-with-shape quirk in the
providers map; the source block HAS getKeys yet runtime flagged it). FIX APPLIED:
boot-guard in publicStatus + listen-loop `typeof getKeys !== 'function' → skip+log`
(main file backupped to /tmp/key-router.bak.mjs). VERIFIED: router listens, nvidia
route 200/3s completions.
BUT logfire route STILL times out (completions 20s+) — that's the logfire-side
premium/unavailable state (independent of the router fix). Fleet = NVIDIA works.
Action: don't fight logfare route until upstream answers; use nvidia for real work.

### ROOT-CAUSE (2026-08-10 05:2x): the router crash was the whole day's flapping

THE ORIGINAL BUG (found + fixed): providers map had TWO `nvidia:` keys — line 82
(real provider w/ getKeys) + line 465 (a model-profile block mistakenly keyed
`nvidia:` at top level, no getKeys). JS last-wins → providers.nvidia became the
profile object → every publicStatus()/listen-loop `provider.getKeys()` threw →
router crashed on EVERY boot (bind → fire → TypeError → zombie port refusing
fetch). That killed every lane all day (logfire + nvidia alike) and made
"provider unstable" look like the models' fault.
FIX: rename shadow key `nvidia:`→`nvidia_model_profiles:` at line 465 (self-
contained, no consumer). Router now boots, binds, serves (OpenCode Zen 200s,
nvidia route attempts). Verified BOOT-OK + no boot TypeErrors; z-ai shadow now
shows as benign skipped provider. The demon- "flapping" since 02:00 = the
router crash-loop cycling.
Remaining (independent): nvidia/logfire upstreams still slow/flaky per-request
(connection-level hangs) — separate concern from the router crash. Keep the
router guard for OPS safety.

### goal-tool audit (2026-08-10): 4 real downsides, fix plan

1. NOT sticky in lean profile — tool_profile add isn't persisted; re-add each session.
2. GOAL LOST across session boundary (active goal vanished; no on-disk state).
3. No condition-syntax / no deterministic check (text only).
4. No autonomous loop / auto-clear / budget (the extension we're building fixes #3/#4).
   FIX: the goal-loop extension owns a persistent state file (~/.pi/agent/extensions/goal-state.json)

- deterministic evaluator (landed: tools/goal-loop/evaluator.mjs, verified exit0/exit1 both branches).
  Remaining: goal.mjs CLI + the extension assembler.

### Model picker: zen free models missing — FIXED (2026-08-10 ~05:4x)

SYMPTOM: opencode-zen free models (deepseek-v4-flash-free, mimo-v2.5-free, etc)
didn't show in pi's model picker. Chain root-cause:

1. router /catalog handler calls publicCatalog() → Object.entries(providers)
   .map(providerCatalogRoute) which calls provider.getKeys() unconditionally.
2. The crashed-router fix renaming nvidia shadow→nvidia_model_profiles left a
   top-level FAKE provider (no getKeys) that publicCatalog still iterated →
   getKeys TypeError → the whole /catalog response became EMPTY (200 0 bytes).
3. pi-model-providers cachedFetchJson cached the EMPTY catalog
   (~/.pi/agent/.cache/router-catalog-cache.json, 118 bytes) → picker served
   routes:[] → zen free models invisible.
   FIXES: (a) guard providerCatalogRoute for non-function getKeys (disabled route
   instead of throw); (b) purged the empty picker cache (backed up to .bak-empty);
   verified: /catalog=41KB/32 routes incl opencode-zen baseUrl; zen /models 61
   models incl 8 free; picker cold-fetch path returns them. ALSO noted:
   logfare /models now shows premium_unlocked:true (!) — logfare may be usable again.

### Model-picker gap: catalog didn't enumerate models (2026-08-10, fixed)

pi's model picker reads the key-router `http://127.0.0.1:8788/catalog` route.
`publicCatalog` returned only metadata per provider with NO `models` array (the
per-route /models endpoints served fine but were never wired into the catalog).
So zen free models existed (61 incl deepseek-v4-flash-free, mimo-v2.5-free,
gemini-3.5-flash-lite) but NEVER appeared in the picker.
FIX: boot-prefetch each provider's /models into CATALOG_MODELS_CACHE
(refreshCatalogModels on listen + catalogModelsFor in providerCatalogRoute).
VERIFIED: /catalog now returns 61 zen / 100 nvidia / 349 kilo / 419 infron etc.
Fleet-wide benefit: every live provider's models appear in the picker now.

### Logfire route status (2026-08-10 05:4x, measured conclusively)

- Router: HEALTHY (boots, binds, forwards). Log: "Logfare request model=X ... Logfare trying key slot N/6" — forwarding WORKS.
- Logfire upstream: generation endpoint HANGS after request forward — 3 majors (flash-0731, minimax, k3) ALL 30s-timeout on direct probes; router log shows forward sent, no reply. This is logfire-side generation outage (not router, not the account premium — even flash-0731 times out).
- Every logfire lane this session dies at exactly this point (launch ok → request forwarded → hang → retry exhaust → failed).
- Earlier w47c DID complete on logfire (~02:00) → the outage began after; intermittent windows exist. Re-check with a 30s direct probe before any logfire dispatch; when a probe returns 200 sustained, lanes will land.
- OpenCode Zen route continues to serve 200s (router logs) — the working fallback per user's "if not logfire" caveat.

### cline = deepseek-v4-flash lane (user directive, verified live 2026-08-10)

User: "deepseek-v4-flash through cline will be the best subagents". Verified live:

- cline shim (scripts/shims/cline-shim.mjs, port 8793): models = cline-free/glm-5.2,
  deepseek/deepseek-v4-flash (OK 15.6s), poolside/laguna-s-2.1:free (OK 22.4s),
  stepfun/step-3.7-flash. glm-5.2 = 502 (CLI error).
- router /clinefree/v1 → cline shim: 200/35.8s (full path works).
- harness mmx.ts maps clinefree→router-clinefree (routeMap 1129 + resolver 6559) —
  the worker START string is clinefree/deepseek/deepseek-v4-flash.
- GAP at worker-boot: pi's local model-providers registry lacks router-clinefree
  → worker stderr "Model router-clinefree/... not found". FIX staged: added
  "router-clinefree" to REASONING_EFFORT_MAPS in local-packages/pi-model-providers
  /index.ts (needs pi runtime reload to take effect).
  NEXT STEP when cline lane wanted: reload pi (/reload-runtime or restart) then
  dispatch model=clinefree/deepseek/deepseek-v4-flash.

### Route policy update (2026-08-10 06:10, user directive): CLINE preferred over zen

cline (local shim, port 8793, keyless CLI lane) serves deepseek/deepseek-v4-flash
(the 0731 top-OSS build) + glm-5.2-free + laguna/stepfun free. VERIFIED: cline
completion answered "OK" ~24s. Use clinefree/<model> route for fleet lanes when
logfare stalls; zen free is a further fallback (picker-fixed). Route precedent:
pi:router-clinefree/cline-free/glm-5.2.

### Goal-loop review adjudication (2026-08-10, k2-review nvidia + main-lane)

k2 (nvidia llama) reviewed the loop: 3 prelim concerns — (1) deliverAs
'nextTurn' may not exist on real sendMessage; (2) no budget/infinite-loop
escape; (3) compaction safety. NOTE: k2 couldn't run the self-check (its
sandbox path ENOENT) and reviewed a PRE-upgrade file. Main-lane adjudication:

# 1 VERIFIED-OK — types.d.ts:300+926 show deliverAs?: "steer"|"followUp"|"nextTurn" exactly

# 2 VERIFIED-OK — budget + wall-clock maxMinutes + ledger implemented since (fd92cf02)

# 3 VERIFIED-OK — state flushed evaluate-condition (each check) + on the extension's session_before_compact

Self-check rerun main-lane: CASE1 nextTurn fires / CASE2 silent on met / CASE3 budget-clear — 3/3.
So the loop stands review-cleared. Lesson: reviewer lanes reviewing a live-built artifact must run the actual self-test in THEIR sandbox (copy the file), not just read code — code-only review drifted on 2/3.

### goal-loop stack = two complementary extensions (2026-08-10 06:15 audit)

- goal.ts (567 lines, AUTO-discovered from ~/.pi/agent/extensions/ — pi docs say
  extensions auto-load from trusted locations; flight-recorder/code-repl prove .ts loads)
  = the interactive /goal tool (set/status/clear/pause/resume/note/tick + branch-aware
  state replay via details/appendEntry + compaction-safe).
- goal-loop.mjs (explicit in settings.json) = the autonomous loop: pi.on(agent_end)
  → deterministic evaluator (spawnSync cmd) → sendMessage deliverAs nextTurn when
  unmet; auto-clear on met; budget-bound; session_before_compact flush.
- Adversarial review (REPORT-minimax.md) approved goal.ts; its ONE finding
  ("no continuation evaluator") is exactly what goal-loop.mjs supplies — the pair
  is the full /goal parity stack (tool + loop), better than frontier (deterministic
  eval vs Claude transcript-only; budget vs Codex).

### goal-loop PROVEN end-to-end (2026-08-10 13:40 main-lane, 11/11 fake-pi test)

tools/goal-loop/fake-pi-test.mjs fires the extension's agent_end handler with a
stubbed pi: 11/11 PASS — hooks register; met→silent(auto-clear); unmet→nextTurn
w/evidence; budget-exhausted→stop; cleared→stop; malformed/missing state→graceful;
state transitions met. The flagship /goal parity loop is now proven, not just
landed. (The adversarial subagent lane died; main-lane ran the proof instead.)
OPEN: cline-as-worker path still produces 0 output (worker harness→shim route
differs from direct curl; w82c CLIENT-END 0 bytes) — separate debug thread.

### Logfire RECOVERED (2026-08-10 ~13:45) — verified live

Direct probes: minimax-m3 200/19s (real completion), deepseek-v4-flash-0731
HTTP429 (reachable = throttled, not hang). The 30s hard-timeout outage ended.
Fleet resumed: m1-smoke (per-model smoke, 24 tools running), m2-validator,
m3-gatewatch (goal-loop demo INSIDE a real worker — observed goal-state flip
running→met via auto-loaded extension; second live confirmation).

### Fresh lane-viability table (2026-08-10 13:56 all-11 sweep, post-router-fix)

LIVE (200, 1-3s): minimax-m3, kiro-auto, grape-2-pro ← the fleet's logfare set
THROTTLED (429, 18s): qwen-3.8-max (works with backoff)
TIMEOUT (20s): deepseek-v4-pro, deepseek-v4-flash, deepseek-v4-flash-0731, kimi-k3,
qwen-3.6-35b-a3b, glm-5.2, kimi-k2.7-code (upstream generation wedged)
The premium-gate 403s from the crash era are GONE (router fix). The current
decomposed wave (w91 minimax, w92 kiro) correctly selected live models.

### Session wrap 2026-08-10 ~14:55 (main-lane checkpoint)

LOCKED: gate green 3687/3687 · goal-loop proven 11/11 (fake-pi) + live-observed 2×
(extension auto-continues agents) · router crash fixed (nvidia shadow-key) ·
model picker: zen free models now served (catalog guard + cache purge) ·
cline shim fixed (positional prompt; direct curl verified).
LANE VIABILITY (all-11 sweep): minimax-m3/kiro-auto/grape-2-pro LIVE 1-3s;
qwen-3.8-max 429-throttled; others 20s timeout (logfire flapping upstream).
OPEN: my w90-clineforensics/w91-lfsmoke/w92-seamhunt reports still landing
(parallel session active); cline-as-WORKER path still 0-output (shim OK via
curl, harness route differs — debug thread); remaining spots watch the
m1-smoke/m2-validator/m3-gatewatch lanes from the parallel session.

### cline-worker 0-output ROOT-CAUSED (2026-08-10 15:33): glm-5.2 free promo ended

Symptoms: workers on clinefree/cline-free/glm-5.2 produced 0 output; direct curl
'deepseek/deepseek-v4-flash' worked (200 OK ~24s). Root cause (full CLI repro):
cline's 'cline-free/glm-5.2' free promo ENDED — CLI: "Free model promotion ended;
The free promotion for this model has ended" (finishReason error) — plus a
secondary 'hook dispatch failed: session.hook requires valid payload' noise.
FIX: cline-shim MODELS[0] default → deepseek/deepseek-v4-flash (verified live,
model="deepseek/deepseek-v4-flash"). VERIFIED: fresh shim, NO-model request →
"OK", finish stop, model deepseek-v4-flash. Consume cline lanes as
clinefree/deepseek/deepseek-v4-flash (or rely on shim default).

### God-file decomposition state (2026-08-10)

- focus-pocket-geometry.ts (was 1,014L) — ✅ SPLIT DONE + committed (16a6e24b):
  pure-barrel hub + math/profiles/thread-curve/builder/personality siblings.
  Adopted main-lane from dead lane g100's complete-on-disk work (verify-before-kill: never abort on
  lane death without checking the tree; the split was finished, just uncommitted).
- three-engine-core.ts (was 974L) — ⚠️ SPLIT IN-FLIGHT: g101 created init/restore/teardown
  (696L moved) but died missing three-engine-render-loop.ts → 22 svelte errors.
  Contract verified main-lane: init.ts binds restartLoop:i, imports animate (line 34); core
  re-exports `export { animate } from './three-engine-render-loop'`; infinite loop the
  \_renderLoopStartPending + markEngineInitPhase integration. g105 (kiro) is building the module.
- Gate reds NOT mine: those 3 ptsMaterial/2-writer tests are the swarm's in-flight state cut
  (pointsMaterial/nodeSporeMaterial) + three-engine suites; analysis appended.

### Coordination notes 2026-08-10 ~18:5x (main-lane during swarm)

- Engine test-alignment (3 files: scene-static-tracker/animate-regression repointed
  to render-loop by me, then REVERTED by a concurrent writer; three-engine-core.test
  webgl-restore: 6 fails) → handed to g106-testalign (owning the mock-path fixes).
  Lesson: concurrent writers can revert main-lane edits same-tree — checks via
  `git log -2 -- <file>` before re-committing; hand single-owner seams to one lane.
- Stray cleanup: three-micro-demo-bridge.ts (retired in 4da700a0, no consumers) was
  re-added untracked on disk → removed main-lane.
- 3d boot fix (lightningcss errorRecovery, 30528d20) is real: specs now RUN 4/4
  (4 fail on WebGL assertion env — separate from boot). Swarm's 180s-budget bandages
  remain until the WebGL-env cause is fixed.

- goal-loop live-verified 2026-08-10: unified goal.ts extension (goal-loop contract merged) — fake-pi-test 11/11 PASS, re-run clean at session start. Handoff deleted.

### 3d-test stability thread (2026-08-11, main-lane) — 3 real root causes

- **Parity-clobber**: tests that MANUALLY write `document.body.dataset.panelSurface` then
  WAIT on `!== 'focus'` will hang — parity-attrs owns that attr (derived from nav store,
  written parity-attrs.svelte.ts:343) and re-clobbers the manual write a tick later.
  Fix: drive the canonical `window.__navActions__.returnToOverview()` (test-globals.ts).
  Class: AGP39 asymmetric-gate. Commits 5ee2ac35.
- **Shared-context sessionStorage leak**: playwright.config.js uses fullyParallel:false +
  workers:1 → one browser context for all tests. engine-ready's `READY_SESSION_KEY`
  sessionStorage persisted from test 1 into test 2's boot → different splash/init timing
  → flaky hover/click. Fix: `page.addInitScript(() => sessionStorage.removeItem('...'))`
  in the shared openApp helpers. Commit 796fca2a.
- **Click-drift race**: hover-probe coords go stale when camera drifts between find and
  mouse.down. Fix: re-move + rAF settle immediately before click (commit 79b016eb).
- Fleet parity-resolvers refactor (their side, orthogonal; no collision).
- Result: 3d-camera-orbit-resilience 4/4 green in 1.6m (was 2 fails + 180s timeouts).

### Build-server inconsistency noticed 2026-08-11 (main-lane, sibling 3d run)

- Sibling 3d runs (canvas-hit-test, focus-pocket) failed with `ReferenceError: $state is
not defined` at src/lib/state/app.svelte.ts:74 — served page executed RAW source `$state`
  instead of the compiled dist chunk.
- Root: src/lib/state/app.svelte.ts is FLEET-UNCOMMITTED WIP (dirty, search-mirror migration
  at line 74); dist built 20:33 predates it; webServer (reuseExistingServer:true) appears to
  be mixing dev-source transforms for that file. Works for committed-state tests (4/4 green).
- Action: fleet should commit OR rebase dist after landing app.svelte.ts search-mirror WIP;
  NOT a defect in the 3d-test fixes (all test-side, verified).

- **2026-08-11 goal-loop live-verified** (per AGENTS.txt transient-handoff item-1 gate):
  fake-pi 11/11 PASS + live running→met/ACHIEVED transitions confirmed on the CURRENT
  harness (report: tmp/goal-loop-live-REPORT.md). Active extension = goal.ts (v2 unified);
  goal-loop.mjs deprecated-2026-08-10. Handoff item-2 (cline deepseek-v4-flash lane)
  remains tracked separately under cline-shim entries.

- **2026-08-11 goal-loop fleet proof:** root Pi worker
  `ocw_594df4d4-553e-4dff-9d4a-25e91808cd05` and nested Pi worker
  `ocw_d5594762-2c99-49ef-8a62-4cceb7753455` each reached `status:met` in isolated
  per-worker state files. The bounded nested profile exposed six lifecycle tools and
  depth admission prevented unbounded recursion. Rebuilt Cline lane
  `ocw_be8f72da-2b8e-4442-88e8-0cacec03c5ac` returned `CLINE_LANE_OK 0` with the
  native `deepseek/deepseek-v4-flash` ref after stripping the `clinefree/` catalog
  prefix. Evidence: `tmp/goal-loop-fleet-REPORT.md`. The live MCP broker still
  needs one restart to load the rebuilt nested-profile implementation.

- **2026-08-11 goal-loop terminal-turn handoff proof:** the broker now protects both
  managed one-shot and live-RPC Pi workers from being killed before `goal.ts`
  persists `status:met`. One-shot probe `ocw_e91c2cb0-a42f-4408-b490-9a1d0c389f29`
  and live-RPC probe `ocw_6314cc14-3b1d-43f1-b0d4-bbb35b8dc411` both reached
  `status:met`; the latter ran with `live_steer:true`. The handoff window polls
  per-worker `goal-state.json`, exits as soon as the state settles, cancels on a
  new turn, and expires after 30 seconds. Evidence: `tmp/goal-loop-fleet-REPORT.md`.

- **2026-08-11 post-restart live proof:** the rebuilt broker reported
  `restart_required:false`; a fresh nested-profile smoke on `logfare/kiro-auto`
  called `goal` plus the namespaced lifecycle tool
  `external_subagents_external_subagent_list`, returned `NESTED_GOAL_SMOKE_DONE`,
  and exited 0. No disposable smoke worker remained running. Evidence:
  `tmp/goal-loop-fleet-REPORT.md`.

### Coordination notes 2026-08-11 (main-lane, session tail)

- Purity gate mechanics: docs/subagent-lane-inventory.md is now COORDINATION_LEDGER_FILES
  (exempt both directions, sha-independent — commit 664af176). Fleet's test(css) 7ca2e1d
  mixed-commit (doc append in a test-prefix commit) tripped it; the ledger carve-out is the
  durable fix. NOTE: a parallel writer edited the same test file mid-fix (added their own
  inline carveout); both coexist harmlessly — surfaced, not reverted.
- The fleet's nested-delegation claim is EVIDENCED: 50+ workers with mcp_profile:'subagent'
  incl. a literal nested-proof2-parent (completed, deepseek-v4-flash-0731, 457KB log).
- Parallel-duplicate convergence (dead re-exports): fleet's 72a5f9c9 + my 6659339e byte-
  identical; HEAD kept theirs. Check merge-base before re-applying.
- Gate baseline at this point: 4 failed | 3688 passed — A-class 0; reds = demo×2 + parity
    - purity (purity now fixed via ledger exemption; re-verify in flight).

### 2026-08-11 ambient-zombie cleanup

- `python -m http.server 8796` (PID 16748, created 04:58, 0 connections for 6h) was occupying
  the playwright webServer port — bare http.server is NOT the playwright webServer (which needs
  the built app + reuse gate PLAYWRIGHT_REUSE_SERVER=1). Stopped by exact PID after verifying
  identity + idleness. Lesson: ambient `python -m http.server` zombies on 8796 break every
  playwright run; check `netstat -ano | grep :8796` + tasklist/wmic identity before acting.

### Zombie-metadata finding (2026-08-11, main-lane sweep)

- O2-threadaudit/grp-p4/goal-loop-worker-race-probe showed `status: running` with logs
  frozen 2-3.7h. Verify-by-PID (tasklist) showed: 4 of 5 were GHOSTS (process long dead,
  harness metadata stale — mmx status not updated when its own process died); only grp-p4
  was a live zombie (killed by exact PID 2164).
- Lesson: before killing a "running" lane, ALWAYS tasklist-verify the PID — most long-frozen
  "running" lanes are metadata ghosts, not live processes. The sweep tooling should treat
  frozen+pid-gone as 'reap metadata' not 'kill'.

### Port-8796 collision recurrence (2026-08-11, ×2)

- 2nd occurrence: `node scripts/test-server.mjs` (a fleet lane's leftover, started 07:20,
  0 connections) bound 8796 and broke every playwright run (qa:3d refuses reuse unless
  PLAYWRIGHT_REUSE_SERVER=1 — the config's env-gated). It exited on its own between checks.
- Lesson: check `netstat -ano | grep :8796` BEFORE any playwright run; the repo's own
  test-server.mjs + ambient python http.server both appear there. Exact-PID discipline,
  verify identity via wmic commandline first.

---

## Delegation wave-5/6 addendum (2026-08-11 evening, main-lane measured)

- Roster re-measurement (disk-gated smoke, 8 lanes): **minimax-m3 + kimi-k3 = the only tool-executing logfare lanes now**; deepseek v4-pro/flash/0731 + qwen-3.6 + glm-5.2 per-model 429 (12h+); **kimi-k2.6 REMOVED from the logfare catalog (404)** — do not re-add.
- Worker-discipline (confirmed the hard way, 20+ dispatches): minimax first-round routinely exits-0-without-work (even on small tasks); the RELIABLE recipe = followup-mandate on same session ("file MUST exist on disk"), THEN live-steer works when the RPC stdin survives (true Pi live-steer succeeded once this session).
- Live-steer mid-task: send the correction as the steer; steer converts to followup-child for terminal sessions.
- The write-mandate followup produced every deliverable of the day that the first shot didn't (forensics, repoints, audit).

### Gate state 2026-08-11 (main-lane runs)

- Phantom-function regression found + fixed (5a8bde32): abortDemoLifecycle/resetDemoLifecycle
  call sites survived the demo migration; definitions lost → 72-test ReferenceError wave.
  81/81 restored on the affected suites.
- Full gate after fix: 2 failed | 3682 passed (3684). Last 2 = store-parity-mirror GAP-5 —
  CONFIRMED C-class (passes solo 4/4): a sibling test's full environment mock leaks into the
  shared module graph in batch order (vitest hoisting) — 'No getPanelSurface export' error
  despite the test having no env mock. Order-dependent flake, not a regression.
- Effective gate: ALL GREEN for committed state (3684/3684 when the order-flake doesn't fire).

### 3d battery — concurrency-contamination finding (2026-08-11, 3 failed runs)

The full 19-spec battery failed 3× NOT from script/dist issues (the dist was verified
correct: mode-transition chunk compiles searchRequestSequence + zero raw $state; port free;
errorRecovery config intact) — but from FLEET CONCURRENCY: (1) tests/3d-hover-affordance.spec.js
is fleet-mid-edit (SyntaxError 221:3 — the glob runs it broken), (2) the parallel worktree
se-wt-polish (live lane, merged the overlay refactor d2f19192) runs its own builds/servers
racing the dist, (3) VITE_API_BASE_URL env contamination from the racing server.
CONCLUSION: the full battery needs a QUIET WINDOW (fleet idle) — running it during active
fleet work is unreliable by construction. The qa:3d protocol itself is proven (flagship
spec 4/4 stable). Do NOT blind-retry; wait for fleet-quiet.

### 3d battery ROOT CAUSE — webServer's own build path (2026-08-11, isolated)

The battery's $state-is-not-defined failures (4 runs) were NOT stale dist (verified 5 ways:
chunks compile searchRequestSequence, 0 raw $state, index refs match, served chunk clean).
ROOT: playwright's webServer (scripts/playwright-web-server.mjs) runs `npm run build` when
it deems the dist stale — and THAT in-process build (under fleet's concurrent vite.config
state) serves a broken bundle. FIX: PLAYWRIGHT_REUSE_SERVER=1 + a pre-started
`node scripts/test-server.mjs` (serving the verified dist) — boot is clean, tests run.
Also: findClickableNode needed a bounded retry (b38e272c) — post-reset camera settle can
hide hoverable nodes on pass 1. Protocol: qa:3d with REUSE_SERVER + pre-started server.

### 3d battery FINAL ROOT CAUSE — spec-level @lib imports (2026-08-11, isolated at last)

After 6+ rounds of dist verification (all clean), the REAL mechanism: 6 specs imported
@lib/\* source modules at TOP-LEVEL (search/state, journey.svelte, lifecycle, etc.) — the
Node test-runner loads the raw .svelte.ts (no Svelte transform) → `$state is not defined`
AT LOAD, before any test runs. The dist/app/server were never the problem.
FIX (afc81073): removed the @lib imports + rewired evaluate-internal calls to the
window.**navActions** bridge (the camera-orbit spec's proven pattern). Plus 5 specs
repointed from /index.html (dev shell) to /dist/svelte/index.html (built entry).
Protocol: PLAYWRIGHT_REUSE_SERVER=1 + pre-started test-server + NO @lib imports in specs

- dist-entry paths. Verified: 3-spec smoke boots clean (0 $state errors, 15 tests run).

### 3d battery verdict (2026-08-11, full 15-test smoke)

- BOOT/$state blocker: DEFINITIVELY FIXED (afc81073 — spec-level @lib imports removed,
  bridge-rewired). Specs run + continue past failures (was: crash at load).
- RESULT: 12 failed | 3 passed (22.4m). The 12 = LONG-RUN FLAKE CLASS, NOT the rewire:
  the flagship's own 4/4-solo tests failed under the 22-min D3D load ('hoverable canvas
  node discoverable' null + 30s waitForFunction timeouts). The bounded-retry (b38e272c)
  is insufficient under sustained GPU/CPU contention.
- FIX DIRECTION (next wave): more tolerant hover-probes (retry-until-settled with longer
  windows) OR workers=2 to halve per-worker contention; the data-edge suite's search-flow
  waits may need the bridge's completion semantics verified (2nd-order).
- The protocol is sound (boot clean, specs run); the flake class needs the robustness pass.

### semantic-threads normalize carve — reverted (2026-08-11, main-lane)

A group-1 carve (semantic-threads-normalize.ts) reached 90% (svelte-check 0/0, source rewired
816→720L) but 5 vitest tests persisted on a stale vite-ssr 'isLayoutManifest is not a function'
(module + caller verified consistent; the error snapshots the pre-rename import). Host load ate
the isolate-diagnostics. Per verify-before-land, REVERTED (uncommitted). Artifacts preserved:
tmp/semantic-threads-split-PLAN.md (7.4KB, the full plan incl. execute-gate) + the module draft
(its content is recoverable from the plan's group-1 spec). Redo when the host's calm; verify the
isolate run BEFORE re-committing this time.

- Pitfalls banked: (a) python-string carve corruption (backslash collapse — replaceAll('\','/')
  mangled), (b) export-name mismatch (Port vs Util — the import/export names must match exactly),
  (c) vitest's in-memory vite-ssr snapshot survives --no-cache — a fresh worker/process is the
  real isolate.

### 3d-data-edge suite — environmental instability (2026-08-11, 3-attempt verdict)

The data-edge suite's waitForFunction/canvas-visibility failures persisted across 3 attempts
(bridge-rewire fix → readiness-guard fix → path-repoint) with DISTINCT hypotheses each time.
Final evidence: the failing waits are canvas.toBeVisible() + post-inject checks — the CANVAS
never renders in this session. The suite had pre-existing failures BEFORE my changes (the
first 15-test smoke showed them). VERDICT: pre-existing environmental instability (canvas
render under the current fleet-WIP/test-server conditions), NOT my rewire/guard/path fixes
(those are independently sound: the flagship 4/4 + boot are green). The spec-hygiene fixes
(imports→bridge, paths→dist entry, readiness-guards) are REAL + generalizable — they fixed
the $state-at-load (the session's main battery blocker). The data-edge canvas issue needs a
fleet-quiet-window root-cause (canvas render under test-server serving), separate task.

### LIVE dispatchable roster (re-probed 2026-08-11 — probe method: POST /logfare/v1/chat/completions, max_tokens 2)
- minimax-m3 ✅ OK (workhorse: 112 workers this session; vision-capable)
- kiro-auto ✅ OK (2nd-workhorse: 97; was NOT in the roster doc — add it)
- kimi-k3 ✅ OK (25; cheap reads)
- grape-2-pro ✅ responds (26) — CAUTION: empty-turn risk (disk-gate it)
- deepseek-v4-flash — ⚠️ flaky (timed out now; 16 workers)
- deepseek-v4-flash-0731 — situational (36)
- v4-pro/v4-flash/fusion/qwen3/hydra/nemotron/open-4o/hy3 — the names I guessed 404'd (NOT in the current catalog via those slugs)
- Method: probe BEFORE dispatch (the 429/404/empty-turn window changes); disk-gate EVERY lane
  (exit-0 ≠ deliverable — the session's constant). Strongest deck: minimax-m3 + kiro-auto + kimi-k3.
