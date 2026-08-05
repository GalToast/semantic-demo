# Agents - Semantic Explorer

## Purpose

Semantic Explorer is a 3D semantic mycelium visualization for exploring Montgomery County TX business relationships.

This file is loaded into every Pi model call. Keep it concise. Detailed reference material belongs in `docs/`, not here.

## Prompt Budget

- Do not add large reference tables, historical wave notes, file inventories, or long command transcripts to `AGENTS.md`.
- Put bulky guidance in `docs/` and link to it from here.
- The previous full instruction/reference file is archived at `docs/archive/agents-full-reference-2026-06-19.md`.
- Before adding durable rules, ask whether the rule must be hot-path context for every turn.

## Operating Rules

- Check this repo-local `AGENTS.md` before repo-specific work.
- Prefer scoped reads/searches over broad recursive scans in this repo.
- Use `rg` for text search unless an ast-grep skill/tool is available and the task is structural TypeScript/Svelte matching.
- **Tool routing:** `ast-grep` (via `pi_tool ast_grep_search` or the `ast-grep` skill) for structural TS/Svelte; `lsp-navigation` for go-to-def/references/diagnostics; `mcp` for browser (`playwright`), `external_subagents`, `switchboard`, `websearch`, `chrome-devtools`, `nvidia-capabilities`; `pi_tool` for `ctx_*`, `ast_grep_*`, `memory_*`, `preview_export`, `session_search`. Full policy: `docs/tool-guide.md`.
- Do not kill broad `node`, PowerShell, browser, Claude, Gemini, Pi, or MCP process trees. Stop only exact PIDs with command-line evidence.
- Evaluate unfamiliar changes on their merits — good changes should stick, bad ones should be fixed. Don't reflexively revert a parallel-lane change just because it doesn't match your mental model; if it improves the code, keep it. Don't preserve bad code silently because authorship is murky either — if a change introduces an error or breaks an invariant, fix it (or revert it with a brief explanation, not as a stealth revert). When parallel sessions land conflicting changes, surface the conflict in chat rather than silently picking a side.
- If durable repo behavior changes, update the appropriate repo doc in the same turn.
- Before presenting work as finished, verify against the real success criteria and state what was run.
- **Default to delegating when it improves throughput/quality.** Main-lane speedup only wins when the alternative blocks the user.
- **Finish all N sites of an established pattern, not just the high-ROI one.** Partial pattern fixes create drift — new consumers can't rely on it if half the old sites bypass it. Stop only on user request or genuine risk.
- **User-visible features need a journey test.** Svelte/DOM-touching features → add a test in `tests/widget-journey.spec.js` + run `npm run qa:journey:headless`. Contract tests miss click-eating z-index / missing-callback / `Math.random()`-as-data bugs. Pre-commit hook warns on unstaged-journey-test for `*.svelte`/`App.svelte`/`lib/ui`/`lib/keyboard`; `--SkipTestStrategyGapCheck` for pure refactors. Full rule: `docs/session-coordination.md` § test-strategy gap.
- **Audit before "done".** Enumerate every data source (files/fields/code paths), verify each with rg/git. Partial fixes miss siblings (`generationConfig` next to `entry.X`) or parallel code paths (`routerModelEntries` runs `parseCatalogModels` separately from `modelFromProviderEntry`). Cheap to audit, expensive to ship half.
- **Polish to 10/10; delegating parts doesn't delegate ownership.** Subagent plans AND outputs must both be main-lane-polished to the real success criteria before done. "Good enough to delegate" ≠ done.

## Session Lock Protocol

Before starting multi-commit work that will touch files another Pi/Codex/subagent session is likely working on, run `node scripts/session-lock.mjs acquire "<intent>"` (see `docs/session-coordination.md`). The lock is **advisory, not mandatory** — a stale lock (>30 min no heartbeat) can be taken over with `--force`. The lock file (`.session-lock`) is gitignored. Always release at end of session.

## Parallel Sessions

