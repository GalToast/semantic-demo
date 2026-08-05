# Agents - Semantic Explorer

## Purpose

Semantic Explorer is a 3D semantic mycelium visualization for exploring Montgomery County TX business relationships.

This file is loaded into every Pi model call. Keep it concise. Detailed reference material belongs in `docs/`, not here.

## Prompt Budget

- Do not add large reference tables, historical wave notes, file inventories, or long command transcripts to `AGENTS.md`.
- Put bulky guidance in `docs/` and link to it from here. Archive: `docs/archive/agents-full-reference-2026-06-19.md`.
- Before adding durable rules, ask whether the rule must be hot-path context for every turn.

## Operating Rules

- Check this repo-local `AGENTS.md` before repo-specific work. Prefer scoped reads/searches over broad recursive scans.
- Use `rg` for text search unless an ast-grep skill/tool is available and the task is structural TypeScript/Svelte matching.
- **Tool routing:** `ast-grep` (via `pi_tool ast_grep_search` or the `ast-grep` skill) for structural TS/Svelte; `lsp-navigation` for go-to-def/references/diagnostics; `mcp` for browser (`playwright`), `external_subagents`, `switchboard`, `websearch`, `chrome-devtools`, `nvidia-capabilities`; `pi_tool` for `ctx_*`, `ast_grep_*`, `memory_*`, `preview_export`, `session_search`. Full policy: `docs/tool-guide.md`.
- Do not kill broad `node`, PowerShell, browser, Claude, Gemini, Pi, or MCP process trees. Stop only exact PIDs with command-line evidence.
- Evaluate unfamiliar changes on their merits — good changes should stick, bad ones should be fixed. Don't reflexively revert a parallel-lane change; surface conflicts in chat rather than silently picking a side.
- If durable repo behavior changes, update the appropriate repo doc in the same turn.
- Before presenting work as finished, verify against the real success criteria and state what was run.
- **Verify "impossible" claims against the actual environment before believing them.** Twice (2026-08-05) a "can't run here" conclusion was wrong — the fix was a flag: `--enable-unsafe-swiftshader` for software WebGL (`SEMANTIC_FORCE_WEBGL_SOFTWARE=1`) and `--use-angle=d3d11` to reach the real physical GPU (`SEMANTIC_USE_D3D11=1`; RTX 4050 + Intel UHD). Probe the actual capability before declaring something environment-gated.
- **Default to delegating when it improves throughput/quality.** Main-lane speedup only wins when the alternative blocks the user.
- **Finish all N sites of an established pattern, not just the high-ROI one.** Partial pattern fixes create drift. Stop only on user request or genuine risk.
- **User-visible features need a journey test.** Svelte/DOM-touching features → add a test in `tests/widget-journey.spec.js` + run `npm run qa:journey:headless`. Pre-commit hook warns on unstaged-journey-test for `*.svelte`/`App.svelte`/`lib/ui`/`lib/keyboard`; `--SkipTestStrategyGapCheck` for pure refactors. Full rule: `docs/session-coordination.md` § test-strategy gap.
- **Audit before "done".** Enumerate every data source (files/fields/code paths), verify each with rg/git. Cheap to audit, expensive to ship half.
- **Polish to 10/10; delegating parts doesn't delegate ownership.** Subagent plans AND outputs must both be main-lane-polished to the real success criteria before done.

## Session Lock Protocol

Before starting multi-commit work that will touch files another Pi/Codex/subagent session is likely working on, run `node scripts/session-lock.mjs acquire "<intent>"` (see `docs/session-coordination.md`). The lock is **advisory, not mandatory** — a stale lock (>30 min no heartbeat) can be taken over with `--force`. The lock file (`.session-lock`) is gitignored. Always release at end of session.

## Parallel Sessions

**Check the switchboard before assuming you're alone on a file**: attach via `mcp switchboard_join_chat` (server `switchboard`) and read recent messages when other sessions may be active (quick-start: `docs/tool-guide.md` §4). The session lock is advisory and lane-specific — a live lock held by another lane does NOT mean they aren't sweeping the same seam, so verify via switchboard and keep edits out of their touched files when coordination isn't possible. Details: `docs/session-coordination.md`.

## Subagents

