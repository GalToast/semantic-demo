# body.dataset IPC Inventory — semantic-explorer

> ## ⚠️ RECONCILED 2026-06-27 — read this first
>
> Phases 1–4 below are a **frozen point-in-time snapshot** (scan date ~2026-06-26).
> They massively overstate current drift. A full re-scan on 2026-06-27 (commit
> `c8ecdf6b`) shows the multi-writer drift problem is **~98% resolved**:
>
> | Metric | Doc's snapshot (2026-06-26) | Verified current (2026-06-27) |
> | --- | --- | --- |
> | Total writer sites | 120 | **24** |
> | `semanticDive` bypass writers | 6 ("most heavily contested") | **0** — resolved |
> | camera / loading / viewport / filter bypass writers | dozens | **0** — resolved |
> | **Remaining DRIFT sites** (mirrored attr, races parity) | many | **2** (see below) |
>
> ### The only 2 remaining drift sites
>
> 1. **`src/App.svelte:188` — `testReady`** (REDUNDANT). Parity sets `testReady='true'`
>    on `installParityAttributeSync()`. The App.svelte onMount write is a bootstrap
>    duplicate. Safe to delete once parity's install timing is confirmed before
>    tests poll `data-test-ready`.
> 2. **`src/lib/journey/semantic-dive.ts:105` — `journeyPhase='inside'`** (LOAD-BEARING,
>    NOT drift). `syncSemanticDiveUi` is the **sole authority** for this value in the
>    dive-active state. Parity's derivation checks `_hasFocus` before `nav.mode==='inside'`,
>    so during an active dive (which always holds focus) parity returns `'focus'`,
>    never `'inside'`. Enforced by `tests/semantic-dive-ui-surface-contract.mjs:167`.
>    **Do not remove.** (An abandoned sibling session deleted it referencing a
>    non-existent commit `73b8a3f`; restoring it was commit `c8ecdf6b`.)
>
> All other current writers are **non-mirrored legitimate** sole/canonical writers
> (e.g. `focusSearchForced`, `hoveredNode`, `focusOrigin`, `routeMotion`,
> `insideWalkState`, `focusPanelMode`, `mobileSearchSheet`, `premiumMode`) — leave
> them alone.
>
> **Bottom line:** the consolidation the original Phases 2–4 describe is essentially
> complete. The original per-attribute line numbers below are stale (files shifted
> during the Svelte migration); treat them as historical context, not current truth.

## Phase 1 — Initial scan

- Initial file created: OK
- Total unique body.dataset attributes found: **67**
- Total writer sites (document.body.dataset.X =): **120**
- Total reader sites (body.dataset.X read): **186**
- Parity-attrs descriptor keys: **44**
- Parity-owned attrs actually referenced in src/: **38**
- Unused parity descriptor keys (no body.dataset.X access): **6**
  - engineState, journeyCompass, journeyCompassCopy, journeyCompassDensity, searchStatus, threadInspect

## Phase 2 — Classification

### Category A: parity-attrs-owned (38 attributes)

Declared in `src/lib/orchestration/parity-attrs.svelte.ts` PARITY_ATTRIBUTES const AND referenced in src/.
Note: parity-attrs.svelte.ts writes ALL of these through `applyParityAttributes()` (~line 560). Bypass writers elsewhere are LEGACY/DUPLICATE writes — parity is the canonical source of truth.

#### `activeView`

- Owner: parity-attrs
- Writers (bypass): `src/App.svelte:194`, `src/lib/orchestration/app-orchestration.svelte.ts:97`, `src/lib/orchestration/compass-controller.ts:383`
- Readers: `src/lib/stores/test-compat.svelte.ts:95`, `src/App.svelte:193`, `src/lib/orchestration/app-orchestration.svelte.ts:97`, `src/lib/orchestration/compass-controller.ts:383`
- Notes: Dual-source writes. All set to literal 'galaxy' or 'map'. Parity derives from navStore.currentView.

#### `cameraAssist`