See `docs/session-coordination.md` — session lock + parallel-session + switchboard coordination.**Check the switchboard before assuming you're alone on a file**: attach via `mcp switchboard_join_chat` (server `switchboard`) and read recent messages when other sessions may be active (quick-start: `docs/tool-guide.md` §4). The session lock is advisory and lane-specific — a live lock held by another lane does NOT mean they aren't sweeping the same seam (visual-state lane has repeatedly touched tests/, navigation, and mode-transitions mid-flight), so verify via switchboard and keep edits out of their touched files when coordination isn't possible.

## Subagents

- Default to decomposition and delegation for meaningful multi-step work when the external-subagent tool is available.
- Keep the main lane responsible for user interaction, synthesis, and verification.
- Worker prompts must define scope, allowed files, no-revert boundaries, expected evidence, and verification commands.
- Have workers write reports/evidence under `tmp/` when practical; main lane reviews diffs and reruns deterministic checks.
- Lightly poll long-running workers (~every 2-3 min) when live steering is available — give them runway, don't micro-manage.
- **Steering a live worker:** `external_subagent_steer({ worker_id, prompt_text })` — the message goes in `prompt_text`; `message`/`session_id` are NOT steer params (using them trips the start-handler validation and falsely looks like a broken endpoint). True live input requires the target worker launched with `live_steer=true` (verify `steerable: true`); otherwise steer returns a `delegate_to_followup` decision. Steer only for mid-flight nudges — relaunch when a worker is mis-launched (broken `cwd`, wrong harness) with zero progress.
- Do not assume workers inherit browser/MCP tools. Have workers report exposed tools before artifact-producing work that depends on them.

**Delegation rules:** Full lifecycle, rate/polish, parallel divide-and-conquer, visual verification, and vision capability matrix are in `docs/subagent-delegation.md`.

**Lane inventory:** per-model ✅/❌ viability + route strings live in `docs/subagent-lane-inventory.md` (probed 2026-07-27). Critical: `kilo/openrouter/owl-alpha` is dead (404 on both gateways, absent from `/v1/models`) — do not re-add.

## Key Product Invariants

- The 8,406-point mycelium data lives in `state.rawPositionsBuffer` as `[0,1]^3` positions. W7-B Pair 2 prep preserved the unit-cube invariant via the canonical `seededUnit` re-export from `@lib/utils/seeded-random`.
- `getPointBoundsCenter(points, positionBuffer)` in `src/lib/engine/node-manager.ts` requires a non-null `Float32Array` `positionBuffer` (TypeScript-enforced). The legacy `point.x/y/z` fallback was removed because `state.points` is `BusinessRecord[]` at runtime and never carries those fields, so the fallback would silently produce `count=0` and a wrong center.
- `src/lib/state/app.svelte.ts` is the Svelte 5 global state source of truth.
- `src/lib/workers/data-worker.ts` is active runtime via `src/lib/workers/data-worker-url.ts` (Vite worker URL import boundary).
- `src/components/DemoChoreography.svelte` + `src/lib/stores/demo.svelte.ts` (10-phase) is the canonical demo; initMicroDemo() in `choreography.ts` is deprecated legacy (0 callers, warning only). Eligibility lives in `shouldRunDemo()` in the Svelte store (checks isDeepLink, seen, session, reduced-motion). Replay dispatches `demo-replay-requested` → DemoChoreography re-runs attemptStart after sceneReady (prevents stacked veils, M15).
- CSS ownership is split by ordered modules under `css/`; use the ownership docs before editing mobile/surface styles.

## Conventions (header / mode / toast)

