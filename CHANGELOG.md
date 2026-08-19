# Changelog

All notable changes to the semantic explorer are documented here. Each entry corresponds to a deployed bundle on `mccullough.cloud/semantic-demo`. For full per-session narrative (decisions, residual seams, design context), see `docs/ops/DEPLOY_STATUS.md` (stale after 2026-06-03).

Format: `[YYYY-MM-DD] — Bundle vN — short description`

> **Revival note (2026-08-18):** bundle numbering lapsed after v132 (2026-06-04); 3,641 commits shipped since without changelog entries. The entries below recover the major waves from git history, grouped by phase. Bundle numbers for the post-June era were not tracked, so entries use phase labels instead. Per-session narrative lives in `docs/ops/DEPLOY_STATUS.md` (stale after 2026-06-03) and the wave dossiers in `docs/`.

## [2026-08-18] — Phase S4/S5 — Data enrichment, mobile posture, and the 3D/columnar wave

**The current era.** August shipped the data-quality and mobile work that had been living as "options docs" since June, plus a heavy 3D/engine and performance wave.

- **Data enrichment (S4):** thin-row enrichment merge + identity-preserving hydration — snapshot/NAICS rescue on demand, no more wholesale record replacement. `docs/feature-depth-enrichment-options.md` (GO verdict) + `docs/feature-depth-option3-backfill.md` landed as shipped plans.
- **Mobile posture (S5):** honest "mobile preview" placeholder copy replaces the old misleading text; capability-gated 3D auto-enter built and **flipped to default-ON** (opt-out via `VITE_S5_AUTO_ENTER_3D=0`) on 2026-08-19 — capable phones now cold-load the 3D scene, SwiftShader/low-memory/reduced-motion devices keep the placeholder + CTA. D3 phone-farm acceptance runbook committed; real-handset smoke remains the pre-release gate. `docs/feature-depth-mobile-posture.md`.
- **Columnar data (TDBU):** the 100,872-pair manifest-contract bin flipped to a columnar format — UI bin 93% smaller, wired into loader+worker+ensure, label-plane decode restored (parseTdbU strtab).
- **3D/engine:** dual-write bridge migration finished; journey demo cleanup; lazy-loading of InfoPanel/JourneyChrome/Placeholder2D/FocusCard for the CSS budget; 7 orphaned CSS rules removed; resource-tracking + disposal hygiene contracts.
- **Perf campaign:** Lighthouse re-seed (mobile 35 / desktop 74), elephant campaign closed (module-share saturation), compressed `.br`/`.gz` data twins served in test-server, data-compression CI gate.
- **Infra:** qa:serve persistent static server, deploy-verify `--via-origin` mode, prod-root align script, dist-integrity split-brain gate, check:journey tripwire suite.
- **Housekeeping:** test-sprawl consolidation (38 swarm scratch files untracked, tmp/ hygiene policy), AGENTS.md demo-ghost claims removed, 19 previously-untested Svelte components covered (245 tests).

## [2026-07-31] — Phase W — Stabilization, onboarding, and subagent routing

- **Onboarding:** auto-open help dialog on first visit; demo-replay journey test; relationship context surfaced in FocusCard.
- **State validation:** 6 phase machines wired into the dev nested audit (W66); state-validation.ts runtime safety net.
- **Engine/state decomposition:** three-engine init/frame-update/store-sync concerns extracted into focused modules; 13 focus fields + 20 search fields partitioned into sub-aggregates (Phase 6b/6c).
- **Subagent routing:** heavy wave of model-route probes + benchmarks (waves 18-27); lane inventory rotated; logfare route later found DEAD (2026-08-19) with opencode-zen verified as the free route.
- **QA:** persistent qa:serve static server; visual-audit runner repair; reduced-motion coverage contracts.

## [2026-06-30] — Phase 1.4–7 — JS→TS + Svelte 5 migration wave

**The migration era.** The vanilla-JS app moved to TypeScript + Svelte 5 in a multi-wave effort.