- Owner: parity-attrs
- Writers (bypass): `src/lib/engine/camera-controls-core.svelte.ts:146,155`, `src/lib/stores/camera.svelte.ts:551,566`
- Readers: `src/lib/stores/test-compat.svelte.ts:115`
- Notes: Multiple writers set different values ('arriving','free','active',''). Parity sets `cameraAssist: launchReady ? 'free' : 'loading'` from loadingPhaseStore. Bypass writers conflict with parity.

#### `cameraAssistReason`

- Owner: parity-attrs (descriptor) but NOT in ParityAttributeMap return
- Writers (bypass): `src/lib/stores/camera.svelte.ts:552,567`, `src/lib/engine/camera-controls-core.svelte.ts:147,156`
- Notes: Same conflict pattern as cameraAssist. Parity does NOT write this value. Should be added to parity-attrs descriptor properly.

#### `cameraSlack`

- Owner: parity-attrs
- Writers (bypass): `src/lib/stores/camera.svelte.ts:512,616,631`, `src/lib/engine/camera-choreography/orbit-slack.ts:158,186,206`
- Notes: 7 bypass write sites. Parity derives from `cameraStore.orbitSlack.phase`.

#### `cameraSlackReason`

- Owner: parity-attrs
- Writers (bypass): `src/lib/stores/camera.svelte.ts:618`, `src/lib/engine/camera-choreography/orbit-slack.ts:159,187,207`
- Notes: 4 bypass write sites. Parity derives from `cameraStore.orbitSlack.reason`.

#### `compact`

- Owner: parity-attrs
- Writers (bypass): `src/lib/stores/viewport.svelte.ts:175`
- Readers: `src/App.svelte:282`, `src/lib/orchestration/app-orchestration.svelte.ts:179`, `src/lib/stores/test-compat.svelte.ts:108`
- Notes: Parity writes `compact: String(vp.isCompact)`. Bypass in viewport.svelte.ts also writes `String(isCompact)`. Duplicate.

#### `demoPhase`

- Owner: parity-attrs
- Writers (bypass): `src/lib/stores/demo.svelte.ts:93,118,295`
- Readers: `src/lib/stores/test-compat.svelte.ts:104`
- Notes: Parity reads from `demoPhaseGetter()`. Bypass writes set specific phase strings.

#### `filtersActive`

- Owner: parity-attrs
- Writers (bypass): `src/lib/stores/filter.svelte.ts:182,187,211,260`
- Readers: `src/lib/stores/test-compat.svelte.ts:109`
- Notes: 4 bypass writes. Parity computes from filterState stores.

#### `focusTransition`

- Owner: parity-attrs
- Writers (bypass): `src/lib/stores/camera.svelte.ts:650`, `src/lib/engine/camera-controls-core.svelte.ts:84`
- Notes: Parity derives from `focusStore.transitionMode`.

#### `focusedNode`

- Owner: parity-attrs
- Readers (bypass): `src/components/FocusCard.svelte:105`, `src/lib/stores/test-compat.svelte.ts:94,102`
- Notes: No direct bypass WRITES. Parity computes from navStore.focusedIndex or legacy fallback.

#### `graphContext`

- Owner: parity-attrs
- Writers (bypass): `src/App.svelte:194`, `src/lib/orchestration/app-orchestration.svelte.ts:98`, `src/lib/orchestration/compass-controller.ts:387`, `src/lib/orchestration/url-state.ts:481`
- Readers: `src/App.svelte:194,278`, `src/components/CompassRail.svelte:36`, `src/lib/orchestration/app-orchestration.svelte.ts:98,175`, `src/lib/stores/test-compat.svelte.ts:96`
- Notes: Heavy bypass traffic. Parity derives complex logic.

#### `graphicsMode`

- Owner: parity-attrs
- Writers (bypass): `src/lib/data-store.ts:240`, `src/lib/engine/three-engine-core.ts:459`, `src/lib/engine/renderer/webgl-fallback.ts:64`
- Readers: `src/lib/stores/test-compat.svelte.ts:116`
- Notes: Three different sources write this ('webgl', 'fallback', and data-store mode). Parity reads from `graphicsModeStore`.

#### `insideWalkState`