- Default to decomposition and delegation for meaningful multi-step work when the external-subagent tool is available. Keep the main lane responsible for user interaction, synthesis, and verification.
- Worker prompts must define scope, allowed files, no-revert boundaries, expected evidence, and verification commands. Have workers write reports/evidence under `tmp/`; main lane reviews diffs and reruns deterministic checks.
- Lightly poll long-running workers (~every 2-3 min) when live steering is available — give them runway, don't micro-manage.
- **Steering a live worker:** `external_subagent_steer({ worker_id, prompt_text })` — the message goes in `prompt_text`; `message`/`session_id` are NOT steer params. True live input requires `live_steer=true` (verify `steerable: true`); otherwise steer returns `delegate_to_followup`. Steer only for mid-flight nudges — relaunch when a worker is mis-launched with zero progress.
- Do not assume workers inherit browser/MCP tools. Have workers report exposed tools before artifact-producing work that depends on them.
- **Rubric-first prompts (Kimi K2 pipeline):** spell out success criteria + scoring rubric BEFORE execution in every worker prompt — not as an afterthought. Rubric-first task design also prevents reward hacking: prefer tasks that are **hard to solve, easy to verify** (execution-passed tests over LLM-judged rubrics) — Qwen3-Coder agentic-RL principle.
- **Skills are default-shapers, not constraints (measured 2026-08-05):** skill bodies may not be injected into worker sessions (loader gaps, frontmatter failures, availability subsets). When a behavior is mandatory, embed it in the prompt itself; skills only nudge defaults (verified via 2 A/B rounds, `docs/subagent-model-benchmarks.md`).
- **Long-running work needs a session-state artifact protocol (Anthropic harness blog + Kimi K2.6):** for multi-session delegated work, an initializer writes a progress artifact + structured feature list (pass/fail per item); every session starts with a smoke test before new work; commit at session end with progress notes. Zero-cost fix for the agent-forgets-what-it-did failure mode.
- **Track durability on long runs (K2.6 benchmark: 4,000+ tool calls / 12+ h):** for long-horizon workers, log tool-call counts + context utilization — survival ≠ intelligence; a worker that stayed coherent across 50+ tool calls is a stronger signal than a single task pass.

**Delegation rules:** full lifecycle, rate/polish, parallel divide-and-conquer, visual verification, and vision capability matrix: `docs/subagent-delegation.md`. **Lane inventory:** per-model viability + route strings: `docs/subagent-lane-inventory.md`. Critical: `kilo/openrouter/owl-alpha` is dead — do not re-add.

## Key Product Invariants

- The 8,406-point mycelium data lives in `state.rawPositionsBuffer` as `[0,1]^3` positions, via the canonical `seededUnit` re-export from `@lib/utils/seeded-random`.
- `getPointBoundsCenter(points, positionBuffer)` in `src/lib/engine/node-manager.ts` requires a non-null `Float32Array` `positionBuffer` (TypeScript-enforced). The legacy `point.x/y/z` fallback was removed because `state.points` is `BusinessRecord[]` at runtime and never carries those fields.
- `src/lib/state/app.svelte.ts` is the Svelte 5 global state source of truth.
- `src/lib/workers/data-worker.ts` is active runtime via `src/lib/workers/data-worker-url.ts` (Vite worker URL import boundary).
- `src/components/DemoChoreography.svelte` + `src/lib/stores/demo.svelte.ts` (10-phase) is the canonical demo; `initMicroDemo()` in `choreography.ts` is deprecated legacy (0 callers). Eligibility lives in `shouldRunDemo()` (checks isDeepLink, seen, session, reduced-motion). Replay dispatches `demo-replay-requested` → DemoChoreography re-runs attemptStart after sceneReady (prevents stacked veils, M15).
- CSS ownership is split by ordered modules under `css/`; use the ownership docs before editing mobile/surface styles.

## Conventions (header / mode / toast)

- **Switching modes** from any UI surface: call `selectMode(modeId, hasSelection, ctx)` from `@lib/components/header/mode-nav`. Don't reach into `updateUrlState` / `setJourneyPhase` / `updateNavState` directly from a click handler.
- **Checking if a mode is locked:** `isModeLocked(modeId, hasSelection)` from `@lib/navigation/mode-affordances`. `SELECTION_DEPENDENT_MODES` = (`trail`, `focus`, `inside`) — add new selection-dependent modes there.
- **Toast:** import `showExperienceToast` from `@lib/orchestration/toast`. `@lib/ui/ui-feedback` is still live and provides `syncSearchStatusForFocus`.
- **Header CSS** lives in `src/lib/components/header/header.css`, imported via `@import` inside the `<style>` block — same pattern ProximityLegend uses for `z-layers.css`.
- **Journey phases are 6:** `overview → search → focus → trail → inside → map`.
- **Splash dismissal on deep-links (PR-B2 / PR-B4):** `parseUrlParams()` returns `isDeepLink: true` for `?anchor=N`, `?record=N`, `?view=map`, or `?q=...` (length >= 2). Deep-link + desktop → `engineReady.signalReady()` fires immediately at boot. Mobile 2D placeholder keeps the normal splash/CTA flow. `?record=N` maps to the array index with `lead_id === N` in `applyUrlState()`. `?story=` is intentionally NOT a deep-link. If you add a deep-link-shaped URL param, extend `parseUrlParams().isDeepLink`.