- **Switching modes** from any UI surface (chip rail, compass rail, welcome demo): call `selectMode(modeId, hasSelection, ctx)` from `@lib/components/header/mode-nav` — `ctx` injects `navActions`/`dispatchNavTransition`/`updateUrlState`/`debugWarn` so the lock check, nav transition, and URL/navState sync route through one test-stubbable funnel. Don't reach into `updateUrlState` / `setJourneyPhase` / `updateNavState` directly from a click handler.
- **Checking if a mode is locked** (requires a focused business): `isModeLocked(modeId, hasSelection)` from `@lib/navigation/mode-affordances`. The `SELECTION_DEPENDENT_MODES` set (`trail`, `focus`, `inside`) is the canonical list — add new selection-dependent modes there.
- **Toast:** import `showExperienceToast` from `@lib/orchestration/toast` (Svelte-store-driven; the `Toast.svelte` component renders the DOM). Only the DOM-direct `showExperienceToast` (manual `textContent`/`classList` mutation of `#experience-reset-toast`) was retired to `@lib/orchestration/toast` (2026-06-30); `@lib/ui/ui-feedback` itself is still live and provides `syncSearchStatusForFocus`.
- **Header CSS** lives in `src/lib/components/header/header.css`; Header.svelte imports it via `@import '@lib/components/header/header.css'` inside its `<style>` block. Use the same `@import`-inside-`<style>` pattern ProximityLegend uses for `z-layers.css` when extracting component CSS.
- **Journey phases are 6:** `overview → search → focus → trail → inside → map`. `trail` was added to `JOURNEY_COMPASS_PHASE_ORDER` in PR-D6.
- **Splash dismissal on deep-links (PR-B2 / PR-B4):** `parseUrlParams()` in `src/main.ts` returns `isDeepLink: true` for `?anchor=N`, `?record=N`, `?view=map`, or `?q=...` (length >= 2). When deep-link AND desktop (`renderKind !== 'placeholder2d'`), `engineReady.signalReady()` fires immediately at boot so the user sees their target state instead of being forced through the "Click Explore" gate. Mobile 2D placeholder keeps its normal splash/CTA flow. `?record=N` is mapped to the array index with `lead_id === N` inside `applyUrlState()` so a focused-business shared link restores correctly. `?story=` is intentionally NOT a deep-link — story prompts fire post-splash via DemoChoreography. If you add a new deep-link-shaped URL param, extend `parseUrlParams().isDeepLink` and document the addition here.

## Conventions (search fallback)

Live data needs PHP on 8795 (`php -S 127.0.0.1:8795 -t .`); Vite proxies `/api*` there. `?staticDev=0` forces live + surfaces errors (contract tests only). The yellow "demo data" banner = API errored / not listening, NOT the local 8,406 index. Full detail (banner events, `api_unreachable` sticky-bypass expiry, curl recipe): `docs/search-fallback.md`.

## Reference Docs

Read only when relevant (full module inventory: `docs/important-files.md`):

- `docs/css-ownership.md` — CSS module ownership
- `docs/cleanup-plans/` — Wave 1 source-of-truth work list (file:line cites, commit order, gates; audited at HEAD `5222e684`)
- `docs/semantic-demo-state-transition-table.md` — state transitions
- `docs/semantic-demo-design-tokens.md` — design tokens
- `docs/semantic-demo-surface-style-matrix.md` — surface style matrix
- `docs/window-global-allowlist.md` — window/global policy
- `docs/migration-plan.md` — migration plan
- `docs/performance-budget.md`, `docs/w44-performance-attack-plan.md` — performance
- `docs/typing-contract.md` — `as any` budget, typing-contract tests
- `docs/session-coordination.md` — session lock, parallel sessions, test-strategy gap
- `docs/subagent-delegation.md` — delegation lifecycle, rate/polish, vision matrix
- `docs/subagent-lane-inventory.md` — per-model subagent viability + routes
- `docs/search-fallback.md` — API/banner fallback detail
- `docs/dev-commands.md` — full script list + a11y flags
- `docs/important-files.md` — canonical file inventory by module
- `docs/ux-copy-rules.md` — forbidden jargon + friendly copy (check any user-visible string)
- `docs/tool-guide.md` — tool routing + switchboard recipe
- `docs/archive/agents-full-reference-2026-06-19.md` — historical full reference

If a referenced doc is missing, use the archived full reference as fallback.

## Important Files