- Owner: parity-attrs
- Writers (bypass): `src/lib/journey/semantic-dive.ts:114`
- Notes: Single bypass writer. Parity derives from `focusStore.strandContinuityPhase`.

#### `inspectedThreadIndex`

- Owner: parity-attrs
- Readers (bypass): `src/components/ThreadInspector.svelte:47`
- Notes: No bypass WRITES. Only reads. Parity computes from `focusStore.threadInspector.inspectedIndex`.

#### `journeyCompassPhase`

- Owner: parity-attrs
- Readers (bypass): `src/lib/stores/test-compat.svelte.ts:100`
- Notes: No bypass WRITES. Only read by test-compat. Parity derives from `journey.compass?.phase`.

#### `journeyNavigationOwner`

- Owner: parity-attrs
- Readers (bypass): `src/App.svelte:283`, `src/lib/orchestration/app-orchestration.svelte.ts:180`
- Notes: No bypass WRITES. Parity derives from `presentation.navigationOwner`.

#### `journeyPhase`

- Owner: parity-attrs
- Writers (bypass): `src/lib/journey/semantic-dive.ts:99`, `src/lib/orchestration/url-state.ts:474,483`
- Readers: `src/lib/stores/test-compat.svelte.ts:105`
- Notes: Parity has complex derivation logic. Bypass writers set 'inside' and 'search'.

#### `loadingOverlay`

- Owner: parity-attrs
- Writers (bypass): `src/lib/ui/loading.ts:72,133`
- Readers: `src/lib/stores/test-compat.svelte.ts:112`
- Notes: Parity sets 'hidden' or 'visible'. Bypass sets 'active' or 'hidden'.

#### `loadingPhase`

- Owner: parity-attrs
- Writers (bypass): `src/lib/data-store.ts:230`, `src/lib/ui/loading.ts:71`
- Readers: `src/lib/stores/test-compat.svelte.ts:111`
- Notes: Two bypass writers. Parity reads from `loadingPhaseStore`.

#### `mapContext`

- Owner: parity-attrs
- Writers (bypass): `src/lib/stores/lifecycle.ts:305`, `src/lib/orchestration/compass-controller.ts:388`
- Readers: `src/lib/stores/test-compat.svelte.ts:98`
- Notes: Parity derives from panelSurfaceMode.

#### `mobile`

- Owner: parity-attrs
- Writers (bypass): `src/lib/stores/viewport.svelte.ts:176`
- Notes: Parity sets `String(vp.isMobile)`. Bypass also writes `String(isCompact)`.

#### `mode`

- Owner: parity-attrs
- Readers (bypass): `src/lib/stores/test-compat.svelte.ts:107`
- Notes: No bypass WRITES. Parity sets from `nav.mode`.

#### `navMode`

- Owner: parity-attrs
- Readers (bypass): `src/components/FocusCard.svelte:106`, `src/lib/stores/test-compat.svelte.ts:101`
- Notes: No bypass WRITES. Parity sets from `navStore.mode`.

#### `navSurface`

- Owner: parity-attrs
- Readers (bypass): `src/lib/stores/test-compat.svelte.ts:97,103`
- Notes: No bypass WRITES. Parity sets from `navStore.surface`.

#### `panelSurface`

- Owner: parity-attrs
- Writers (bypass): `src/App.svelte:196`, `src/lib/orchestration/app-orchestration.svelte.ts:100`, `src/lib/orchestration/compass-controller.ts:330,385`, `src/lib/orchestration/url-state.ts:474,482`
- Readers: `src/App.svelte:197,277`, `src/components/CompassRail.svelte:35`, `src/components/FocusCard.svelte:103`, `src/lib/search/search-panel-adapter.ts:99`, `src/lib/stores/test-compat.svelte.ts:93,97`
- Notes: Very heavy bypass traffic. Parity derives from `panelSurfaceMode`.

#### `panelSurfaceDetail`

- Owner: parity-attrs
- Writers (bypass): `src/App.svelte:197`, `src/lib/orchestration/app-orchestration.svelte.ts:101`, `src/lib/search/search-panel-adapter.ts:89`
- Readers: `src/components/FocusCard.svelte:104`
- Notes: Parity reads `mobileSearchSheet` to derive this. Bypass writers set 'none' or computed detail.

