# Subagent Lane Inventory — Semantic Explorer

> **COMPRESSED HISTORY (2026-08-11):** the 59 dated run-entries below are history; durable lessons → docs/subagent-delegation.md (Landmine classes). The live coordination state is in the un-dated sections.

Moved out of `AGENTS.md` (Prompt Budget: no large reference tables in the hot-path file). `docs/subagent-delegation.md` remains the source for lifecycle/rate/vision rules; this doc is just the live per-model viability table.

Probed 2026-07-27. Updated 2026-08-06 (live catalogue refresh; vision lanes refreshed by 670-probe sweep — see Vision Capability Matrix in `docs/subagent-delegation.md`; evidence `tmp/vision-probe/`). **See also `docs/subagent-models.md`** for the quick-reference version (verified table, conditional/avoid list, and untested backlog).

## Cline free lane health (2026-08-12)

- `clinefree/poolside/laguna-s-2.1:free` ✅ verified through native Cline and the local `router-clinefree` shim; zero-cost, 262K context, 32K max output, no exposed reasoning ladder. It is the shim and native Cline default.
- `clinefree/deepseek/deepseek-v4-flash` ⚠️ cataloged and wired, but Cline currently returns a structured 429 daily free-limit response for the `-0731` route; retry after the provider hint rather than treating it as a transport failure.
- `cline-free/glm-5.2` ❌ removed from the free picker: Cline reports the promotion/model as unavailable.
- `stepfun/step-3.7-flash` ❌ not a Cline-free lane: native Cline reports nonzero pricing, so it is not exposed by the free shim.

The shim exposes `/health`, defaults to Laguna, and preserves provider-specific 429/404/504 status semantics for Pi and external-subagent callers. Cline treats `-m` as its last-used model and may update `providers.json` after an alternate routed request; `--data-dir` would isolate that write but also isolates OAuth state, so the shim does not rewrite credentials after every call. Keep Laguna as the native default and treat this as a known low-priority Cline limitation.

## Delegation-wave-1 logfare verdict (2026-08-11, main-lane measured)

8 logfare dispatches, deliverables-first. **minimax-m3 + kimi-k3 = the workhorses; deepseek-v4-flash family + qwen-3.6-35b-a3b throttled (429 per-model quotas, NOT concurrency — user confirmed logfare has no concurrent-use cap).** Critical protocol — NEVER trust first-shot exit-0: minimax routinely 'completes' with zero tool calls (17s observed) and kimi-k3 stream-dies at the final write ('Stream ended without finish_reason') after doing the full analysis. The reliable recipe that produced all deliverables: (1) rubric-first prompt with disk-gate; (2) ALWAYS issue a followup on the same session_id (context retained) with an explicit 'the file must exist on disk before you stop' mandate — this converts talkers into doers; (3) for kimi-k3 followups, add 'do NOT re-run analysis, only write' + ask for a compact report to dodge the long-stream death. This matches the earlier deliverable-first skeleton protocol (channel msg 160). Verify deliverables in worker tmp/, never exit codes.

> **2026-08-11 Delegation-wave-2 logfare addendum:** W2B choreo migration landed (cancelChoreography has zero live callers); W2A css-ownership Option-C redesign; W2C deleted 3 dead contracts. Pattern: disk-mandate followup on every logfare worker.

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