See `docs/important-files.md` for the canonical file inventory by module (Engine, Journey, Focus, Orchestration, State/Data, Search, UI/Chrome).

## Dev Commands

Core: `npm run build` · `npm run lint` · `npm run test:unit` · `npm run qa:contract`. Full script list + `audit-a11y` flags + single-surface example: `docs/dev-commands.md`.

## Surface Tests

`tests/surface-contract-check.mjs` runs DOM/layout assertions for named surfaces such as `mobile-idle`, `desktop-idle`, `launch-focus`, `search-error`, `map-trail`, `focus-pocket`, `field-node`, `info-panel-empty`, `compass-rail`, `loading-overlay`, `mode-grid`, `filters`, `thread-inspector`, `controls`, `search-chrome`, `info-panel-populated`, and `global-spacing`.

`tests/visual-state-audit.mjs` captures screenshots for visual QA.

## Edit Safety

- Prefer the established Svelte/TypeScript patterns in nearby files.
- Keep edits scoped to the requested seam.
- Preserve JS/TS bridge behavior unless the task is explicitly migration cleanup.
- For UI work, verify at desktop and mobile sizes when layout can change.
- For engine/WebGL work, verify that the canvas renders nonblank and resources are disposed.

## Pi Harness Notes

- `memory_write` is broken at the gateway layer until `~/.pi/agent/extensions/pi-hermes-memory-writer.ts` is loaded — a one-time repair Pi performs at session start. If you ever see `pi_tool memory_write → Tool not found`, run `/reload-runtime` or restart once. See `~/.pi/agent/patches/pi-hermes-memory-writer.md` for the failure mode + verification recipe.
- **Constantly improve** the Pi harness, key-router (`opencode-key-router.mjs`), environment, skills, system prompts, memory stores, and tools — when friction presents OR when an observation warrants it (not a per-turn mandate; don't manufacture work where there's no surfaced opportunity). Look for safe, scoped upgrades that grow model performance, intelligence, memory, and helpfulness across sessions. Capture coding gains as skills (`skill_manage`) + repo docs; route user-preference / life-side gains to `pi_tool memory_write target:"user"` so they persist. Long-term compound goal: an amazing coding AND life assistant.
- Keep reusable Pi harness rules in global Pi docs/skills where appropriate, not in this repo file unless they are repo-specific.
- For JavaScript scratch work, prefer the `js-repl` skill/tool when available instead of embedding REPL rules here.
- **Knowledge-gap default → `websearch`** (MCP `websearch_*` via `mcp`). When local files, memory, and `ctx` don't give a confident answer (current model release dates, current API syntax, current docs, current router/provider health, time-sensitive facts) — search instead of speculate. Always available any turn; treat as always-on external memory.

## Hot-Path Patterns (Svelte 5)

- **`const x = getInitial*()` snapshot foot-gun** (PR-2 3-bug stack, `346891d8`): top-of-module one-time reads miss gate flips. Use `$state: $derived(getBypassAttr('x') ?? getInitial*())`. `setRenderKind(getInitialRenderKind())` MUST run before `mount(App)` so the `__PLAYWRIGHT__` auto-signal wins. Mobile first-visit help dialog sits over the search input — dismiss it in tests that `.fill()` the input.
- **Asymmetric `$derived` gate widening** (W53 trail-button `671af64c`): widening a parent gate (`App.svelte:211` `focusActive`) MUST mirror the same predicates into child gates gating DOM (`JourneyChrome.svelte:131` `chromeHasFocus`). Asymmetric gating causes silent 30s e2e timeouts (parent mounts child, child's stricter gate stays false -> `#btn-focus-path` never mounts). `check:svelte`/lint won't catch it.
- **Lockstep predicate set** for `focusActive` (App) + `chromeHasFocus` (JourneyChrome): `parity.focusPanelMode === 'field-node' || parity.panelSurface in {focus,inside,trail,focus-search,semantic-dive} || parity.focusSearchForced`. Both import `useParityAttrs()` so parity flips roll through.
