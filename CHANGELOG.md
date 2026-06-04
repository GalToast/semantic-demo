# Changelog

All notable changes to the semantic explorer are documented here. Each entry corresponds to a deployed bundle on `mccullough.cloud/semantic-demo`. For full per-session narrative (decisions, residual seams, design context), see `DEPLOY_STATUS.md`.

Format: `[YYYY-MM-DD] — Bundle vN — short description`

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