> **2026-07-30 W58 wave summary:** 9 real bugs shipped (CompassPhase missing 'trail', ResourceTracker leak, trailSeedIndex WRITE omission, teardownToastHooks, 4 engine fixes). Dead lanes: qwen3.6-plus (401), nvidia/* (404), freemodel/gpt-5.6-terra (401). Golden goose: mimo-v2.5-free ✅ STRONG find channel.

> **2026-07-30 W58 continuation late findings:** ling-3.0-flash-free found ?nodemo=1 bypass (committed 2b6821fb); nemotron-3-ultra-free fixed 3 engine issues (committed e33d0364). Both passed build+tsc+vitest 3363.

> **2026-07-30 W58 harness-audit campaign:** Graduated: nvidia/z-ai/glm-5.2 ✅ FIX, nvidia/minimaxai/minimax-m3 ✅ AUDIT, nvidia/google/gemma-4-31b-it ✅ AUDIT. Dead: kimi-k2.6 ❌ 404, granite-34b ❌ not found, deepseek-v4-pro ❌ 502, deepseek-v4-flash ❌ 529, gemma-3-12b ❌ 404, granite-3.0-8b ❌ 404, granite-3.0-3b ❌ 404, zamba2-7b ❌ 404, mistral-nemotron ❌ crash. Zydit: only glm-5.2 reliable. Harness fixes applied: health cache, async saveState, idle-cancel watchdog, pre-spawn detach patch. Commit 97272e2.

> **2026-07-30 W58 graduation batch logfare/zydit-v4/mistral/kilo:** devstral-2512 ✅ subagent-viable (route pi:router-mistral/devstral-2512). Failed: qwen-3.8-max ❌ 429, kimi-k3 ❌ 429, minimax-m2.5 ❌ timeout 420s, kat-coder-pro-v2.5:free ❌ 404. Stream-idle-timeout GAP confirmed on zydit-v4.

> **2026-07-30 W58 graduation batch #2 zenmux/opencode-zen/mistral/cloudflare/modelscope:** glm-4.7-flash-free ✅, opencode-zen/laguna-s-2.1-free ✅ (overtURNS prior ❌), mistral-small-latest ⚠️, mistral-magistral-medium-latest ⚠️. Failed: mistral-medium ❌ not found, devstral-small-2:24b ❌ 400, vibe-cli ❌ output cap, gpt-oss-20b ❌ 0 tools, modelscope v4-pro ❌ 401, v4-flash ❌ 429, glm-4.6v ❌ 429, opencode-zen deepseek-v4-flash ❌ 500.

> **2026-07-30 W58 graduation batch #3 mistral/nvidia:** inkling ✅ subagent-viable (route pi:router-nvidia/thinkingmachines/inkling, all 5 counts correct). Transport-viable but inaccurate: mistral-large ⚠️, devstral-latest ⚠️.

> **2026-07-30 W58 graduation batch #4 poolside/nvidia:** poolside/laguna-s-2.1 ✅ subagent-viable (premium free carrier, user-confirms beast). Transport-viable but inaccurate: codestral-latest ⚠️, magistral-small ⚠️. Failed: mistral-code ❌ output cap, nemotron-3-super ❌ 404, qwen-3.6-35b-a3b ❌ unavailable, gpt-oss-120b ❌ timeout, llama-3.3-70b ❌ stuck, gemma-4-31b ❌ too slow.

> **2026-07-30 W58 graduation batch #5 priority-provider probes:** novita/tencent/hy3 ✅ subagent-viable (route pi:router-novita/tencent/hy3, all counts correct). Failed: infron/kimi-k2.6:free ❌ 404, zenmux/claude-opus-5 ❌ 402 no credit, mistral/devstral-medium ⚠️ inaccurate.

> **2026-07-30 Mistral bugsweep bake-off W61 stale-closure:** magistral-small-latest best (0 FP); devstral family inconsistent (2-4 FP); codestral-latest useless (4 FP); mistral-code wedged 2/2. Reasoning models >> coding models for stale-closure sweeps. Default: mistral/magistral-small-latest. cloudflare/kimi-k2.6 403.
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

> **2026-07-29 Orchestration bugsweep trial:** all free routes blocked by route-health barriers (OpenRouter 120s timeout, NVIDIA key-router 404, ModelScope off-task, Cloudflare 0 tool calls, kilo 402, zenmux down). Main lane finished sweep manually (1 MED + 4 LOW). `--thinking max` applied to all workers; no override exposed.

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

> **2026-07-29 Free-lane billing investigation:** Modelscope ✅ best free lane (49 models, no billing wall); Novita ❌ all 143 models paid; Infron ❌ `:free` models need $5+ balance; Zenmux ⚠️ 5 genuinely free but rate-capped; Macaron-V1-Venti ⚠️ infra fixed, upstream blocked. Recommendation: Modelscope + Logfare for free subagents.

## W57 subagent cold-stall root cause — 2026-07-29 19:18 UTC

Follow-up to the earlier "Orchestration bugsweep trial" openrouter/nvidia/cloudflare/groq "exit 124 / 0 assistant output" verdicts. Direct key-router probes that **mimic the harness** (`stream:true + tools + reasoning_effort:max`) pinpoint three distinct causes — most "model not viable" verdicts were **harness/adapter bugs**, not model failures:

- **Cause 1 — `reasoning_effort: "max"` rejected.** The harness hardcodes `--thinking max`. **Groq** returns HTTP 400 (`allowed values ['none','default','low','medium','high']` — `max` not allowed). **ModelScope `deepseek-ai/DeepSeek-V3.2`** returns `choices: null` / empty. Harness swallows the error → logs-only forever. Fix: harness should send `high`/omit for these providers.
- **Cause 2 — streaming `tool_calls` deltas not parsed.** `google/gemma-4-26b-a4b-it:free` (openrouter) and `mistralai/mistral-nemotron` (nvidia) emit **textbook-correct OpenAI tool_call streams** (`function.name:"read"`, correct path arg, `finish_reason:"tool_calls"`) in 1–5 s, yet the harness shows `tool_calls: []` / `assistant_output_seen: false` indefinitely. Routes that work (`router-opencode-zen`, `router-logfare`, `router-modelscope` DeepSeek-V4-Flash) normalize streaming tool_calls; `direct-openrouter`/`router-nvidia`/`router-groq`/`router-cloudflare` do not. Fix site: Pi core OpenAI-completions stream parser (compiled dist) — file a harness issue, not a local patch.
- **Cause 3 — genuinely flaky model.** `@cf/meta/llama-3.3-70b-instruct-fp8-fast` under _no_ thinking returned pure gibberish (`ξηξη ． Velerik...`). Avoid.

**Bottom line:** `google/gemma-4-26b-a4b-it:free` and `mistralai/mistral-nemotron` are **likely subagent-viable once the streaming-tool_call adapter is fixed** — both streamed correct tool calls today. Until then, restrict subagent dispatch to `router-opencode-zen`, `router-logfare`, and `router-modelscope`. Full breakdown: `tmp/w57-root-cause-breakthrough-2026-07-29.md`.

## W57 reasoning-level / "configured poorly" audit — 2026-07-29 19:44 UTC

User steer: "those models don't support max reasoning flag? We should still launch with THEIR highest reasoning level" + "ensure they don't expose xhigh and max reasoning settings that we just configured poorly" + "same check on logfare models". Probed every route with the full candidate set `{max, xhigh, high, medium, low, default}` AND the OpenRouter-native nested `reasoning:{effort}` field. `external_subagent_start` exposes NO reasoning/thinking override (confirmed in live schema: only cwd/name/model/harness/timeout/mode/mcp\_\*/live_steer/keepalive params) — so harness hardcodes flat `reasoning_effort:"max"` and we cannot route per-model ceilings from the launch API.