#### `panelSurfaceMode`

- Owner: parity-attrs
- Writers (bypass): `src/lib/orchestration/compass-controller.ts:386`
- Notes: Single bypass writer. Parity has complex derivation logic.

#### `reducedMotion`

- Owner: parity-attrs
- Writers (bypass): `src/lib/stores/viewport.svelte.ts:177,200`
- Readers: `src/lib/stores/test-compat.svelte.ts:106`
- Notes: Parity sets `String(vp.reducedMotion)`.

#### `routeExploration`

- Owner: parity-attrs
- Writers (bypass): `src/lib/stores/camera.svelte.ts:587`, `src/lib/engine/camera-controls-core.svelte.ts:178`
- Readers: `src/lib/stores/test-compat.svelte.ts:99`
- Notes: Parity derives from `journey.routeExplorationPhase`.

#### `sceneReady`

- Owner: parity-attrs
- Writers (bypass): `src/lib/ui/loading.ts:134`
- Readers: `src/components/FocusCard.svelte:107`, `src/lib/stores/test-compat.svelte.ts:113`
- Notes: Parity sets 'true' or 'false'. Bypass sets 'true'.

#### `semanticDive`

- Owner: parity-attrs
- Writers (bypass): `src/App.svelte:195`, `src/lib/orchestration/app-orchestration.svelte.ts:99`, `src/lib/orchestration/compass-controller.ts:329,382`, `src/lib/orchestration/lifecycle.ts:132`, `src/lib/journey/semantic-dive.ts:117`
- Readers: `src/App.svelte:195`, `src/lib/orchestration/app-orchestration.svelte.ts:99`
- Notes: Most heavily contested attribute. 6 bypass writers. Parity derives complex state machine.

#### `strandJourney`

- Owner: parity-attrs
- Writers (bypass): `src/lib/utils/strand-continuity.ts:235`
- Notes: Parity derives from `focusStore.strandContinuityPhase`.

#### `terrainHandoff`

- Owner: parity-attrs
- Writers (bypass): `src/lib/engine/map-state.ts:591`
- Notes: Single bypass writer. Parity derives from `journeyStore.terrainHandoffPhase`.

#### `testReady`

- Owner: parity-attrs
- Writers (bypass): `src/App.svelte:186`
- Notes: Parity sets 'true'. Bypass sets 'true' once parity installed.

#### `threadInspectSurface`

- Owner: parity-attrs
- Writers (bypass): `src/lib/journey/thread-inspector-state.ts:376`, `src/lib/journey/thread-inspector-render.ts:47,96`, `src/lib/stores/lifecycle.ts:304`
- Notes: 4 bypass writers. Parity derives from `focusStore.threadInspector`.

#### `trailDepth`

- Owner: parity-attrs
- Writers (bypass): `src/lib/orchestration/compass-controller.ts:331,394`, `src/lib/orchestration/window-actions.ts:237`
- Readers: `src/lib/orchestration/compass-controller.ts:331,394`, `src/lib/orchestration/window-actions.ts:237`
- Notes: Parity sets from `String(journey.depth)`.

#### `trailState`

- Owner: parity-attrs
- Writers (bypass): `src/lib/orchestration/window-actions.ts:238`
- Notes: Parity derives from trail intent logic.

#### `viewHandoffActive`

- Owner: parity-attrs
- Readers (bypass): `src/lib/stores/test-compat.svelte.ts:114`, `src/lib/orchestration/view-controller.ts:71,119,124`
- Notes: No bypass WRITES. Parity sets from loadingPhaseStore.

#### `viewMode`

- Owner: parity-attrs
- Writers (bypass): `src/lib/orchestration/compass-controller.ts:384`, `src/lib/orchestration/url-state.ts:193`
- Readers: `src/lib/stores/test-compat.svelte.ts:95`, `src/lib/orchestration/view-controller.ts:169`
- Notes: Parity mirrors `navStore.currentView`.

### Category B: bypass-writer-owned (29 attributes)