- **Wave 15 / Phase 1.4:** CSS ownership cleanup, stale doc fixes, TS port surface, Svelte scaffold; orphan islands and dead `.ts` shadows deleted.
- **Svelte 5 islands:** search + filter chrome migrated (the v132 work above); more islands followed the same pattern.
- **State class migration:** `state.js` → typed sub-aggregates (searchState, focusState, viewportState); state-validation.ts runtime safety net (Phase 6a).
- **Legacy coexistence:** both-pattern `.js` shadows retired to `legacy-reference/`; `@legacy/*` runtime stubs + bridge modifications for full coverage; legacy bridge remains load-bearing (see AGENTS.md).
- **Camera-choreography / lifecycle / micro-demo** decomposed into focused modules; demo engine later fully swept (2026-08-14).
- **Test determinism:** 441 `page.waitForTimeout` calls replaced with deterministic waits; bulk `as-any` cast removal across 25+ files; all 48 unused var/import/interface warnings eliminated.

## [2026-06-04] — Bundle v132 — Filter + search chrome migrated to Svelte 5 islands

The search input/label/clear/mobile-sheet-toggle and the filter chips/city-select/clear-button moved from vanilla DOM bindings into two Svelte 5 islands. Every ID, class, and data-attr the QA contract keys off is preserved; existing event-bus payload shapes (`FILTER_CHANGED`, `URL_SYNC_REQUESTED` with `{params, reason}`) are unchanged. Committed, not yet deployed.

- **SearchChrome.svelte** owns the search input debounce (300ms, now a `debounceMs` prop), Enter/Escape handling, the clear button, the compact-viewport mobile-sheet toggle, and the `has-query` side-effect on `.search-container`. Replaces the `_onInputHandler`/`_onClickHandler`/`data-mobileSheetToggleBound` stash-on-element pattern with Svelte event syntax + `onDestroy` cleanup.
- **FilterChrome.svelte** owns the 150ms filter debounce, `aria-pressed`/active state for status + signal chips, the city select, and the clear button. Subscribes to `FILTER_CHANGED` + `URL_SYNC_REQUESTED` to mirror external state. Debounce exposed as `debounceMs` prop.
- **Island registration** in `js/modules/search-chrome-island.js` and `js/modules/filter-chrome-island.js` follows the existing `search-results-svelte-island.js` pattern. Both add a `dataset.svelteMounted` re-mount guard so re-init is idempotent.
- **filter-bindings.js** and **search-bindings.js** become thin shims that call the island inits. `event-bindings.js` still imports `updateHasQuery` and `resetSearchControlBindings` from `search-bindings.js` (the latter resets the `initialized` flag for the dispose path). `bindClusterList` click delegation now lives in `filter-chrome-island.js`, sharing the filter-chrome lifecycle.
- **vector-explorer-polished.html** gains two mount slots (`#search-chrome-slot`, `#filter-chrome-slot`) replacing the static label/input/filter-toolbar markup.
- **Smells fixed:** `state.searchTimeout` shared between search input and filter debounce (now split); stashed DOM-element handlers; mixed `onclick=` / `addEventListener`; filter logic reaching into `#search-input.value` via DOM; mobile-sheet policy buried in bindings; magic 150/300ms debounces; dead "intentionally left unimplemented" comments.
- **Dead code removed:** `cluster-filter.js:populateCityFilter` pills/note branches + `syncCityFilterUi` summary/`[data-city-filter]` branches — those elements don't exist in the static HTML or the Svelte templates, so the branches were unreachable. Contract test updated to match.
- **Plumbing:** `cache-buster-check.js` learned about `*.svelte` so the cache buster hash is computed over Svelte source. `search-bindings.js` exports `resetSearchControlBindings()` so `disposeEventListeners` can reset the `initialized` flag.

**New focused test** — `tests/filter-search-chrome-svelte.spec.js` mounts the page at the QA-contract mobile viewport, opens the filter details, and exercises status-chip toggle, signal-chip toggle, clear button enable/disable, input → `has-query` class, and clear button → input blank + focus. Stable across consecutive runs.

**Verification (all green):**
- `npm run lint` — 0 errors.
- `npm run build` — clean, 556.9kb bundle, no Svelte warnings.
- `npm run qa:contract:search-chrome` — 32/0.
- `npm run qa:contract:filters` — 11/0.
- `node tests/search-state-surface-contract.mjs` — pass.
- `node tests/cluster-filter-contract.mjs` — pass.
- `node tests/cluster-filter-city-filter-side-effect-contract.mjs` — pass.
- `npx playwright test tests/filter-search-chrome-svelte.spec.js` — pass (stable across 2 consecutive runs).
- `npm test` (shell/manifest/cache/ownership/tokens/surface-styles/semantic-space) — all green.