> **2026-07-29 Non-logfare cold-stall suspects:** Groq llama-3.3-70b genuinely non-reasoning (all reasoning_effort 400); ModelScope DeepSeek-V3.2 confirmed configured poorly (needs nested reasoning field, not flat); V3.1 works both ways; V4-Flash streaming works; gemma-4-26b+ling cold-stall is Cause 2 (adapter), not config; mistral-nemotron flaky timeout; cloudflare llama-3.3-70b accepts all levels.

> **2026-07-29 Logfare 10-models ask:** clean signal on 4 of 10 (kiro-auto, minimax-m3, kimi-k2.7-code, glm-5.2). All 4 accept max → HTTP 200. minimax-m3 returns tool calls at max/xhigh/default but EMPTY at high/medium/low. Conclusion: for logfare we ARE using the max the models accept.

### Actionable levers

1. **ModelScope DeepSeek-V3.2** — real graduation opportunity IF the harness is patched to send nested `reasoning:{effort:max}` for it (or if pi-model-providers catalog maps the field). Likely viable; re-trial after fix.
2. **Groq non-reasoning models** — need harness to OMIT `reasoning_effort` for models that don't support it. Requires a per-model reasoning capability flag in the catalog feeding the harness. Not reachable today via `external_subagent_start`.
3. **File a harness issue**: (a) expose a `reasoning_effort` override + auto-recognize non-reasoning models (groq llama-3.3-70b → omit); (b) ModelScope V3.2: send nested `reasoning:{effort}` not flat `reasoning_effort`.