NOT in the PARITY_ATTRIBUTES descriptor. Written exclusively by legacy/bypass code outside parity-attrs.

#### `appState`

- Owner: bypass-writer
- Writers: `src/components/Splash.svelte:73`
- Readers: `src/components/Splash.svelte:73`
- Notes: Sets 'ready' or 'splash'. Not in parity descriptor. Low migration priority (Splash-specific).

#### `cameraAssistReason`

- Owner: bypass-writer (descriptor entry exists but no ParityAttributeMap return)
- Writers: `src/lib/stores/camera.svelte.ts:552,567`, `src/lib/engine/camera-controls-core.svelte.ts:147,156`
- Notes: NOT in parity ParityAttributeMap return. Should be added to parity-attrs.

#### `cameraTransition`

- Owner: bypass-writer
- Writers: `src/lib/stores/camera.svelte.ts:503,511`
- Notes: Sets 'arrived' or 'idle'. Not in parity. Migration: add to parity-attrs, wire to camera store.

#### `demoActive`

- Owner: bypass-writer
- Writers: `src/lib/engine/demo-choreography.ts:354`
- Notes: Sets 'true'. Not in parity. Migration: add to demo store.

#### `focusOrigin`

- Owner: bypass-writer
- Writers: `src/lib/engine/camera-choreography/cursor.ts:138`, `src/lib/engine/demo-choreography.ts:425`
- Readers: `src/lib/engine/camera-choreography/cursor.ts:138`, `src/lib/engine/demo-choreography.ts:425`
- Notes: Two different sources ('canvas-node', 'micro-demo'). Not in parity.

#### `focusPanelMode`

- Owner: bypass-writer
- Writers: `src/lib/utils/focus-panel-mode.ts:26`
- Readers: `src/App.svelte:279`, `src/lib/orchestration/app-orchestration.svelte.ts:176`
- Notes: Sets focus panel mode string. Not in parity. Migration: add to focus store.

#### `focusSearchForced`

- Owner: bypass-writer
- Writers: `src/App.svelte:288`, `src/lib/orchestration/app-orchestration.svelte.ts:185`, `src/lib/orchestration/url-state.ts:473`
- Readers: `src/App.svelte:284,285,287`, `src/lib/orchestration/app-orchestration.svelte.ts:183,185,192`, `src/lib/orchestration/url-state.ts:473`
- Notes: Complex boolean flag. Not in parity. Migration: add to nav store.

#### `focusTransitionPhase`

- Owner: bypass-writer
- Writers: `src/lib/engine/camera-controls-core.svelte.ts:85,93`
- Notes: Sets 'arriving' or 'settled'. Related to `focusTransition`. Not in parity.

#### `hoveredNode`

- Owner: bypass-writer
- Writers: `src/components/Canvas.svelte:69`
- Readers: `src/components/Canvas.svelte:69,71`
- Notes: Canvas hover index. Not in parity. Low migration priority (component-scoped).

#### `mobileRoutePeek`

- Owner: bypass-writer
- Writers: `src/lib/search/results-ui.ts:740`
- Readers: `src/lib/search/results-ui.ts:740`
- Notes: Sets 'active'. Search-specific.

#### `mobileRoutePeekReason`

- Owner: bypass-writer
- Writers: (none found)
- Readers: `src/lib/search/results-ui.ts:747`
- Notes: Only read, never written in src/. Dead attribute or written from outside src/.

#### `mobileSearchSheet`

- Owner: bypass-writer (read by parity-attrs)
- Writers: `src/lib/search/search-panel-adapter.ts:80,98`
- Readers: `src/lib/search/search-panel-adapter.ts:78,80,98,99,100,116,117,145,159,160`, `src/lib/orchestration/parity-attrs.svelte.ts:384`
- Notes: CRITICAL: parity-attrs READS this to compute `panelSurfaceDetail` (line 384). Writer is search-panel-adapter.ts. Should be moved into parity-attrs descriptor.

#### `mobileSearchSheetUser`

- Owner: bypass-writer
- Writers: `src/lib/search/search-panel-adapter.ts:100`
- Readers: `src/lib/search/search-panel-adapter.ts:100,117,159`
- Notes: User-initiated flag for mobile sheet.

