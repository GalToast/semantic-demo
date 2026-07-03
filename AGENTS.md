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
- Do not kill broad `node`, PowerShell, browser, Claude, Gemini, Pi, or MCP process trees. Stop only exact PIDs with command-line evidence.
- Evaluate unfamiliar changes on their merits — good changes should stick, bad ones should be fixed. Don't reflexively revert a parallel-lane change just because it doesn't match your mental model; if it improves the code, keep it. Don't preserve bad code silently because authorship is murky either — if a change introduces an error or breaks an invariant, fix it (or revert it with a brief explanation, not as a stealth revert). When parallel sessions land conflicting changes, surface the conflict in chat rather than silently picking a side.
- If durable repo behavior changes, update the appropriate repo doc in the same turn.
- Before presenting work as finished, verify against the real success criteria and state what was run.
- **Always consider whether delegation would improve throughput or end-result quality** — if yes, delegate (a subagent, deeper search, or external verification). Main-lane speedup is only a win when the alternative blocks the user; default to delegating when it is reasonable.
- **Don't stop at the "high-ROI part" when the rest is mechanical.** When a cleanup establishes a pattern (state refactor, codemod, mirror migration) and the same pattern applies to N sites, finish all N sites before stopping — even if the biggest win is already landed. Partial fixes create drift: new consumers can't use the established pattern if half the existing consumers still bypass it, and the next reader will be confused about which sites follow the new pattern. Exceptions: the user explicitly asks to stop, or the remaining work is genuinely risky / unclear (warrants a plan/decision checkpoint). The "almost done" point is not "done" when follow-through is bounded and the same pattern.
- **User-visible features require a journey test before merge.** Contract tests do not catch click-eating z-index layers, missing callbacks, or `Math.random()` stubs dressed as data. For any feature that touches a Svelte component, the desktop/mobile mount branches, or any DOM the user interacts with, add at least one test in `tests/widget-journey.spec.js` and run `npm run qa:journey:headless`. See `docs/session-coordination.md` → "The test-strategy gap" for the full rule and the W46 weather-widget case study. The pre-commit hook (`scripts/git-hooks/pre-commit` + PowerShell shim) **warns** when `src/components/*.svelte`, `src/App.svelte`, `src/lib/ui/*.ts`, or `src/lib/keyboard/*.ts` is staged without a journey test staged alongside. Override with `--SkipTestStrategyGapCheck` for pure internal refactors.
- **Always audit for logic flaws in our thinking AND in our systems before claiming done.** When we fix something, the fix is rarely complete: enumerate the data sources (which files, which fields, which code paths in the same file), verify each one with rg/git, and only then declare done. The "missed anything?" prompt almost always uncovers a missed file, a missed field (`generationConfig` sibling of `entry.X`), or a missed code path (`routerModelEntries` runs `parseCatalogModels` separately from `modelFromProviderEntry`). Cheap to audit; expensive to ship partial fixes.

## Session Lock Protocol

Before starting multi-commit work that will touch files another Pi/Codex/subagent session is likely working on, run `node scripts/session-lock.mjs acquire "<intent>"` (see `docs/session-coordination.md`). The lock is **advisory, not mandatory** — a stale lock (>30 min no heartbeat) can be taken over with `--force`. The lock file (`.session-lock`) is gitignored. Always release at end of session.

## Parallel Sessions

See `docs/session-coordination.md` — session lock + parallel-session coordination rules.

## Subagents

- Default to decomposition and delegation for meaningful multi-step work when the external-subagent tool is available.
- Keep the main lane responsible for user interaction, synthesis, and verification.
- Worker prompts must define scope, allowed files, no-revert boundaries, expected evidence, and verification commands.
- Have workers write reports/evidence under `tmp/` when practical; main lane reviews diffs and reruns deterministic checks.
- Lightly poll long-running workers (~every 2-3 min) when live steering is available — give them runway, don't micro-manage.
- Do not assume workers inherit browser/MCP tools. Have workers report exposed tools before artifact-producing work that depends on them.

**Delegation rules:** Full lifecycle, rate/polish, parallel divide-and-conquer, visual verification, and vision capability matrix are in `docs/subagent-delegation.md`.

**Lane inventory (from `model-providers.json`):**

- Primary: `kilo/openrouter/owl-alpha`
- Registered alt: `agnes-2.0-flash` (bare ref for subagent — no provider prefix)
- Free fallbacks: `mimo-v2.5-free`, `deepseek-v4-flash-free`, `nemotron-3-ultra-free`, `qwen3.6-plus-free`, `north-mini-code-free`