## W57 kimi-k3 deep-dive — 2026-07-30 (corrected after per-key audit)

User: "kimi k3 from zydit and from logfare but we haven't got it to work, not sure we have them set correctly." Live key-router source inspection (`C:\Users\HP\Desktop\Temp while my comp is at the shop\harness\servers\key-router\src\opencode-key-router.mjs`) + streaming tool_call probes against all three paths. **Verdict: NOT a pi-config bug.**

> **2026-07-30 [Logfare] Kimi K3:** pi config CORRECT (fixed 2026-07-29). Per-key opt-in audit: 2 elevated keys get 503 (not 403) for k3 — logfare-side transient capacity wobble, not training-gate. logfare chat/completions in sustained 503 outage. Non-opted-in #2 key is dead probe account (flag for removal).

> **2026-07-30 [Zydit] Kimi K3 PHANTOM:** key-router synthetically injects kimi-k3 into zydit/v4 /models roster via hardcoded `addKimiK3ToZyditV4ModelsListing()`. zydit upstream REJECTS kimi-k3 — live probe returns All router keys failed. Dead end — recommend removing [Zydit] Kimi K3 catalog entry.

> **2026-07-30 Key-router watchdog + logfare lane infra:** watchdog was DOWN ~1 day (last log 2026-07-28T10:02). Started watchdog (pid 29256). Restarted router — logfare lane did NOT recover because upstream 503, not router. Watchdog probes nvidia kimi-k2.6 ONLY — logfare outage does not trip it. logfare auto-recovers via 30s route-backoff retry.

### Bottom line (corrected)

- "Not set correctly" was PARTLY true historically (logfare kimi-k3 had no key-router request profile → cold-stall). **Fixed 2026-07-29.** Remaining blockers: (1) **logfare chat/completions upstream 503 outage** (all models, waits itself out; auto-recovers via 30s backoff retry), (2) **zydit-v4 kimi-k3 phantom** (dead end). **Training-optin is NOT the kimi-k3 blocker on elevated keys** (they 503, not 403). Once logfare recovers, kimi-k3 should stream via router-logfare (config already correct, elevated keys cover it) → run find-and-fix-bug trial.

> **2026-07-30 Zydit v1/v4 untested graduation candidates:** zydit-v4 viable for profiled models (minimax-m3 graduated). Unprofiled models cold-stall (no stripToolStream). Catalog cleaned 2026-07-30: phantom kimi-k3/kimi-k3-thinking injection removed; roster now 36 real bare-id models. Added providerModelRequestProfiles.zyditv4 entries for: qwen3-coder-next, qwen3-coder:480b, devstral-2:123b, kimi-k2.5-thinking, glm-4.7, gpt-oss:120b.

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

> **2026-08-04 Notes:** max_tokens:24 produces empty content on reasoning models — re-probe at 256 tokens. groq 413 ceiling: Limit 12000 TPM. z-ai/glm-5.2-fast routes to infron.

### Gap-sweep addendum (2026-08-04 16:10Z) — providers missed by the first pass