#### `postprocessing`

- Owner: bypass-writer
- Writers: `src/lib/engine/three-engine-core.ts:492`
- Readers: `src/lib/engine/three-engine-core.ts:492`
- Notes: Sets 'skipped'. Graphics pipeline status.

#### `premiumMode`

- Owner: bypass-writer
- Writers: `src/lib/engine/three-postprocessing.ts:123,241`
- Readers: `src/lib/engine/three-postprocessing.ts:123,241`
- Notes: Sets 'true'. Postprocessing feature flag.

#### `renderKind`

- Owner: bypass-writer
- Writers: `src/main.ts:111`, `src/lib/stores/engine-ready.svelte.ts:27`
- Readers: `src/main.ts:111`, `src/lib/stores/engine-ready.svelte.ts:27`
- Notes: Sets initial render kind. Not in parity.

#### `routeDirector`

- Owner: bypass-writer
- Writers: `src/lib/engine/map-state.ts:571`
- Readers: `src/lib/engine/map-state.ts:571`
- Notes: Map director state. Not in parity.

#### `routeDirectorReason`

- Owner: bypass-writer
- Writers: `src/lib/engine/map-state.ts:572`
- Readers: `src/lib/engine/map-state.ts:572`
- Notes: Reason for route director state.

#### `routeExplorationReason`

- Owner: bypass-writer
- Writers: `src/lib/engine/camera-controls-core.svelte.ts:179`
- Readers: `src/lib/engine/camera-controls-core.svelte.ts:179`
- Notes: Companion to routeExploration. Not in parity.

#### `routeMotion`

- Owner: bypass-writer
- Writers: `src/lib/journey/route-trace.ts:146,240`
- Readers: `src/lib/journey/route-trace.ts:146,240`
- Notes: Route trace animation state.

#### `sceneReveal`

- Owner: bypass-writer
- Writers: `src/lib/engine/scene-reveal.ts:27`
- Readers: `src/lib/engine/scene-reveal.ts:27`
- Notes: Sets 'active' or 'inactive'. Scene loading animation.

#### `searchGlow`

- Owner: bypass-writer
- Writers: `src/lib/search/search-panel-adapter.ts:71`
- Readers: `src/lib/search/search-panel-adapter.ts:71`
- Notes: Search glow effect state.

#### `semanticTrailCue`

- Owner: bypass-writer
- Writers: (none found)
- Readers: `src/lib/stores/test-compat.svelte.ts:110`
- Notes: Only read by test-compat. Never written in src/. Dead or external.

#### `strandJourneyFrom`

- Owner: bypass-writer
- Writers: `src/lib/utils/strand-continuity.ts:239`
- Readers: `src/lib/utils/strand-continuity.ts:239`
- Notes: From index for strand journey.

#### `strandJourneyReason`

- Owner: bypass-writer
- Writers: `src/lib/utils/strand-continuity.ts:242`
- Readers: `src/lib/utils/strand-continuity.ts:242`
- Notes: Reason for strand journey.

#### `strandJourneyTarget`

- Owner: bypass-writer
- Writers: `src/lib/utils/strand-continuity.ts:236`
- Readers: `src/lib/utils/strand-continuity.ts:236`
- Notes: Target index for strand journey.

#### `terrainHandoffFrom`

- Owner: bypass-writer
- Writers: `src/lib/engine/map-state.ts:592`
- Readers: `src/lib/engine/map-state.ts:592`
- Notes: Terrain handoff source.

#### `terrainHandoffTo`

- Owner: bypass-writer
- Writers: `src/lib/engine/map-state.ts:593`
- Readers: `src/lib/engine/map-state.ts:593`
- Notes: Terrain handoff destination.

#### `terrainRouteCount`

- Owner: bypass-writer
- Writers: `src/lib/engine/map-state.ts:594`
- Readers: `src/lib/engine/map-state.ts:594`
- Notes: Route count for terrain handoff.

## Phase 3 — Bypass writer migration targets

