# Active Context — semantic-explorer

**Last updated:** 2026-06-30 (W30 UI/UX focus round CLOSED: PR-A header lock + mobile WCAG, PR-B content + mobile desc, PR-C MANIFOLD dedup, PR-D lock SVG + View-on-Map wrap, PR-E MANIFOLD auto-dismiss + trail-context CSS fix + mobile desc ellipsis)
**⚠ Update-prone:** Refresh this file whenever migration state, demo readiness, or blockers change.

## Migration status (Svelte + TypeScript)

- **Scaffold:** 25 Svelte components currently present under `src/components/`
- **Stores/types:** 12/12 stores, 4/4 type files, 4/4 orchestration files complete
- **Bridge:** `src/lib/engine/bridge.ts` ~1212 lines, imperative legacy bridge
- **Svelte check:** `npm run check:svelte` passes with 0 errors / 0 warnings as of 2026-06-13.
- **Build:** `npm run build:svelte` passes as of 2026-06-13 with **zero** `INEFFECTIVE_DYNAMIC_IMPORT` warnings after the Ticket 9A + 9B + 9C wave. `Canvas.svelte` lazy-loads `@lib/engine`, creating a separate `engine-*.js` chunk; remaining build chatter is expected runtime CSS resolution notices, plugin timing output, and the large chunk warning.
- **Legacy TS progress:** `npm run check:ts-progress` reports 151 runtime modules, 103 TS-only, 48 BOTH (`.ts` + `.js` shadow), 0 JS-only, 0 drift pairs.
- **Legacy entry:** `js/modules/app.ts` is the legacy/reference bundle entry; production remains the Svelte/Vite shell.
- **BOTH-pattern follow-up queue: EMPTY.** All 6 tickets closed (1+2, 3, 4, 5, 6, 8). See `docs/both-pattern-follow-ups-2026-06-13.md`.
- **Wave 9 (legacy-runtime retirement): CLOSED.** All 5 tickets done (9A, 9B, 9C, 9D, 9E) per `docs/legacy-runtime-retirement-roadmap-2026-06-13.md` and `docs/legacy-runtime-retirement.md`. **0 dynamic `@legacy/*` imports remain in `src/`** (down from 15 pre-wave).
- **A worker (9D-Option-B): CLOSED.** Worker `ocw_b4e07b6e` completed 2026-06-13. 35 source files rewritten as relative paths; BOTH bridge fully dropped from src/, vite.config.ts, vitest.config.js. **0 `@legacy` and 0 `@legacy-js` references in source code** (verified by `both-bridge-shape-invariant.test.ts`). The ambient declaration file `src/lib/types/legacy-modules.d.ts` was deleted. Cascade type-cast cleanup: 61 `unknown` intermediate casts across 5 files.
- **InfoPanel:** Single-track product surface in `src/components/InfoPanel.svelte`; keep legacy compatibility artifacts separate from product ownership.
- **Migration plan:** `docs/phase56-migration-plan.md` is the latest bridge-elimination plan; verify against live `check:ts-progress` before executing old advice.

## Invariant tests (in `tests/unit-active/`, run with `npm run test:unit`)

5 invariant tests in place, all pass:

- **`with-state-mutation-invariant.test.ts`** — scans for direct mutations of `CRITICAL_KEYS` / `TRACKED_SUB_KEYS` (per `src/lib/state/with-state-mutation.ts`) outside a `withStateMutation(() => { ... })` block. Supports the local alias `withMutation` (used in `demo-choreography.ts`). Catches regressions in the AGENTS.md invariant: "All mutations to navState, strandContinuityState, and other TRACKED_SUB_KEYS in state.js MUST be wrapped in withStateMutation()." Current: 0 violations.
- **`css-important-invariant.test.ts`** — regression detector for the AGENTS.md rule "Avoid `!important` as a default CSS fix." Counts `!important` uses across `css/` and `src/lib/css/`; fails on increase. Current: 7 uses (matches baseline; no new uses).
- **`commit-purity-invariant.test.ts`** — meta-test that scans `git log` for commit title prefixes (e.g., `docs(...)`, `fix(...)`) and asserts the prefix matches the file classes in the commit. HARD FAIL: `docs(...)` or `test(...)` must be 100% file-class match. SOFT WARN: `feat/fix/refactor(...)` should have ≥50% parenthetical-scope match. Motivation: the `b5ad93e → 0761a80` failure mode. The test is grandfathered with `EXEMPTED_SHAS` for known exceptions.
- **`todo-without-ticket-invariant.test.ts`** — scans source dirs (js/modules, src/lib, src/components, src/App.svelte, vite.config.ts, vitest.config.js) for TODO comments without a ticket reference (T-XXX, #XXX, "Ticket XXX", "Issue #XXX", "BOTH-XXX", "Wave X"). Fails if the count grows. **Current baseline: 0** (S6 arc closed on 2026-06-13; all 10 S6-arc TODOs resolved).
- **`both-bridge-shape-invariant.test.ts`** — scans src/, vite.config.ts, vitest.config.js, and src/tsconfig.json for any `@legacy` or `@legacy-js` reference. Fails on any match. Locks in the Wave 9 retirement.

To add a sixth invariant test: follow the same pattern (read the AGENTS.md rule, write a regex/scanner test, fail with a clear error message). Examples: off-limits-files guard, no-Math.random()-in-WebGL guard, seededUnit() invariant in geometry code.

## Demo readiness

- Svelte demo store/choreography regression for dismiss-in-COMPLETE state passes via `node tests/dismiss-in-complete-state-contract.mjs` as of 2026-06-13.
- Headed Svelte product playthrough passes with 0 ownership failures as of artifact `tmp/product-qa/2026-06-13T22-13-17-040Z`. The route seam is fixed: search focus hydrates neighbor candidates/pills, pill tap opens the thread inspector, Follow creates trail walk history, Step Inside reaches semantic dive, Map is reached through a real user route, and County reset returns to `map-idle` with search cleared from URL/store/DOM.
- Micro-demo legacy/reference path remains functional with verified state machine unless current contract runs prove otherwise.
- Do not reuse the old 2026-06-09 contract-failure list without re-running the focused contracts; current quick checks passed.
- Bugsweep 2026-06-05 resolved all 4 HIGH JS bugs (strand-continuity, three-interaction-visuals, state.js Proxy, three-node-manager textures).

## Subagent model rotation (2026-06-13)

- **`docs/subagent-model-catalog.md`** captures the active routing defaults and the new "Clip / Screenshot Diagnostic Rotation" pattern (clips as evidence artifacts, not deterministic DOM/layout replacements).
- **`nvidia/moonshotai/kimi-k2.6`** is the new priority-1 diagnostic scout (long-horizon coding + multimodal with image/video input). Source: Kimi K2.6 post; NVIDIA Build card.
- **`modelscope/Qwen/Qwen3-VL-{8B,235B}`** are the ModelScope visual QA candidates. Use 8B for smoke, 235B for full.
- `nvidia-capabilities` MCP is the live interface for NIM calls.

## High-risk surfaces (lead approval required to touch)

- `js/state.js`, `js/modules/app.js`, `js/modules/journey.js`, `js/modules/lifecycle.js`
- `js/modules/ui-renderers.js`, `js/modules/focus-pocket.js`, `js/modules/journey-compass-state.js`
- CSS mobile cascade files (`css/journey_active.css`, `css/mobile_premium__*.css`, etc.)
- Deploy scripts (`deploy.sh`, `deploy.ps1`)

## Known blockers / open items

- **Main chunk still large.** Next bridge target is reducing the main entry chunk size. Current `engine-*.js` chunk separation helps but the index-*.js chunk is still 1.4 MB pre-gzip.
- **relationship-roles finalization (B2).** Blocked until all UI consumers migrate. Unblocks after S6 arc.
- **CORS production proxy for rerank (B3).** Production-readiness work. Defer until prod gate.
- **Wave 10: legacy runtime retirement (the next big arc).** After S6 lands, the Svelte track is fully canonical. The legacy `js/modules/*` tree can be retired in a follow-up wave (similar to Wave 9 but for runtime, not alias).
- Product route ownership seam is closed in the Svelte path. Next product seam is cleanup/hardening around semantic dive state ownership and bridge coupling.
- Dirty worktree contains prior migration/archive/test additions under `legacy-reference/`, `tests/unit-active/`, `tests/unit/README.md`, `tests/dismiss-in-complete-state-contract.mjs`, and `vitest.legacy.config.js`. Treat as existing user/worker work; do not revert casually.
- Parallel visual-state audits can saturate local browser; prefer sequential headed runs for visual QA.
- **Dev server noise:** The Svelte/Vite dev server (port 5173) re-touches `dist/svelte/*` via HMR. For close-out commits, use explicit `git add <files>` (never `git add -A`). See `dev-server-drift-handling` skill.

## S6 arc — Svelte migration close-out (CLOSED, 2026-06-13)

The S6 arc finishes the Svelte migration by porting the 10 remaining TODO-without-ticket violations. **All 5 tickets DONE.**

| Ticket | File(s) | What | Status | Commit |
|---|---|---|---|---|
| **S1** | `src/lib/ui/loading.ts` (3 TODOs) | Port weather + thread hydration flow | ✅ DONE | `3ccccac` |
| **S2** | `src/lib/orchestration/url-state.ts:412` | Switch URL-state to direct Svelte filter store mutations | ✅ DONE | `e5e01ad` |
| **S3** | `src/lib/orchestration/view-controller.ts:293,296` + `src/App.svelte:389` + `src/lib/orchestration/url-state.ts:529` | Toast notifications + semantic-guide icon (4 TODOs) | ✅ DONE | `3c6253c` |
| **S4** | `js/modules/legend-ui.ts:287` + `js/modules/tooltip.ts:149` | Move legacy call sites to Svelte component lifecycle | ✅ DONE | `ce7747d` |
| **S5** | `tests/unit-active/todo-without-ticket-invariant.test.ts` + `memory/active-context.md` + `docs/both-pattern-follow-ups-2026-06-13.md` | Drop baseline to 0; close-out | ✅ DONE | (this commit) |

**S6 is complete.** The Svelte track is fully canonical. 0 TODO-without-ticket violations remain. The legacy `js/modules/*` tree is the only remaining retirement work (next arc: Wave 10).

**S3 design**: New `Toast.svelte` component + `toast.ts` orchestrator with body data-attribute bridge (mirroring the `bodyFocusPanelMode` pattern). Inlined semantic-guide SVG from `src/lib/journey/semantic-guide.ts` into `view-controller.ts`. Fixed `icon: 'galaxy'` → `'mycelium'` to match the SVG sprite.

**S3 surprises**: Worker initially thrashed on pre-existing linter warnings in App.svelte (unused imports) and view-controller.ts (innerHTML); steered to skip them and move on. 2 live steers applied.

**S1 surprises**: Fixed pre-existing `_loadingHideCancelled` build error; `@legacy/*` tsconfig alias doesn't resolve for tsc (used relative path instead).
**S4 surprises**: `tooltip.js` stub didn't follow the BOTH pattern; worker added the `export * from './tooltip.ts'` re-export to match `view-controller.js`.

Pre-staged worker prompts at `tmp/commit-messages-2026-06-13/worker-ticket-S{1..5}-*.txt`.

## Session artifacts (2026-06-13 wave)

- **14 ready-to-fire worker prompts** in `tmp/commit-messages-2026-06-13/` (1+2, 1+2-v2, 4, 5, 6, 8, 9C, 9D, 9E, S1, S2, S3, S4, S5)
- **3 memories + 2 skills + 1 profile doc** saved (bash-detach, v2-prompt recovery, session summary; bash-detach-handling + dev-server-drift-handling skills; `notes/fred-profile.md`)
- **Key router running** at `127.0.0.1:8788` with 18 keys across 5 providers (OpenCode Zen, NVIDIA NIM, Mistral, ModelScope, Kilo). The session has been using `pi:direct-opencode-go/mimo-v2.5` direct (bypasses the router); future work on nvidia/mistral/modelscope/kilo routes can use the router.
- **64+ commits this session** (target: 65+ after W6 close-out), all pushed to origin. Wave included the BOTH-pattern follow-ups (1+2, 3, 4, 5, 6, 8), Wave 9 (9A, 9B, 9C, 9D, 9E), the A worker (9D-Option-B), 5 invariant tests, the S1+S2+S3+S4 worker quad, the S5 close-out, Wave 10 W1+W2+W3 (audit + BOTH-shadow retirement + retirement record), and the docs close-out + retirement publication.

## Next session entry (post-Wave 10 W2+W3, pre-W6)

1. **Wave 9 CLOSED** (alias retirement, commit `cbc6509`)
2. **A worker CLOSED** (9D-Option-B BOTH bridge drop, 35 files rewritten)
3. **S6 arc CLOSED** (Svelte migration, S1-S5, 0 TODO violations)
4. **Wave 10 W1 CLOSED** (audit, commit `3df8336`) — found that `js/` is the **active engine kernel**, not legacy
5. **Wave 10 W2 CLOSED** (BOTH-pattern `.js` shadows retired, commit `7fc7b9d`) — 50 .js shadows archived to `legacy-reference/js-both-shadows-2026-06-13/`
6. **Wave 10 W3 CLOSED** (retirement record, commit `d49c953`) — `docs/wave-10-legacy-retirement.md` published
7. **5 invariant tests in place**, all passing
8. **Test suite green:** 18/18 files, 130/130 tests. svelte-check 0/0
9. **64+ commits this session** (target: 65+ after W6 close-out), all pushed to origin

## Wave 10 outcome (partially closed)

- **BOTH-pattern shadows**: RETIRED (50 files archived)
- **Engine kernel** (`js/modules/*.ts` + `js/state.ts` + `js/state/*` + `js/workers/*`): REMAINS ACTIVE
- **Svelte UI → Svelte bridge → engine kernel architecture**: NOW EXPLICIT in AGENTS.md

The `js/` directory is NOT dead legacy code — it's the active Three.js engine runtime wrapped by the Svelte UI via the imperative bridge in `src/lib/engine/`. Future engine unification (porting the kernel into `src/lib/engine/`) is a separate multi-week arc, not Wave 10's scope.

## Next session entry (post-Wave 10, pre-product features)

1. **W6 close-out commit** — refresh active-context + push (this commit)
2. **Migration infrastructure: COMPLETE** — BOTH bridge gone, BOTH shadows retired, Svelte UI canonical
3. **5 invariant tests in place**
4. **Test suite green:** 18/18 files, 130/130 tests. svelte-check 0/0
5. **Next arc: product features** (the migration is done; time to ship product work)
   - Specific candidates: new visual diagnostic features, main chunk split, relationship-roles finalization (now unblocked), CORS production proxy for rerank
6. **Engine port (separate multi-week arc)** — porting the kernel from `js/modules/*.ts` to `src/lib/engine/*.ts` and thinning the bridge. Not this project's scope.

## W30 cleanup session (CLOSED, 2026-06-30)

Code-quality sweep — subagent audits → bounded PRs → verify → commit. 28+ commits beyond the original PR-A/B/C wave. No new features, only real bug fixes and dead-code removal.

### Bug fixes (real bugs, not type tightening)

- **PR-Item1** — `focusRing/NextCue/BeaconTexture` getters were cast via `as Texture` against `appState.*` runes that didn't exist. Routed to `webglContext.*` (the actual writers in `node-manager.ts`). Endpoints now render with non-null `material.map`. (`b9dd923b`)
- **PR-selectedPoint** — `url-state.ts:101,103` wrote to `legacyState.selectedPoint`, which the test mock harness defines as getter-only. Threw "Cannot set property ... has only a getter". Removed the dead writes, added `focusState?.selectedPoint` / `searchState?.currentSearchSummary` fallbacks in `getCompatValue`. (`5efe4571`)
- **PR-A** — Header utility buttons had unconfirmed `position: fixed` cascade (defensive `position: static` lock-down). Mobile `.mode-chip` padding bumped 0.25rem→0.6rem (22px→35px) to meet WCAG 2.5.8 AA. 2 new Playwright journey tests (24a header position, 25a mobile AA). (`4b6b1e34`)
- **PR-B** — MODE_DESCRIPTIONS rewritten with action verbs (overview/search/trail/focus/inside/map). Header description 0.6rem/0.45-opacity→0.75rem/0.7-opacity. Now shown on mobile via `flex-wrap: wrap` + `flex-basis: 100%` (wraps to row 2). (`08252ed5`)
- **PR-C** — Subagent-delegated: CSS-only suppression of duplicate mode picker overlay in focus/inside phase. Adds `suppress-step-indicators` + `suppress-actions` classes on `.journey-compass`. DOM preserved, only display hidden. (`43dc5c73`)
- **PR-D** — Lock SVG on locked mode chips (replaced 🔒 emoji in accessibility tree). `white-space: nowrap` on "View on Map" button. Bundled with parallel-session toast queue refactor. (`68c282dd`)
- **PR-E1** — MANIFOLD `#518 Semantic proximity active` badge auto-dismisses after 4s. Animation: `overlay-in` 0.3s ease-out then `overlay-out` 0.3s ease-in 4s forwards. Keeps first-visit context, removes recurring noise. (`66928c8e`)
- **PR-E2** — Fixed CSS scoping bug: `.trail-context-text` styles in `JourneyChrome.css` were scoped to the parent component but elements live in `TrailControls.svelte` child, so they silently failed. Computed styles confirmed 16px default font (expected: 0.6rem). Moved styles into TrailControls.svelte's `<style>` block; removed duplicate scoped rules from JourneyChrome.css (kept `:global()` selectors). (`66928c8e`)
- **PR-F** — Mobile header description ellipsis: at 390x844, focus-mode description text bled off-screen. Added `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` on mobile. (`66928c8e`)

### Decomposition

- **PR-D1** — Retired 45 source-grep test assertions across 4 files (cargo-culted "is this string in this file" tests). 0/-527 lines. (`a2e626f1`)
- **PR-D2** — Extracted Header mode logic + constants into pure TS modules. Header.svelte: 613 → 498 lines. +35 new unit tests. (`d02a8e0d`)
- **PR-D3** — Lifted the selection-lock rule to `src/lib/navigation/mode-affordances.ts`. Reused in `mode-bindings.ts` and Header. +7 new tests. (`d09620d4`)
- **PR-D4** — CompassRail reuses `selectMode` from `mode-nav`. Found and fixed two real consistency bugs (missing lock guard for `focus`/`inside`; missing URL sync; no `SET_VIEW` for `map`). +26/-20. (`c129fff3`)
- **PR-D9** — Header.svelte 498 → 254 lines (–49%). Extracted 247-line `<style>` block to `src/lib/components/header/header.css`. Uses the same `@import`-inside-`<style>` pattern ProximityLegend uses. (`9dd9c346`)

### Feature parity

- **PR-D6** — `JOURNEY_COMPASS_PHASE_ORDER` grew from 5 to 6 phases; added `trail` between `focus` and `inside`. Brings the compass rail in line with the Header chip rail and `mode-bindings.ts`. (`3c3a016f`)

### Cleanup

- **PR-D5** — Playwright journey test for the mode-bindings Trail-locked toast. Catches the toast fragility path (Svelte re-render wiping manual DOM mutations). (`144eeeff`)
- **PR-D7** — Consolidated the duplicate `showExperienceToast` exports onto the Svelte-store path. 4 importers switched; DOM-direct implementation removed from `ui-feedback.ts`. (`7dc6ebc3`)
- **PR-D8** — Retired the never-set `window.__semanticState` global (declared in `window.d.ts`, never assigned anywhere; 3 dead readers). (`22ec205d`)
- **PR-2** — Retired dead `webglContext.rawPositions` / `ClustersBuffer` fields. (`1084f76f`)
- **PR-3a/3b** — Path-cascade type tightening in `state-types.ts` + `app.svelte.ts`. (`7b72028e`, `d6296c6a`)
- **`getPointBoundsCenter` unit tests** — Real unit coverage for the testing contract. (`c027926c`)

### What this session enables for future work

- The Header / CompassRail / mode-bindings / welcome demo all switch modes through the same `selectMode` entry point. Adding a new selection-dependent mode = one line in `SELECTION_DEPENDENT_MODES` + one entry in `mode-constants.ts` + one click target.
- The toast is now store-driven. The PR-D5 journey test protects the contract.
- The `__semanticState` global is gone — window globals are now a closed set (`__APP_STATE__`, `__TEST_STATE__`, `__LEGACY_APP_STATE__`).

### Test surface

- 190 vitest files, 2640 tests passing, 4 todo, 0 failed.
- svelte-check: 0 errors / 0 warnings.
- 1 Playwright journey test (`tests/widget-journey.spec.js` — PR-D5 + PR-Item1 test 22c) cannot fire here (no browser harness) — validates in CI.