First sweep missed four keyed providers (gemini's `/v1/models` uses a different JSON shape so it appeared empty; modelscope/kilo/freemodel had recent failures and were skipped). Follow-up probes (`tmp/health-sweep-gaps.mjs`, 256-token budget):

- **`gemini/*` ✅ ALL HEALTHY 2026-08-04** — 3 keys, previously NEVER swept (my first catalog call assumed OpenAI `data[]` shape; gemini returns `models[]`). `gemini-3.5-flash` PONG 2.6s, `gemini-3.1-flash-lite` PONG 1.2s, `gemini-2.5-flash` PONG 734ms. **Launchable via `gemini/...` refs (verified in launch allowlist). New primary-quality lane (Google first-party models, 1M ctx, free via our keys).** Subagent graduation trial still pending — chat-healthy but not yet grad-trialed.
- **`modelscope/*` ✅ RECOVERED 2026-08-04** — was "quota-dead" per §W57 (401/429 exhausted), but now: `zai-org/GLM-5.2` PONG 3.4s, `Qwen/Qwen3.5-35B-A3B` PONG 7.2s, `Qwen/Qwen3-Coder-30B-A3B-Instruct` PONG 1.2s. Only `deepseek-ai/DeepSeek-V4-Flash` fails (400 "no provider supported"). **The W57 quota-death verdict is OVERTURNED — modelscope is back.**
- **`kilo/*` ✅ HEALTHY 2026-08-04** — `kilo-auto/free` PONG 2.1s, `kilo/inclusionai/ling-3.0-flash:free` PONG 1.6s, `kilo/nvidia/nemotron-3-ultra-550b-a55b:free` PONG 1.4s. The 14:56 502 was transient (routeBackoff expired). Existing kilo entries stand.
- **`freemodel/*` ❌ STILL DEGRADED 2026-08-04** — `gpt-5.6-luna` 401 invalid token, `gpt-5.6-sol`/`terra` 429 (single key on ~6h cooldown, `nextReadyInMs≈21.6M`). Only `freemodel/gpt-5.6-luna` had a prior graduation (2026-07-29); the whole lane is currently unusable — key needs attention.
- **9 configured-but-keyless providers (0 keys — dead until keys are added):** `bazaarlink`, `ainative`, `deepseek`, `siliconflow`, `together`, `cerebras`, `cohere`, `hyperbolic`, `aimlapi`. Router exposes the routes (404/empty catalogs) but there are no API keys to serve them. Do not attempt dispatch on these; re-check router `/health` if keys ever appear.
- Also confirmed: `gemini-3.5-flash` and `modelscope/zai-org/GLM-5.2` looked empty at 24 tokens and PONG cleanly at 256 (same reasoning-burn pattern as zydit — the 256-token rule applies everywhere).

> **2026-08-05 Vision worker-path re-probe:** after visionInputFromModelId fallback fix — WORKER-VISION ✅ modelscope/Qwen3-VL + zenmux/step-3.7-flash; TEXT-ONLY zenmux/agnes-2.0-flash; DEAD 404 openrouter/nemotron-3-nano; INVALID 400 zenmux/mimo-v2.5; 429 upstream openrouter/gemma-4-26b.

> **2026-08-05 Registry coverage correction:** external-subagents broker reads 7 local registry surfaces; reports source provenance, duplicates, unmapped entries. Key routing rule: provider-qualified ref must resolve to registered Pi provider/model pair. Re-run broker inventory smoke after provider-registry or router changes.

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

> **2026-08-07 Provider lockout symptom:** flight-recorder evidence showed provider lockout patterns during fleet sweeps.

### Provider metric: doc-writing / small deterministic edits

> **2026-08-07 Provider metric: doc-writing** — flash-class models drift on multi-paragraph docs; for docs < 1 page, do main-lane or give byte-budget + paste-only target.

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

> **2026-08-08 Task-shape lemma (w28-w32):** delegation success dominated by task shape, not rail/model. Bounded per-finding fixes committed; open-ended sweeps failed on all models+rails.

### Camera-choreography sweep result (main-lane, 2026-08-08)

> **2026-08-08 Camera-choreography sweep:** all 16 public exports have callers; events via typed EVENTS bus; zoomCamera guards correct; two-writer race handled. NO new HIGH/MED findings.

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

> **2026-08-09 Wave-g live roster check:** re-probed known models; grape-2-pro verdict pending; k2.7/qwen-3.8/glm removed from dispatch until probes recover.

### grape-2-pro trial verdict (2026-08-09, w43)

> **2026-08-09 grape-2-pro trial verdict (w43):** ZERO tool calls across TWO launch attempts — claims-not-executes confirmed. Replaced by deepseek-v4-flash (w46).

### Provider wall at 3-way concurrency (2026-08-09, wave w44+w45+w46 — measured)

> **2026-08-09 Provider wall at 3-way concurrency:** 3 concurrent logfare lanes = all-land freeze. Logfare lanes run SEQUENTIALLY, not in parallel.

### Router odown — the "rotate" directive needs a provider-health pre-check (2026-08-09)

> **2026-08-09 Router odown:** rotate directive needs provider-health pre-check. If completions endpoint hangs, no model rotation helps; pause fleet and retry probe.

### Flapping provider (2026-08-09, 2 wedges in 40min — measured)

> **2026-08-09 Flapping provider:** 2 wedges in 40min measured. Failure-mode map: wedge-freeze, wedge-kill, model non-execution.

### Provider gate at dispatch time (2026-08-10, 00:49 UTC)

> **2026-08-10 Provider gate at dispatch:** two consecutive completion probes FAILED; applied rule: DO NOT launch into flapping endpoint.

### Pro's orphan sweep is a DEAD END (2026-08-10)

> **2026-08-10 Pro orphan sweep DEAD END:** tmp/_orphans.json lists 18 orphan modules — 12 paths DO NOT EXIST in repo. Do NOT dispatch on that file.

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

> **2026-08-10 Provider landscape (gate wave):** logfare flapping; NVIDIA NIM /nvidia/v1 healthy 200/0.7s used for gate wave; cline shim fallback.

### Logfare auth-wall (2026-08-10 ~03:25, measured): 9/11 models HTTP 403/401

> **2026-08-10 Logfare auth-wall:** 9/11 models HTTP 403/401. Premium tier not unlocked for these models right now.

### Logfare state — SERVICE-side (200-403 + SSE "Service temporarily unavailable") 03:31 UTC

> **2026-08-10 Logfare state SERVICE-side:** health probes return 200 but real generation streams Service temporarily unavailable. Cannot restore from our side.

### CORRECTED: premium-unlock gate (not service outage) — 03:35 UTC, fresh 11-model probe

> **2026-08-10 Premium-unlock gate (CORRECTED):** HTTP 403 Model X is a premium — account premium tier not unlocked. Restore/log-in on logfare account side.

### Wedge-timing lesson (2026-08-10 04:24): check mtime DIFFERENTIAL, not byte counts

> **2026-08-10 Wedge-timing lesson:** verify worker liveness by stat mtime (must be < 25 min old for 900s lane) AND metadata.updated_at (must move). Dating by bytes carries dead lanes.

### /goal cross-tool truth (verified via websearch 2026-08-10)

> **2026-08-10 /goal cross-tool truth:** Pi goal tool is single-active-goal tracker. Frontier tools (Claude Code/Codex) are richer with completion conditions + autonomous loops. Steal: goal = condition not sentence; evaluate from outside; auto-clear when met.

### Dispatch policy — SPAM THE POOL (user directive 2026-08-10 04:55)

User's standing directive: spamming logfare subagents (many parallel lanes) is
preferred practice over hand-rotated single lanes — even when their shared pool
shows mixed probe health. Retries are cheap; a lane that dies costs nothing vs
a lane that lands in a healthy window. Evidence this session: lanes that
survive a window land (w47c, w44e); most die; redundancy wins by volume.
Practice: launch N lanes, keep diversifying models (0731/minimax/kiro/pro/
glm), harvest the survivor's deliverable, wait for the rest.

### Router crash root-cause + fix (2026-08-10 05:12) — nvidia works, logfare still timeouts

> **2026-08-10 Router crash root-cause:** providers map had TWO nvidia: keys — line 82 (real) + line 465 (shadow profile, no getKeys). JS last-wins — router crashed on EVERY boot. FIX: rename shadow key nvidia_model_profiles.

### goal-tool audit (2026-08-10): 4 real downsides, fix plan

> **2026-08-10 goal-tool audit:** 4 real downsides — not sticky in lean profile, goal lost across session, no condition-syntax, no autonomous loop. FIX: goal-loop extension with persistent state + deterministic evaluator.

### Model picker: zen free models missing — FIXED (2026-08-10 ~05:4x)

> **2026-08-10 Model picker zen free models missing — FIXED:** router /catalog returned EMPTY due to fake provider without getKeys. FIX: guard providerCatalogRoute + purged empty cache. Zen free models now visible.

### Model-picker gap: catalog didn't enumerate models (2026-08-10, fixed)

> **2026-08-10 Model-picker gap catalog enumeration — FIXED:** publicCatalog returned metadata per provider with NO models array. FIX: boot-prefetch each provider models /models into CATALOG_MODELS_CACHE.

### Logfire route status (2026-08-10 05:4x, measured conclusively)

> **2026-08-10 Logfire route status:** router HEALTHY but logfire upstream generation endpoint HANGS after request forward. 3 majors (flash-0731, minimax, k3) ALL 30s-timeout. OpenCode Zen route continues 200s.



> **2026-08-10 cline = deepseek-v4-flash lane:** verified live. cline shim (port 8793) serves deepseek-v4-flash + glm-5.2-free + laguna/stepfun free. GAP: pi local model-providers registry lacks router-clinefree.



> **2026-08-10 Route policy update:** CLINE preferred over zen. cline (local shim, port 8793, keyless CLI lane) serves deepseek-v4-flash + glm-5.2-free + laguna/stepfun free. VERIFIED: cline completion answered OK ~24s.

'nextTurn' may not exist on real sendMessage; (2) no budget/infinite-loop

> **2026-08-10 Goal-loop review adjudication:** k2 (nvidia llama) reviewed loop — 3 prelim concerns. Main-lane adjudication: all 3 VERIFIED-OK. Reviewer must run actual self-test, not just read code.

- goal-loop.mjs (explicit in settings.json) = the autonomous loop: pi.on(agent_end)

> **2026-08-10 goal-loop stack = two complementary extensions:** goal.ts (interactive /goal tool) + goal-loop.mjs (autonomous loop). Pair is full /goal parity stack.

OPEN: cline-as-worker path still produces 0 output (worker harness→shim route

> **2026-08-10 goal-loop PROVEN end-to-end:** fake-pi-test.mjs: 11/11 PASS. Flagship /goal parity loop proven, not just landed.

### Fresh lane-viability table (2026-08-10 13:56 all-11 sweep, post-router-fix)

> **2026-08-10 Logfire RECOVERED:** direct probes minimax-m3 200/19s, deepseek-v4-flash-0731 HTTP429 (throttled, not hang). Fleet resumed.

decomposed wave (w91 minimax, w92 kiro) correctly selected live models.

> **2026-08-10 Fresh lane-viability table (superseded):** post-router-fix all-11 sweep. Superseded by later rosters.

qwen-3.8-max 429-throttled; others 20s timeout (logfire flapping upstream).

> **2026-08-10 Session wrap checkpoint:** gate green 3687/3687; goal-loop proven 11/11 + live-observed 2x; router crash fixed; model picker zen free models served; cline shim fixed.

"OK", finish stop, model deepseek-v4-flash. Consume cline lanes as

> **2026-08-10 cline-worker 0-output ROOT-CAUSED:** clinefree/cline-free/glm-5.2 produced 0 output; direct curl deepseek-v4-flash worked. Root cause: cline free promo ended. FIX: cline-shim MODELS[0] default to deepseek-v4-flash.

  \_renderLoopStartPending + markEngineInitPhase integration. g105 (kiro) is building the module.

> **2026-08-10 God-file decomposition state:** focus-pocket-geometry.ts SPLIT DONE (16a6e24b); three-engine-core.ts SPLIT IN-FLIGHT (g101 created init/restore/teardown but died missing render-loop).

  Lesson: concurrent writers can revert main-lane edits same-tree — checks via

> **2026-08-10 Coordination notes:** engine test-alignment (3 files) handed to g106-testalign; stray three-micro-demo-bridge.ts removed; 3d boot fix (lightningcss errorRecovery, 30528d20) is real.

- **Shared-context sessionStorage leak**: playwright.config.js uses fullyParallel:false +

> **2026-08-11 3d-test stability thread:** 3 real root causes — parity-clobber (AGP39, 5ee2ac35), shared-context sessionStorage leak (796fca2a), click-drift race (79b016eb). 3d-camera-orbit-resilience 4/4 green.

  fake-pi 11/11 PASS + live running→met/ACHIEVED transitions confirmed on the CURRENT

> **2026-08-11 Build-server inconsistency:** $state is not defined at app.svelte.ts:74 — fleet-uncommitted WIP (dirty search-mirror migration). Fleet should commit OR rebase dist.

  per-worker `goal-state.json`, exits as soon as the state settles, cancels on a

> **2026-08-11 Coordination notes session tail:** purity gate — docs/subagent-lane-inventory.md now COORDINATION_LEDGER_FILES (exempt, 664af176); fleet nested-delegation claim EVIDENCED (50+ workers); parallel-duplicate convergence byte-identical.



> **2026-08-11 ambient-zombie cleanup:** python -m http.server 8796 (PID 16748, 0 connections 6h) occupying playwright webServer port. Stopped by exact PID.

  incl. a literal nested-proof2-parent (completed, deepseek-v4-flash-0731, 457KB log).

> **2026-08-11 Zombie-metadata finding:** O2-threadaudit/grp-p4 showed status: running with logs frozen 2-3.7h. 4 of 5 were GHOSTS. Lesson: always tasklist-verify PID before killing.

  identity + idleness. Lesson: ambient `python -m http.server` zombies on 8796 break every

> **2026-08-11 Port-8796 collision recurrence:** node scripts/test-server.mjs (fleet lane leftover) bound 8796 and broke playwright runs. Check netstat BEFORE any playwright run.


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

### kilo/ openrouter free routing probe (2026-08-12)

Paths exist: /kilo/v1 + /openrouter/v1 + /opencode-zen/v1 + /freemodel/v1. The "recent" free
model ids are ALL currently unusable: qwen3-coder-next → 410 Gone (kilo/openrouter/zen — the
id's retired from the routes), kilo/deepseek-v4-flash-0731 + kiro-auto → 402 no-credit/paid,
openrouter/deepseek-r1 → no credits, zen/deepseek-v4-flash-0731 → keys-off-cooldown,
free/qwen3-coder-next → unauthorized. VERDICT: the kilo/openrouter free lanes are route-present
but dead at this window; the LIVE free deck is logfare (minimax-m3/kiro-auto/kimi-k3 — probed
OK). Re-probe before dispatching on kilo/openrouter; don't assume qwen3-coder-next exists.

### 2026-08-12: hy3-free lanes LIVE (26 workers) + conflation check

- kilo/tencent/hy3:free — the new dispatchable free tier (route: /kilo/v1, model tencent/hy3:free; probed 200). Used for kilo-hy3-\* lanes. NOTE from main lane: prefer THIS over opencode-zen.
- poolside/laguna-s-2.1 + kilo/poolside/laguna-s-2.1:free — the fallback + mobile lanes (also live).
- The opencode-zen zen route remains keyless/cooldown (dead at this window).
- Fleet-landing state: 46 dirty src, origin-ahead 23 (divergence reconcile pending a calm-commit window); their deep-cut W1-W3 UI pins + qa-ready.mjs + fold-watch tools landed.