## [2026-06-04] — Bundle v131 — Search H1 count matches rendered list

Fix from fresh adversarial audit: H1 read "Found 18 spots" while the result list showed 16 (5 visible + 11 paginated). Two near-duplicate records ("BLUE Willow Coffee" / "BLUE Willow Coffee LLC") were collapsed in the renderer's dedup pass but the H1 read the pre-dedup `resultIndices.length`.

- `search-results-ui.js` — after dedup, persist `dedupedResultCount` on the search summary.
- `journey-compass-state.js` — H1 prefers `dedupedResultCount` over `resultIndices.length`. Pre-dedup array remains the source for the mycelium's search-glow effect (lighting up all matches, not just distinct businesses).

Verified live: H1 and list now agree (both 16 for "coffee").

## [2026-06-04] — Bundle v130 — Adversarial audit + code smell sweep

11 fixes shipped after a browser-driven UI critique and a full JS+CSS code smell sweep. Verified at 6 states × 9 fields with 0 data-attribute diffs, 0 console errors on the live deploy.

### UI
- **Focus anchor visual indicator** — new Three.js Group with size (2.4×), ring sprite + static ring, and 0.7 Hz pulse. Render order keeps the focus on top; data topology untouched (no push-aside, per the design conversation about preserving traversal coherence). `js/modules/focus-anchor-indicator.js` (new), integrated with `three-node-manager.js` and `three-interaction-visuals.js`.
- **Mobile focus-state escape hatch** — mode toggle, journey rail, zoom controls, weather widget, and info panel re-shown on mobile in focus state. `css/mobile_premium__narrow.css`.
- **Focus-state h1** — sr-only `"Focused on {name}"` in focus/inside phases so screen readers don't lose the page-level landmark. `js/modules/journey-compass-controller.js`.
- **Search toggle auto-focus** — clicking the magnifier focuses the input on every viewport, including fresh pages with no query. `js/modules/search-panel-adapter.js`, `js/modules/app.js`.

### Refactor
- **`refreshCompositionState` split** into 6 composers in new `js/modules/composition-state.js`. `lifecycle.js:refreshCompositionState` is a 3-line wrapper. **0 diffs / 54 cells** at 6 states × 9 fields.
- **view-controller seam** — `view-controller.js:switchView` now delegates to `applyCompositionState` for `data-active-view` (single writer).
- **Tooltip inline styles** removed — 10 `tooltip.style.*` writes deleted. Reduced-motion override at `tooltips.css:48` now actually applies.
- **15 `el.style.display` toggles** replaced with the standard `hidden` HTML attribute across `journey-selected-card.js`, `semantic-lane.js`, `app.js`.
- **`cluster-filter.js`** switched to event delegation on the parent — one click handler instead of N per-row.
- **`micro-demo.js`** — happy path and cancel path now share `_endDemo()`.
- **`SCENE_PERF_EMA_DECAY = 0.992`** extracted as a constant in `three-engine.js`.

### Cleanup
- Deleted 5 orphan modules (`lead-enrichment.js`, `exploration-data.js`, `inject-three.js`, `three-animations.js`, `js/utils.js`) and 3 dead test files. `lead-enrichment.js` claimed a canonical contract that no shipped caller honored — the dangerous kind of dead code.
- `.gitignore` extended for `.opencode/`, `.tmp-profile-ids.txt`, `semantic-sweep-*` artifacts.

### Docs
- `AGENTS.md` — new "3D Network Framing" section documenting the data → bounds reader → field scale flow with bug history. MCP recovery section tightened with launcher invariants and the docked-DevTools-panel rule.
- Ownership maps and state-transition docs updated for the new composer pattern.

### Verification
- `npm run build` clean
- `npm run lint` 0/0
- Contract tests: composition-state-owner, composition-state-invariant (6), state-transition, state-transition-table (48) — all pass
- Browser verify at `mccullough.cloud/semantic-demo/vector-explorer-polished.html?q=coffee&anchor=1618&depth=1&record=1618&view=galaxy` — focus anchor visible, h1 = "Focused on Coffee Cabin", 0 console errors

### Lesson
Subagent verification must test the user's *exact* path, not a happy-path approximation. The UI-1 fix took 2 extra rounds because the first agent verified a post-search state that masked the fresh-page bug. Worth codifying in subagent briefs.