### Bypass writer files (34 files, excluding parity-attrs.svelte.ts)

| File | Attrs Written | Priority |
|------|--------------|----------|
| `src/App.svelte` | testReady, activeView, graphContext, semanticDive, panelSurface, panelSurfaceDetail, compact, focusSearchForced | HIGH — top-level legacy sync |
| `src/main.ts` | renderKind | LOW — init only |
| `src/lib/data-store.ts` | loadingPhase, graphicsMode | MEDIUM — should be parity-owned |
| `src/lib/ui/loading.ts` | loadingPhase, loadingOverlay, sceneReady | MEDIUM — conflicts with parity |
| `src/lib/stores/viewport.svelte.ts` | compact, mobile, reducedMotion | MEDIUM — parity already owns these |
| `src/lib/stores/camera.svelte.ts` | cameraTransition, cameraSlack, cameraAssist, cameraSlackReason, cameraAssistReason, routeExploration, focusTransition | HIGH — major conflict zone |
| `src/lib/stores/filter.svelte.ts` | filtersActive | MEDIUM — parity already owns |
| `src/lib/stores/demo.svelte.ts` | demoPhase | MEDIUM — parity already owns |
| `src/lib/stores/engine-ready.svelte.ts` | renderKind | LOW |
| `src/lib/stores/lifecycle.ts` | threadInspectSurface, mapContext | MEDIUM |
| `src/lib/stores/test-compat.svelte.ts` | (reads only, no writes) | N/A |
| `src/lib/engine/camera-controls-core.svelte.ts` | focusTransition, focusTransitionPhase, cameraAssist, cameraAssistReason, routeExploration, routeExplorationReason | HIGH — conflicts with parity |
| `src/lib/engine/three-engine-core.ts` | graphicsMode, postprocessing | LOW-MEDIUM |
| `src/lib/engine/three-postprocessing.ts` | premiumMode | LOW — feature flag |
| `src/lib/engine/renderer/webgl-fallback.ts` | graphicsMode | LOW-MEDIUM |
| `src/lib/engine/scene-reveal.ts` | sceneReveal | LOW |
| `src/lib/engine/map-state.ts` | routeDirector, routeDirectorReason, terrainHandoff, terrainHandoffFrom, terrainHandoffTo, terrainRouteCount | MEDIUM — domain-specific |
| `src/lib/engine/demo-choreography.ts` | demoActive, focusOrigin | LOW-MEDIUM |
| `src/lib/engine/camera-choreography/cursor.ts` | focusOrigin | LOW |
| `src/lib/engine/camera-choreography/orbit-slack.ts` | cameraSlack, cameraSlackReason | MEDIUM — conflicts with parity |
| `src/lib/orchestration/app-orchestration.svelte.ts` | activeView, graphContext, semanticDive, panelSurface, panelSurfaceDetail, compact, focusSearchForced, journeyNavigationOwner, focusPanelMode | HIGH — duplicate parity writes |
| `src/lib/orchestration/compass-controller.ts` | semanticDive, panelSurface, trailDepth, viewMode, panelSurfaceMode, graphContext, mapContext | HIGH — conflicts with parity |
| `src/lib/orchestration/lifecycle.ts` | semanticDive | MEDIUM |
| `src/lib/orchestration/url-state.ts` | focusSearchForced, panelSurface, journeyPhase, graphContext, viewMode | HIGH — URL sync conflicts |
| `src/lib/orchestration/window-actions.ts` | trailDepth, trailState | MEDIUM — parity already owns trailDepth |
| `src/lib/orchestration/view-controller.ts` | viewHandoffActive | LOW — reads only |
| `src/lib/search/results-ui.ts` | mobileRoutePeek | LOW |
| `src/lib/search/search-panel-adapter.ts` | searchGlow, mobileSearchSheet, mobileSearchSheetUser, panelSurfaceDetail | MEDIUM — mobile sheet state |
| `src/lib/journey/semantic-dive.ts` | journeyPhase, insideWalkState, semanticDive | MEDIUM |
| `src/lib/journey/route-trace.ts` | routeMotion | LOW |
| `src/lib/journey/thread-inspector-state.ts` | threadInspectSurface | MEDIUM |
| `src/lib/journey/thread-inspector-render.ts` | threadInspectSurface | MEDIUM |
| `src/lib/utils/strand-continuity.ts` | strandJourney, strandJourneyTarget, strandJourneyFrom, strandJourneyReason | MEDIUM — parity owns strandJourney |
| `src/lib/utils/focus-panel-mode.ts` | focusPanelMode | LOW |
| `src/components/Canvas.svelte` | hoveredNode | LOW — component-scoped |
| `src/components/Splash.svelte` | appState | LOW — splash screen only |
| `src/components/FocusCard.svelte` | (reads only) | N/A |
| `src/components/CompassRail.svelte` | (reads only) | N/A |