## Conventions (search fallback)

Live data needs PHP on 8795 (`php -S 127.0.0.1:8795 -t .`); Vite proxies `/api*` there. `?staticDev=0` forces live + surfaces errors (contract tests only). The yellow "demo data" banner = API errored / not listening, NOT the local 8,406 index. Full detail: `docs/search-fallback.md`.

## Reference Docs

Read only when relevant (full module inventory: `docs/important-files.md`; full procedure refs: `docs/tool-guide.md`, `docs/session-coordination.md`, `docs/subagent-delegation.md`, `docs/subagent-lane-inventory.md`, `docs/vision-lane-catalog.md`, `docs/css-ownership.md`, `docs/dev-commands.md`, `docs/ux-copy-rules.md`, `docs/search-fallback.md`, `docs/typing-contract.md`, `docs/performance-budget.md`, `docs/migration-plan.md`, `docs/window-global-allowlist.md`, `docs/semantic-demo-*`). If a referenced doc is missing, use the archived full reference (`docs/archive/agents-full-reference-2026-06-19.md`) as fallback.

## Dev Commands & Surface Tests

Core: `npm run build` · `lint` · `test:unit` · `qa:contract`. Full script list + a11y flags: `docs/dev-commands.md`. Surface tests: `tests/surface-contract-check.mjs` (DOM/layout assertions per named surface) + `tests/visual-state-audit.mjs` (screenshots).

## Edit Safety

- Prefer the established Svelte/TypeScript patterns in nearby files. Keep edits scoped to the requested seam.
- Preserve JS/TS bridge behavior unless the task is explicitly migration cleanup.
- For UI work, verify at desktop and mobile sizes when layout can change.
- For engine/WebGL work, verify that the canvas renders nonblank and resources are disposed.

## Pi Harness Notes

- **Skills silently fail to load when frontmatter YAML breaks** (inner double quotes, single-line frontmatter, embedded structured fields — loader drops them with only a console warning). After creating/editing a SKILL.md, verify it loads: `node --input-type=module -e "import {loadSkills} from 'file:///<pi>/dist/core/skills.js'; ..."` (see `skill-authoring` skill).
- `memory_write` is broken at the gateway layer until `~/.pi/agent/extensions/pi-hermes-memory-writer.ts` is loaded. If `pi_tool memory_write → Tool not found`, run `/reload-runtime` or restart once. See `~/.pi/agent/patches/pi-hermes-memory-writer.md`.
- **Constantly improve** the Pi harness, key-router, environment, skills, system prompts, memory stores, and tools — when friction presents OR when an observation warrants it (not a per-turn mandate). Capture coding gains as skills + repo docs; route user-preference / life-side gains to `pi_tool memory_write target:"user"`. Long-term compound goal: an amazing coding AND life assistant.
- Keep reusable Pi harness rules in global Pi docs/skills, not in this repo file unless repo-specific.
- **Knowledge-gap default → `websearch`** (MCP `websearch_*` via `mcp`). When local files, memory, and `ctx` don't give a confident answer — search instead of speculate. Always available any turn; treat as always-on external memory.

## Hot-Path Patterns (Svelte 5)

- **`const x = getInitial*()` snapshot foot-gun** (PR-2, `346891d8`): top-of-module one-time reads miss gate flips. Use `$state: $derived(getBypassAttr('x') ?? getInitial*())`. `setRenderKind(getInitialRenderKind())` MUST run before `mount(App)`. Mobile first-visit help dialog sits over the search input — dismiss it in tests that `.fill()` the input.
- **Asymmetric `$derived` gate widening** (W53, `671af64c`): widening a parent gate (`App.svelte:211` `focusActive`) MUST mirror the same predicates into child gates gating DOM (`JourneyChrome.svelte:131` `chromeHasFocus`). Asymmetric gating causes silent 30s e2e timeouts. `check:svelte`/lint won't catch it.
- **Lockstep predicate set** for `focusActive` (App) + `chromeHasFocus` (JourneyChrome): `parity.focusPanelMode === 'field-node' || parity.panelSurface in {focus,inside,trail,focus-search,semantic-dive} || parity.focusSearchForced`. Both import `useParityAttrs()` so parity flips roll through.
