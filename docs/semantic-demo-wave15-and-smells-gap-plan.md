# Wave 15 + Smells Gap Plan

> **SUPERSEDED — 2026-06-18**: This plan predates the W20–W32 Svelte 5 migration. All `js/modules/` files referenced in SG.1–SG.8 have been deleted. The CSS slices (2.1–2.3) were addressed during W24–W31. See `docs/phase2-roadmap-w33+.md` for current post-migration work.
>
> **Retained for historical reference only.**

**Date:** 2026-06-04
**Status:** DRAFT, awaiting lead sign-off
**Author:** Main lane (Codex)
**Predecessor:** `docs/semantic-demo-wave14-checkpoint.md` (2026-06-01)
**Scope:** Land in-flight TS port + Svelte migration, continue the wave program from the wave14-checkpoint seams, and address the smells not covered by any existing plan.

---

## Framing

The first-pass smell list overlapped heavily with the existing wave program: CSS `!important` was already closed in Wave 12, `journey.js` is already 275 lines post-extraction, `semantic-lane.js` is already extracted, and the bridge dewindowing work is in flight. This plan therefore **integrates with the wave program** rather than proposing parallel work.

The smells that were **not** in any plan become a "smells gap" lane (SG.1–SG.8) running alongside the wave continuation.

**Team shape:** solo main lane, sequenced.
**Off-limits protocol:** for edits to `app.js`, `state.js`, `lifecycle.js`, `journey.js`, `ui-renderers.js`, `focus-pocket.js`, `journey-compass-state.js`, the mobile CSS cascade, or the deploy scripts, propose diff with file:line refs → await approval → apply → verify.

---

## Phase 0 — Pre-flight (1 session, mandatory first)

**0.1 Capture green baseline.** From a clean `master` checkout (no WIP), record the current state of:

- `npm run test`
- `npm run test:contract`
- `npm run test:unit`
- `npm run qa:contract:mobile-critical`
- `npm run qa:contract:phase-a`
- `npm run qa:contract:phase-b`
- `npm run lint`
- `git diff --check`

If anything fails on `master` before WIP, fix it first. The plan assumes a green baseline; we cannot diagnose WIP-induced failures without one.

**0.2 Inventory in-flight work.** Produce a one-page table from the 30 unpushed commits + ~25 uncommitted modifications, grouped by intent:

- TypeScript port (7 `.ts` files: `mycelium-engine.ts`, `three-engine.ts`, `three-interaction-visuals.ts`, `three-node-manager.ts`, `three-search-animations.ts`, `three-thread-manager.ts`, `webgl-context.ts` + `tsconfig.json` + `tsconfig.typecheck.json` + `types/`)
- Svelte migration (`.svelte` files in `js/modules/components/` + unified `app-svelte-island.js` mount + separately slotted search/filter islands + `view-controller.js`)
- State-store refactor (`stores.js`, `view-models/`, `composition-state.js`, `state-mutators.js`, `search-panel-adapter.js`, `journey-compass-controller.js`, `semantic-lane.js`)
- View / search refactors (`view-controller.js` mods, `search-state.js` mods, `search-filter-core.js` mods, `search-results-ui.js` mods, `camera-controls.js` mods, `filter-state.js` mods)
- CSS ownership polishes (`css/mobile_premium__narrow.css`, `css/mobile_premium__state.css`, `css/shell.css`, `semantic-demo.css`)
- Build/test infrastructure (`scripts/build-app.mjs`, `eslint.config.js`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.typecheck.json`; one-off codemod/debug helpers were inspected and removed)
- HTML rollback backup: `vector-explorer-polished.html.restored` (untracked — confirm if it should be deleted)

**0.3 Per-file disposition.** For each file/folder, mark one of: **ship** (lands in this plan) / **defer** (lands in a later wave) / **revert** (not aligned with program). Document in the wave15-checkpoint.

**0.4 Write `docs/semantic-demo-wave15-checkpoint.md`** documenting 0.1–0.3. Follow the format of `semantic-demo-wave14-checkpoint.md`.

**Verification gate:** wave15-checkpoint exists, all 0.1 commands recorded, all in-flight files have a disposition.

---

## Phase 1 — Wave 15: land the in-flight refactor (2–3 sessions)

Sequenced in four sub-waves so each lands behind a clean test gate.

### 1.1 TypeScript port

Read `tsconfig.json`, `tsconfig.typecheck.json`, and one `.ts` file to determine intent: parallel port (both `.ts` and `.js` exist, pick one) or 1:1 shadow (build emits `.js`, delete source `.js`). Pick the right answer for each module.

**Safe-zone files** (edit freely):

- `js/modules/mycelium-engine.ts` (paired with `mycelium-engine.js`)
- `js/modules/three-engine.ts` (paired; the `.js` is not in the off-limits list but is high-traffic)
- `js/modules/three-interaction-visuals.ts`
- `js/modules/three-node-manager.ts`
- `js/modules/three-search-animations.ts`
- `js/modules/three-thread-manager.ts`
- `js/modules/webgl-context.ts`
- `tsconfig.json`, `tsconfig.typecheck.json`, `types/`

**Verification gate:** `npm run build` (esbuild bundle to `dist/bundle.js`), `npm run lint`, `npm run test`, `npm run test:unit`, `npm run qa:contract:launch-focus`, `npm run qa:contract:focus-pocket`, `npm run qa:contract:field-node`, `npm run test:contract:3d-*` (smoke + visual + engine groups).

### 1.2 Svelte migration

Read `js/modules/components/App.svelte` and the separately slotted search/filter islands to confirm the migration is real (not a stub). Per `app.js:325` ("Svelte UI islands unavailable; using vanilla DOM renderers"), there is a runtime fork — confirm it is the *intentional* one (Svelte load failure → vanilla fallback), not a half-migrated state.

**Safe-zone files:**

- 9 `.svelte` files in `js/modules/components/`
- `js/modules/app-svelte-island.js`
- `js/modules/semantic-lane.js`
- `js/modules/journey-compass-controller.js`
- `js/modules/search-panel-adapter.js`
- `js/modules/view-controller.js`

**Landing order** (smallest first to maximize early signal):

1. `LegendPanelChrome.svelte` under `App.svelte` — smallest surface, easy to verify.
2. `InfoPanelChrome.svelte` under `App.svelte` — the four `InfoPanel*Surface.svelte` are its children.
3. `InfoPanelDiscoverySurface.svelte`, `InfoPanelOverviewSurface.svelte`, `InfoPanelSearchSurface.svelte`, `InfoPanelSelectionSurface.svelte` together.
4. `SearchResultsList.svelte` + `SelectedBusinessDetails.svelte`.
5. Keep separate island wrappers only for independently slotted chrome such as search/filter.

**Verification gate:** `npm run qa:contract:info-panel-empty`, `npm run qa:contract:info-panel-populated`, `npm run qa:contract:search-chrome`, `npm run qa:contract:mode-grid`, `npm run qa:contract:mobile-critical`, `npm run qa:surface:info-panel-populated`.

### 1.3 Adapters + view-models + stores

- `js/modules/stores.js`, `js/modules/view-models/*`, `js/modules/composition-state.js`, `js/modules/state-mutators.js`
- `tests/unit/search-results-view-model.test.js`, `tests/unit/selected-business-view-model.test.js`, `tests/state-store-sync-contract.mjs`, `tests/state-ownership-contract.mjs`

**Verification gate:** `npm run test:unit`, `npm run test:contract:core`, `npm run test:contract:render`, `npm run test:contract:state-data`, `npm run qa:focus-stage-render-contract`, `npm run qa:interaction-ownership`.

### 1.4 Push the wave

Once 1.1–1.3 are green, push the 30 unpushed commits + the new commits for 1.1–1.3 as Wave 15. Update `DEPLOY_STATUS` and the changelog per repo convention.

---

## Phase 2 — Wave 16: program continuation (2–3 sessions, parallel to Phase 3)

Continues the seams documented in `docs/semantic-demo-wave14-checkpoint.md:30-33`: "Focus-Stage Slices 4–6", "Event Bus Expansion", "JS De-monolithing."

### 2.1 Focus-stage CSS slice 4: Inside HUD consolidation

Per `docs/semantic-demo-wave14-checkpoint.md:30`, the remaining CSS consolidation slices target "Inside HUD, Map-Trail details, and Final Transition de-duplication."

**Files:** `css/mobile_premium__focus-dive.css`, `css/mobile_premium__surfaces.css` (mobile cascade is off-limits — propose diff, await approval).

**Verify:** `npm run qa:contract:focus-pocket`, `npm run qa:contract:field-node`, `npm run qa:contract:mobile-critical`, `npm run qa:surface:focus`.

### 2.2 Focus-stage CSS slice 5: Map-Trail details

**Files:** `css/mobile_premium__map.css` (off-limits — propose diff, await approval).

**Verify:** `npm run qa:contract:map-trail`, `npm run qa:surface:map-trail`, `npm run qa:contract:real-route`, `npm run qa:real-route:visual`.

### 2.3 Focus-stage CSS slice 6: Final transition de-duplication (HIGH RISK)

Per `docs/semantic-demo-css-archaeology-cleanup.md:170-175`, `progressive_disclosure.css:1350-1452` (atmospheric blocks for `body.view-transitioning` and `body[data-semantic-dive="transitioning"]`) is a known high-risk seam: "JS verification needed before removing atmospheric CSS — `body.view-transitioning` and `body[data-semantic-dive="transitioning"]` classes may no longer be applied."

**File:** `css/progressive_disclosure.css` (off-limits — propose diff, await approval).

**Pre-step (mandatory):** search `js/` for `body.view-transitioning`, `view-transitioning`, `data-semantic-dive="transitioning"`. If found, capture the JS that toggles the class before touching the CSS.

**Verify:** `npm run qa:contract:focus-pocket`, `npm run qa:contract:field-node`, `npm run qa:contract:mobile-critical`, `npm run qa:contract:phase-a`, `npm run qa:contract:phase-b`, visual evidence at desktop + 390px + 768px.

### 2.4 Event bus expansion

**Safe-zone file:** `js/modules/event-bus.js` (add new event types for analytics, toast notifications).
**Off-limits file:** `js/modules/app.js` (migrate the toast/analytics dispatch to event-bus — propose diff, await approval).

**Verify:** `npm run test:contract:core`, `npm run test:contract:lifecycle`, `npm run test:contract:render`, `npm run test:contract:navigation`, `npm run qa:focus-readability`, `npm run qa:focus-stage-render-contract`.

### 2.5 Lifecycle director decomposition (cluster-filter first, URL bridge last)

Per `docs/semantic-demo-js-demonolith-plan.md:170-176`, the extraction order is Cluster/Filter → Journey text → Semantic Lane (DONE) → Journey Compass → URL State Bridge (last, self-referential). Per `docs/semantic-demo-js-first-extraction-brief.md`, the Cluster/Filter subsystem at `lifecycle.js:48-173` is the chosen first extraction with a full phased checklist.

**Safe-zone file:** `js/modules/cluster-filter.js` (new, extracted from `lifecycle.js:48-173`).
**Off-limits file:** `js/modules/lifecycle.js` (propose diff, await approval).

**Verify:** `npm run test:contract:lifecycle`, `npm run test:contract:core`, `npm run qa:contract:filters`, `npm run qa:contract:phase-a`, `npm run test`.

### 2.6 Wave 16 checkpoint

Write `docs/semantic-demo-wave16-checkpoint.md` documenting 2.1–2.5, following the wave14 format.

---

## Phase 3 — Smells gap: safe-zone decompositions (2–3 sessions)

### SG.1 `camera-controls.js` decomposition (894 lines)

The largest god module in the repo. `camera-controls.js:582` is a `console.warn` in `animateCameraToTerrainPrelude`; the module owns defaults, restoration, restore-on-context-loss, and many `animateCameraTo*` choreography functions.

**Target shape:**

- `camera-controls-core.js` — defaults, getters/setters, public API (~200 lines)
- `camera-controls-choreography.js` — `animateCameraTo*` family (~350 lines)
- `camera-controls-restore.js` — WebGL context restore, error paths (~150 lines)
- `camera-controls.js` — facade re-exporting the public surface (~100 lines)

**Verify:** `npm run qa:contract:launch-focus`, `npm run qa:contract:search-chrome`, `npm run test:contract:3d-*` (smoke + visual + engine + resilience + responsive-ui groups), `npm run qa:scene-health`.

### SG.2 `micro-demo.js` compression (666 lines)

Per `AGENTS.md:53-67`, `micro-demo.js` is the sole demo entry point and owns the choreography. The state-machine reference at `AGENTS.md:73-81` describes the phases. The module is large because the choreography mixes phase transitions, camera moves, card appearances, and timing — all in one function family.

**Target shape:**

- `micro-demo.js` — entry point, state machine, ~250 lines
- `micro-demo-timings.js` — `PHASE_DURATIONS`, easing curves, ~100 lines
- `micro-demo-choreography.js` — phase transition handlers, ~250 lines
- `micro-demo-card-sync.js` — selected-card visibility/transition, ~100 lines

**Verify:** `npm run test:microdemo`, `npm run test:microdemo:served`, `npm run test:contract:e2e`, `npm run qa:contract:launch-focus`, `npm run qa:product-playthrough`.

### SG.3 `semantic-search-api-cache.js` decomposition (589 lines)

Module mixes API calls, response cache, and result dedup. `js/modules/semantic-search-api-cache.js:10` and `:581` both carry `TODO(data-regen)` about slug-style names — see SG.4.

**Target shape:**

- `semantic-search-api.js` — `fetchSemanticResults`, request shape, ~150 lines
- `semantic-search-cache.js` — TTL, key derivation, ~150 lines
- `semantic-search-dedup.js` — slug-style normalizer + result dedup, ~150 lines
- `semantic-search-types.js` — JSDoc type aliases, ~50 lines
- `semantic-search-api-cache.js` — facade re-exporting the public surface, ~50 lines

**Verify:** `npm run test:contract:core`, `npm run test:contract:render`, `npm run test:contract:e2e`, `npm run qa:contract:search-chrome`, `npm run qa:contract:search-error`, `npm run qa:contract:search-no-results`.

### SG.4 `TODO(data-regen)` debt in `semantic-search-api-cache.js`

Two TODOs at `js/modules/semantic-search-api-cache.js:10` and `:581` flag that `data.dat` contains slug-style names like `"2-hampton-inn-and-suites"`. The cleanest fix is to migrate the slug → display name during load, not at every search.

**Approach:**

- Add a `slugToDisplayName(slug)` function in `js/modules/utils/data-mapper.js` (already exists per the untracked file list).
- Apply it in `js/modules/data-loader.js` after `data.dat` loads, mutating the points array in place.
- Delete both TODO comments.
- Add a unit test in `tests/unit/data-mapper.test.js` (or similar).

**Verify:** `npm run test:unit`, `npm run test:contract:render`, `npm run qa:contract:search-chrome` (no `2-hampton-inn-and-suites` text in the result list), `npm run qa:surface:info-panel-populated`.

---

## Phase 4 — Smells gap: off-limits items with approval protocol (2–3 sessions)

For each item in this phase, the protocol is: read the file region → propose diff with file:line refs → user approves → apply → verify. I do not edit off-limits files without explicit approval per AGENTS.md.

### SG.5 console.warn swallow-and-continue audit (49 calls, mixed zones)

**Categorize every call into:**

- **REAL_FAILURE_KEEP** — actual error that should be loud (network failure, WebGL context loss, init failure)
- **GRACEFUL_FALLBACK_DEBUG** — expected fallback path (worker unavailable, dev server quirk) → downgrade to `console.debug` or strip
- **USER_RECOVERABLE_TOAST** — something the user can fix or know about (city filter empty result, no semantic lane health) → route to toast via event bus

**SG.5a Safe-zone files** (edit freely after categorization):

- `js/modules/data-loader.js` (6 calls)
- `js/modules/semantic-threads.js` (6 calls)
- `js/modules/semantic-lane.js` (2 calls)
- `js/modules/url-state.js` (6 calls, parts not touching off-limits seams)
- `js/modules/three-node-manager.js` (1 call)
- `js/modules/three-engine.js` (4 calls, parts not touching off-limits seams)
- `js/modules/map-state.js` (3 calls)
- `js/modules/weather.js` (1 call)
- `js/modules/journey-selected-card.js` (1 call)
- retired standalone info/legend chrome island wrappers; `App.svelte` owns those surfaces directly
- `js/modules/semantic-search-api-cache.js` (multiple)
- `js/modules/bindings/view-bindings.js` (1 call)
- `js/modules/camera-controls.js` (1 call)

**SG.5b Off-limits files** (propose diff, await approval per edit):

- `js/modules/app.js` (7 calls: 143 init safety valve, 173 loadSemanticThreads fallback, 217 probeSemanticLane failure, 325 Svelte islands unavailable, 384 applyUrlState, 406 init, 415 critical)
- `js/modules/lifecycle.js` (3 calls: 240 WebGL context restore, 270/295 WebGL unavailable/create, 592 overlay update)
- `js/modules/event-bus.js:127` (subscriber error handler — special: this is load-bearing for state-machine debugging; recommend keeping as `console.error`, no change)

**Verify:** `npm run test`, `npm run test:contract`, `npm run test:unit`, browser console scan in headed mode at `npm run qa:product-playthrough` for new noise.

### SG.6 Init safety valve removal (off-limits: `app.js`)

`js/modules/app.js:143` reads: `console.warn('Init safety valve dismissed a slow loading overlay after 15s.');` This is a watchdog that hides the loading overlay if init stalls. Per the first-pass smell list, this is "actively hiding the failures you'd want to see."

**Pre-step (mandatory):** measure P50/P95 init time in current dev and prod builds, with and without the safety valve. If P95 < 15s, the valve is dead code; if P95 > 15s, there is a real init bug to fix.

**Proposed diff (await approval):**

- Tighten the timeout to a value that excludes normal init but catches real stalls (e.g., 30s or P95+50%).
- On timeout, emit a `console.error` with diagnostic context (which init step was current).
- Do not silently hide the overlay — leave it visible with an error state so the user can refresh.
- Add a Playwright test that triggers the stall and verifies the error state is rendered.

**Verify:** `npm run test:contract:core`, `npm run test:contract:lifecycle`, `npm run qa:contract:loading-overlay`, `npm run qa:surface:loading-overlay`.

### SG.7 `bridge-registry.js` removal (off-limits: `app.js` + `state.js`)

Pre-requisite: every `bridge-registry` caller has been migrated to a direct import. Per `docs/semantic-demo-js-demonolith-plan.md:156`, the wave56 dewindowing pass retired several compat bridges; `bridge-registry.js` is the last bridge compat surface.

**Pre-step:** `grep -r "bridge-registry" js/` to confirm callers = 0 (or close to 0). If callers > 0, propose migrating each as a separate diff and await approval per migration.

**Proposed diff (await approval):** delete `js/modules/bridge-registry.js` and remove the named imports in `js/modules/app.js:30`.

**Verify:** `npm run test:contract:core`, `npm run test:contract:lifecycle`, `npm run test:contract:render`, `grep -r "bridge-registry" js/` returns 0.

### SG.8 Deploy script sibling `../js/scanner.js` path (off-limits: `deploy.sh` + `deploy.ps1`)

**Confirmed:** `Test-Path "../js/scanner.js"` returns False. Both `deploy.sh:74` (`SCANNER_SRC="../js/scanner.js"`) and `deploy.ps1:22` (`$ScannerSource = "../js/scanner.js"`) reference a file that does not exist in this repo.

**Diagnosis questions to answer first:**

1. Does `scanner.js` exist on the deploy target? If yes, why is it outside the repo? If no, the sync block is dead code.
2. Is `scanner.js` the canonical source for the production scan pipeline, or is it a build artifact?
3. Can we vendor `scanner.js` into this repo (e.g., `scripts/scanner.js` or `tools/scanner.js`) so the deploy is self-contained?

**Proposed diff (await approval, depends on diagnosis):**

- **Option A — Vendor:** copy `scanner.js` into `scripts/scanner.js`, update deploy paths to `scripts/scanner.js`.
- **Option B — Delete:** if `scanner.js` is no longer needed on the deploy target, remove the sync block from both deploy scripts.
- **Option C — Document:** if the sibling is intentional, add a `docs/deploy-sibling-sources.md` explaining the dependency.

**Verify:** `bash deploy.sh --dry-run` (or equivalent in `.ps1`); the dry-run must show scanner.js source resolution and not fall through to the "scanner.js not present" skip path.

---

## Phase 5 — Verification protocol (after every wave)

After each sub-wave (1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4) run:

- `npm run build`
- `npm run test` (fast static: shell + manifest + cache + ownership)
- `npm run test:contract`
- `npm run test:unit`
- `npm run lint`
- `git diff --check`

For sub-waves that touch visual surfaces (1.2 Svelte, 2.1–2.3 CSS slices, 3.1–3.3 module extractions):

- `npm run qa:contract:all` (full 16-surface matrix)
- `npm run qa:surface:all` (visual screenshots, headed per AGENTS.md)
- Visual evidence saved to `reports/screenshots/playwright/` (per AGENTS.md MCP recovery guidance)

For sub-waves that touch the off-limits mobile CSS cascade:

- `npm run check:ownership` (explicit verification of CSS ownership)
- `npm run check:surface-styles`
- `npm run check:no-self-refs`

For deploy-related sub-waves (4.4):

- `bash deploy.sh --dry-run` (or `pwsh -NoProfile -File deploy.ps1 -DryRun` if the flag exists; otherwise simulate manually)

---

## Off-limits approval protocol

For any edit to:

- `js/modules/app.js`, `js/state.js`, `js/modules/lifecycle.js`, `js/modules/journey.js`, `js/modules/ui-renderers.js`
- `js/modules/focus-pocket.js`, `js/modules/journey-compass-state.js`
- `css/journey_active.css`, `css/journey_steps.css`, `css/strands.css`, `css/progressive_disclosure.css`, `css/mobile_premium_*.css`
- `deploy.sh`, `deploy.ps1`

The protocol is:

1. **Read** the file region.
2. **Propose** the exact diff with file:line refs.
3. **Show** risk analysis and rollback plan (how to revert the specific hunk).
4. **Wait** for explicit user approval per the proposed diff.
5. **Apply** the diff.
6. **Verify** per the Phase 5 gate for that sub-wave.
7. **Report** results — pass / fail / new smells discovered — before moving to the next off-limits edit.

No batching of off-limits edits across files. One diff at a time, per file, per sub-wave.

---

## Sequencing summary

| Phase | Sessions | Output |
|---|---|---|
| Phase 0 | 1 | `docs/semantic-demo-wave15-checkpoint.md` + green baseline record |
| Phase 1 (1.1–1.4) | 2–3 | Wave 15 landed + pushed; DEPLOY_STATUS + changelog updated |
| Phase 2 (2.1–2.6) | 2–3 | `docs/semantic-demo-wave16-checkpoint.md` |
| Phase 3 (SG.1–SG.4) | 2–3 | Three god modules split; TODO data-regen closed |
| Phase 4 (SG.5–SG.8) | 2–3 | console.warn audited; init safety valve tightened; bridge-registry removed (or migrated); deploy script path fixed |
| Phase 5 | (continuous) | Verification gates run after every sub-wave |

**Total:** ~10 sessions, sequential. Compression paths:

- Run Phase 2 in parallel with Phase 3 (different file ownerships, mostly).
- Compress Phase 1.1 + 1.2 by reading the in-flight diffs in one diagnostic pass before landing.
- Skip Phase 4 sub-waves that turn out to be no-ops after Phase 0's diagnosis (e.g., if `bridge-registry` already has 0 callers).

**Not in scope** (queue for a future pass):

- The remaining `!important` declarations in `strands.css` reduced-motion blanket override (per `docs/semantic-demo-css-ownership-next-pass.md:296-298`).
- The contract-runner-and-QA-script sprawl noted in `docs/semantic-demo-next-seams-2026-05-20.md:97-110` (replace `test:contract` shell chain with manifest-driven runner).
- Behavioral proof gaps noted in `docs/semantic-demo-next-seams-2026-05-20.md:127-138` (Gemma/story fallback, overlay focus restoration ARIA, focus-stage visual state, short-landscape transition cleanup).

---

## Risks and unknowns

1. **TS port intent is unclear** without reading the `.ts` files in detail. The pairing of `three-engine.js` and `three-engine.ts` could be either a parallel port (both files maintained) or a 1:1 shadow (build emits `.js`, source is `.ts`). Phase 0.3 will resolve this; if both files are maintained, the safe move is to delete the `.js` and use the `.ts` directly. If 1:1 shadow, delete the `.ts` after the build pipeline is verified.

2. **Svelte migration may already have addressed the vanilla-fork smell.** The `app.js:325` warning ("Svelte UI islands unavailable; using vanilla DOM renderers") suggests there is a runtime detection + fallback. Phase 0.3 will confirm whether the fork is intentional (Svelte load failure → vanilla fallback, which is fine) or half-migrated (some surfaces use Svelte, some still vanilla, with no detection).

3. **The `../js/scanner.js` deploy path may be load-bearing on the server** even though it doesn't exist locally. Phase 4.4's diagnosis will determine this. If the server has `scanner.js` at a sibling path, the deploy script is correct as-is and the smell is "the repo is not self-contained," not "the deploy is broken."

4. **30 unpushed commits may include other work** not visible in `git status` (e.g., branch-only commits, stashed work, or work in worktrees). Phase 0.2 will inventory these; if significant, Phase 0 may take a second session.

5. **Several smells called out in the first pass may be in the in-flight TS/Svelte work and therefore already addressed** without explicit changes in this plan. Phase 0.3 will close these.

6. **The 5 mobile-cascade `!important` declarations are intentional** (reduced-motion per `docs/semantic-demo-repo-health-checkpoint.md:158`); the plan does not touch them. If the user wants them refactored to a scoped design, that's a separate plan.

---

## Success criteria

- All Phase 5 verification gates pass after every sub-wave.
- `docs/semantic-demo-wave15-checkpoint.md`, `docs/semantic-demo-wave16-checkpoint.md`, and a new `docs/semantic-demo-smells-gap-checkpoint.md` exist and follow the wave14 format.
- Three god modules (`camera-controls.js`, `micro-demo.js`, `semantic-search-api-cache.js`) each have a facaded file < 200 lines and extracted owners < 350 lines.
- `console.warn` count in `js/` is reduced from 49 to a number that reflects "real failures only" (target: < 15).
- `bridge-registry.js` is deleted (or queued with a clear "1 caller left, see [file:line]" note).
- `data.dat` slug-style names are migrated at load time; both `TODO(data-regen)` comments are deleted.
- Deploy script scanner path is fixed (or explicitly documented as intentional).
- 0 unexpected regressions in `npm run qa:surface:all` visual evidence.