### Migration priority assessment

**HIGH priority** (direct parity conflicts — same attr, different source):

- `src/lib/stores/camera.svelte.ts` — 7 attrs conflict with parity
- `src/lib/engine/camera-controls-core.svelte.ts` — 6 attrs conflict with parity
- `src/lib/orchestration/app-orchestration.svelte.ts` — 8 attrs duplicate parity
- `src/lib/orchestration/compass-controller.ts` — 7 attrs duplicate parity
- `src/lib/orchestration/url-state.ts` — 5 attrs duplicate parity
- `src/lib/ui/loading.ts` — 3 attrs conflict with parity

**MEDIUM priority** (should be parity-owned but no direct conflict):

- `src/lib/data-store.ts` — loadingPhase, graphicsMode
- `src/lib/stores/viewport.svelte.ts` — compact, mobile, reducedMotion
- `src/lib/stores/filter.svelte.ts` — filtersActive
- `src/lib/stores/demo.svelte.ts` — demoPhase
- `src/lib/engine/camera-choreography/orbit-slack.ts` — cameraSlack, cameraSlackReason
- `src/lib/utils/strand-continuity.ts` — strandJourney family
- `src/lib/search/search-panel-adapter.ts` — mobileSearchSheet, searchGlow
- `src/lib/journey/semantic-dive.ts` — journeyPhase, insideWalkState, semanticDive

**LOW priority** (domain-specific or component-scoped):

- `src/main.ts`, `src/components/Canvas.svelte`, `src/components/Splash.svelte`, `src/lib/engine/three-postprocessing.ts`, `src/lib/engine/scene-reveal.ts`, `src/lib/search/results-ui.ts`, `src/lib/engine/map-state.ts` (routeDirector family)

## Phase 4 — Summary

- **Total unique attributes**: 67
- **Attributes owned by parity-attrs** (in descriptor AND referenced in src/): 38
- **Attributes with bypass writers only** (not in parity descriptor): 29
- **Parity descriptor keys with ZERO src/ references** (dead/unused): 6
  - engineState, journeyCompass, journeyCompassCopy, journeyCompassDensity, searchStatus, threadInspect
- **Total writer sites** (document.body.dataset.X =): 120
- **Total reader sites** (body.dataset.X read): 186
- **Bypass writer files**: 34 (excluding parity-attrs.svelte.ts)
- **Estimated effort to migrate bypass writers into parity-attrs**: **HIGH**

### Migration effort reasoning

1. **Scale**: 120 writer sites across 34 files need consolidation into parity-attrs.svelte.ts
2. **Conflict density**: Multiple files write the same attributes (e.g., `semanticDive` has 6 bypass writers + parity; `cameraAssist` has 4 bypass writers + parity)
3. **Architectural change required**: Bypass writers are deeply integrated into component logic (camera controls, loading states, viewport management). Removing them requires ensuring parity-attrs writes happen at the right time in the lifecycle
4. **CSS dependency**: Many CSS rules (mobile_premium__*.css) depend on specific attribute values. Migration must preserve value semantics
5. **Testing surface**: 38 parity-owned attrs + 29 bypass-only attrs = 67 total. Tests (test-compat.svelte.ts) read all of these
6. **Recommended approach**: Incremental migration — group by subsystem (camera, loading, navigation, search, journey) and migrate one subsystem at a time, verifying CSS behavior after each batch