## Key Product Invariants

- The 8,406-point mycelium data lives in `state.rawPositionsBuffer` as `[0,1]^3` positions. W7-B Pair 2 prep preserved the unit-cube invariant via the canonical `seededUnit` re-export from `@lib/utils/seeded-random`.
- `getPointBoundsCenter(points, positionBuffer)` in `src/lib/engine/node-manager.ts` requires a non-null `Float32Array` `positionBuffer` (TypeScript-enforced). The legacy `point.x/y/z` fallback was removed because `state.points` is `BusinessRecord[]` at runtime and never carries those fields, so the fallback would silently produce `count=0` and a wrong center.
- `src/lib/state/app.svelte.ts` is the Svelte 5 global state source of truth.
- `js/workers/data-worker.ts` is active runtime via `data-worker-url-bridge.ts`.
- `micro-demo.js` / `src/lib/demo/choreography.ts` is the sole demo entry point and owns first-visit eligibility.
- CSS ownership is split by ordered modules under `css/`; use the ownership docs before editing mobile/surface styles.

## Conventions (header / mode / toast)

- **Switching modes** from any UI surface (chip rail, compass rail, welcome demo): call `selectMode(modeId, source)` from `@lib/components/header/mode-nav`. It encapsulates the lock check, URL sync, and `navState` write in one place. Don't reach into `updateUrlState` / `setJourneyPhase` / `updateNavState` directly from a click handler.
- **Checking if a mode is locked** (requires a focused business): `isModeLocked(modeId, hasSelection)` from `@lib/navigation/mode-affordances`. The `SELECTION_DEPENDENT_MODES` set (`trail`, `focus`, `inside`) is the canonical list — add new selection-dependent modes there.
- **Toast:** import `showExperienceToast` from `@lib/orchestration/toast` (Svelte-store-driven; the Toast.svelte component renders the DOM). The DOM-direct version in `@lib/ui/ui-feedback` was retired 2026-06-30.
- **Header CSS** lives in `src/lib/components/header/header.css`; Header.svelte imports it via `@import '@lib/components/header/header.css'` inside its `<style>` block. Use the same `@import`-inside-`<style>` pattern ProximityLegend uses for `z-layers.css` when extracting component CSS.
- **Journey phases are 6:** `overview → search → focus → trail → inside → map`. `trail` was added to `JOURNEY_COMPASS_PHASE_ORDER` in PR-D6.
- **Splash dismissal on deep-links (PR-B2 / PR-B4):** `parseUrlParams()` in `src/main.ts` returns `isDeepLink: true` for `?anchor=N`, `?record=N`, `?view=map`, or `?q=...` (length >= 2). When deep-link AND desktop (`renderKind !== 'placeholder2d'`), `engineReady.signalReady()` fires immediately at boot so the user sees their target state instead of being forced through the "Click Explore" gate. Mobile 2D placeholder keeps its normal splash/CTA flow. `?record=N` is mapped to the array index with `lead_id === N` inside `applyUrlState()` so a focused-business shared link restores correctly. `?story=` is intentionally NOT a deep-link — story prompts fire post-splash via DemoChoreography. If you add a new deep-link-shaped URL param, extend `parseUrlParams().isDeepLink` and document the addition here.

## Conventions (search fallback)

- **The yellow "Showing demo data" banner is intentional, not a bug.** When the live `/api.php` endpoint is unreachable (typical in dev against a static server without PHP), the engine falls back to a 20-business mock catalog and surfaces the banner so a developer doesn't mistake a 20-row fake for the full 8,406-record dataset. Don't suppress the banner; if it's noisy, lower the trigger frequency, don't silence it.
- **`sessionStorage.api_unreachable` is a time-bounded sticky bypass (PR-M), not a permanent lock.** The record is `{setAt: Date.now(), reason: string}` and expires after `API_BYPASS_STICKY_MS` (60s) on the read path. It also clears on the next successful API response. Legacy `'1'` strings are treated as expired so old tabs recover automatically. Helpers: `markApiUnreachable(reason)`, `clearApiUnreachable()`, `readApiUnreachable()` in `@lib/search/mock-search-fallback`. Never call `sessionStorage.setItem('api_unreachable', ...)` directly — go through `markApiUnreachable` so the timestamp is recorded.
- **`?staticDev=0` forces live API and surfaces failures as errors.** Used by contract tests; do not use in normal dev flows.
- **Vite dev proxies `/api*` to `127.0.0.1:8795`.** The system expects a PHP backend there (see `docs/ops/DEPLOY_STATUS.md` and `docs/ops/walkthrough-r7-findings.md`). For dev with live data: stop whatever's on 8795 (`python -m http.server` from `npm run serve` is the legacy JS track — see `memory/environment.md`, deleted 2026-06-07) and run `php -S 127.0.0.1:8795 -t .` from the repo root. PHP CLI server executes `/api.php` AND serves static files (replaces Python for both roles). PR-N makes `api.php` fall back to `src/data.dat` when no root-level `data.dat` exists, so a fresh checkout Just Works without copying.
- **The "Showing demo data" banner means either (a) the API on 8795 returned an error or raw PHP source, or (b) no PHP is listening at all.** With PR-N + PHP CLI on 8795 the banner stays hidden. To debug, curl `/api.php?action=semantic_search&q=coffee&limit=1&offset=0` with a `Referer: http://127.0.0.1:5173/` header — should return JSON `{ok: true, ...}`.

## Reference Docs

Read these only when relevant:

- CSS ownership: `docs/archive/semantic-demo-css-authority-map.md`, `docs/archive/semantic-demo-mobile-state-ownership.md`
- State transitions: `docs/semantic-demo-state-transition-table.md`
- Design tokens: `docs/semantic-demo-design-tokens.md`
- Surface style matrix: `docs/semantic-demo-surface-style-matrix.md`
- Window/global policy: `docs/window-global-allowlist.md`
- Migration plan: `docs/migration-plan.md`
- Performance: `docs/performance-budget.md`, `docs/w44-performance-attack-plan.md`
- Type discipline: `docs/typing-contract.md` — global `as any` budget, typing-contract tests, and file-specific tightening rules.
- Session coordination: `docs/session-coordination.md` — session lock, parallel-session rules, test-strategy gap.
- Subagent delegation: `docs/subagent-delegation.md` — delegation lifecycle, rate/polish, vision matrix, lane inventory.
- Important files: `docs/important-files.md` — canonical file inventory by module.
- UX copy rules: `docs/ux-copy-rules.md` — forbidden jargon in user-facing strings, friendly copy patterns, label conventions. For any change that touches strings the user sees (`.svelte` template text, copy returned by helpers, status messages), check against this list.
- Historical full agent reference: `docs/archive/agents-full-reference-2026-06-19.md`

If a referenced doc is missing, use the archived full reference as fallback and consider restoring a concise dedicated doc.

## Important Files

See `docs/important-files.md` for the canonical file inventory by module (Engine, Journey, Focus, Orchestration, State/Data, Search, UI/Chrome).

## Dev Commands

```bash
npm run build
npm run lint
npm run test
npm run test:unit
npm run test:contract
npm run qa:contract
npm run qa:surface:all
npm run qa:surface:mobile-idle
npm run test:microdemo
npm run serve
npm run audit:a11y           # a11y lint for src/components/*.svelte (tabulated)
npm run audit:a11y:strict    # same, exit 1 on any HIGH finding
npm run audit:a11y:json      # same, machine-readable JSON
```

`scripts/audit-a11y.mjs` checks 8 rules: button type, button aria-label, form input id/aria, interactive non-semantic containers, image alt, low-alpha colors, outline suppression, aria-hidden wrapping focusable children. Use `--file=<Substring>` and `--severity=HIGH|MED|LOW` to filter.

Use narrower checks when validating a scoped change.

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
- Pi harness self-improvement is allowed when friction reveals a safe, scoped upgrade.
- Keep reusable Pi harness rules in global Pi docs/skills where appropriate, not in this repo file unless they are repo-specific.
- For JavaScript scratch work, prefer the `js-repl` skill/tool when available instead of embedding REPL rules here.

## Key Product Invariants (W47 hot-path)

- **Svelte 5 reactivity fix pattern (PR-2 / 3-bug stack, see `346891d8`):**
  - **One-time-snapshot state reads `const renderKind = getInitialRenderKind()`** is the foot-gun. Switch to `$state: $derived(getBypassAttr('renderKind') ?? getInitialRenderKind())" so body class flips react to gate flips.
  - **Order matters:** `setRenderKind(getInitialRenderKind())` MUST run before `mount(App)` so the Playwright auto-signal from `__PLAYWRIGHT__` wins cleanly when the test wants webgl, instead of being overwrote by the later placeholder-path setRenderKind.
  - **First-visit help dialog** can sit on top of the search input on mobile; dismiss it in any test that types into the input (fills dialog + 1 .fill() line).
  - All three land together in one fix. Same pattern recurs wherever a module has `const foo = getInitial*()` at the top.

## Pi Harness Notes
