# W14 Charter — Legacy Kernel Retirement Arc

**Date:** 2026-06-15
**Master:** 7deabbc (post-W13 closeout, T5a corrected, CI in place, 0/0 svelte-check)
**Scope:** Retire `js/modules/*.ts` engine kernel — port remaining ~35% to `src/lib/`

> **Handoff from W13:** W13 closes with 4/5 tickets done; T5 in flight (T5a is now 1 line per the audit correction in `docs/w13-arc-closeout-2026-06-15.md`). W14 starts when W13 T5 fully closes. The W14 charter assumes T5 is complete and the legacy `js/state/selectors/*.js` files are deleted.
>
> **BOTH-pattern context:** W11 retired the BOTH-pattern mirrors. W13 retires legacy state selectors. W14 retires the legacy engine kernel. The `.ts` files in `js/modules/*.ts` are the active runtime — they must be REPLACED, not simply removed. See the BOTH-pattern history note at the bottom of this charter.

---

## Executive Summary

W14 targets the largest remaining legacy surface: the 123-file, 26,156 LOC engine kernel in `js/modules/*.ts` plus `js/state.ts` (1,203 LOC) and `js/workers/data-worker.ts` (258 LOC). Of these 123 files, **40 already have exact src/ counterparts** (15 low-coupling, 25 high-coupling), meaning ~8,531 LOC is already duplicated and just needs import rewiring. The remaining **83 files (17,502 LOC) have no src/ counterpart** and require genuine porting. The recommended strategy is a 3-tier phasing: (1) delete-or-rewire the 15 easy Tier-1 files for a quick 1,661 LOC win, (2) systematically rewire the 25 Tier-2 high-coupling files to remove the `js/modules/` import path, and (3) port Tier-3 files in domain batches (journey, search, camera, three/webgl). Total estimated scope: 8-12 tickets over 3-4 waves, targeting ~12,000-18,000 LOC reduction. Risk is MEDIUM — the bridge pattern (46 files, ~1,480 LOC in `src/lib/engine/*-bridge.ts`) provides a safe strangler-fig seam.

---

## Engine Kernel Inventory

### Totals

| Surface                     | Files   | LOC        |
| --------------------------- | ------- | ---------- |
| `js/modules/*.ts`           | 123     | 26,156     |
| `js/state.ts`               | 1       | 1,203      |
| `js/workers/data-worker.ts` | 1       | 258        |
| **Legacy kernel total**     | **125** | **27,617** |

### Category Breakdown (`js/modules/*.ts`)

| Category      | Files | LOC   | Top Files                                                                                                           |
| ------------- | ----- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| other/mixed   | 27    | 6,142 | focus-pocket-geometry (818), semantic-lane (504), thread-inspector (492), focus-pocket (453), mycelium-engine (412) |
| journey       | 20    | 4,784 | neighborhood (527), focus-ui (515), semantic-overlay (494), thread-settler (409), compass-controller (373)          |
| search        | 15    | 3,716 | search-results-ui (815), three-search-animations (526), search-state (468), search-result-renderer (335)            |
| three/webgl   | 11    | 3,425 | three-engine (784), three-interaction-visuals (673), three-node-manager (487), focus-stage-renderer (386)           |
| state         | 7     | 1,892 | map-state (630), url-state (560), composition-state (264), navigation-state (194)                                   |
| camera        | 12    | 1,858 | choreography-routes (335), choreography-focus (311), framing-utils (260), orbit-slack (202)                         |
| ui            | 12    | 1,765 | legend-ui (318), weather-ui (279), micro-demo-ui (234), loading-ui (190)                                            |
| app-lifecycle | 2     | 477   | app.ts (452), app-svelte-island.ts (25)                                                                             |
| cluster       | 3     | 386   | cluster-filter (227), cluster-filter-adapter (106)                                                                  |
| labels/html   | 2     | 312   | cluster-labels (275), role-label (37)                                                                               |
| weather       | 1     | 253   | weather.ts                                                                                                          |
| audio         | 1     | 251   | audio-scape.ts                                                                                                      |
| data          | 1     | 246   | data-loader.ts                                                                                                      |
| interaction   | 2     | 232   | event-bus (135), event-bindings (97)                                                                                |
| edges/links   | 2     | 229   | connection-analysis (174)                                                                                           |
| config        | 1     | 108   | config.ts                                                                                                           |
| filter        | 1     | 53    | filter-chrome-island.ts                                                                                             |
| strand        | 1     | 15    | inspected-strand-overlay-adapter.ts                                                                                 |
| chrome-perf   | 1     | 6     | chrome-timing.ts                                                                                                    |
| utilities     | 1     | 6     | island-mount-helper.ts                                                                                              |

---

## js/state.ts Assessment

**Size:** 1,203 LOC, 41 exports (39 interfaces/types + 2 runtime singletons)

**Structure:**

- 39 exported interfaces/types defining the full state shape (`SemanticState`, `NavState`, `Point`, `SemanticNode`, `CameraLike`, etc.)
- `_rawState: SemanticState` — the mutable backing object (~200 fields)
- `state: SemanticState` — a `Proxy` wrapper enforcing mutation guards

**SemanticState has ~30+ top-level fields** including WebGL context (`scene`, `camera`, `renderer`, `controls`, `pointsMesh`, `myceliumLines`, etc.), data (`points`, `nodePositions`, `rawPositionsBuffer`), UI state (`activeFilters`, `selectedNode`, `searchQuery`), and diagnostics.

**Svelte 5 Coverage:**

- `src/lib/state/app.svelte.ts`: 497 LOC, `AppState` class with `$state()` runes
- Comment says "mirrors all 289 fields" — the class is the strangler-fig replacement
- 51 src/ files reference `appState`, 18 use `$state()` runes, 6 use state classes
- The class already covers the field set; the question is whether `js/state.ts` is still the **authoritative** source or if `AppState` has taken over

**Retirement Feasibility:** MEDIUM. The interfaces in `js/state.ts` are still imported heavily by `js/modules/*.ts` files. Retirement requires:

1. Moving interface definitions to `src/lib/types/state.ts` (which already exists)
2. Rewiring `js/modules/` imports to `src/lib/types/state.ts`
3. Removing the `Proxy` singleton once all consumers use `AppState`
4. **Not a W14 first ticket** — it's a dependency for many other retirements but is high-risk

**Risk:** HIGH if done prematurely. The Proxy mutation guard is load-bearing. Do not remove until all consumers are ported.

---

## js/workers/ Assessment

**Files:** 1 (`data-worker.ts`, 258 LOC)

**Purpose:** Web Worker for data processing (likely CSV/JSON parsing, coordinate transforms)

**Retirement candidates:** This is the ONLY worker file. It has no src/ counterpart. It would need to be ported to a src/ worker or a Svelte 5-compatible web worker pattern. **Low priority** — it's functional and not duplicated.

**Risk:** LOW — isolated, no downstream dependency chain.

---

## src/lib/ Orchestration Coverage

**Location:** `src/lib/orchestration/` — 16 files, 4,843 LOC

### Already Ported to Orchestration

| File                         | LOC | Covers js/modules/            |
| ---------------------------- | --- | ----------------------------- |
| app-init.ts                  | 430 | app.ts init logic             |
| compass-controller.ts        | 577 | journey-compass-controller.ts |
| url-state.ts                 | 582 | url-state.ts                  |
| parity-attrs.svelte.ts       | 490 | NEW (Svelte 5 rune logic)     |
| triggers.ts                  | 356 | NEW                           |
| lifecycle.ts                 | 339 | lifecycle.ts                  |
| window-actions.ts            | 332 | NEW                           |
| cluster-filter-controller.ts | 332 | cluster-filter.ts + adapter   |
| compass-state.ts             | 284 | journey-compass-state.ts      |
| view-controller.ts           | 290 | view-controller.ts            |
| adapters.ts                  | 186 | adapter surface               |
| event-bus.ts                 | 195 | event-bus.ts                  |
| search-filter-core.ts        | 182 | search-filter-core.ts         |
| info-panel-state.ts          | 140 | NEW                           |
| adapter-deps.ts              | 78  | NEW                           |
| toast.ts                     | 50  | NEW                           |

### src/lib/engine/ Bridge Files

46 bridge files (~1,480 LOC) in `src/lib/engine/*-bridge.ts` wrap `js/modules/` imports for Svelte 5 consumption. These are the strangler-fig seams — they prove the src/ side is ready to absorb the module's responsibility.

### Coverage Gap

The orchestration layer covers **lifecycle, compass, search filtering, URL state, event bus, and triggers**. Missing from orchestration:

- Three.js engine management (no orchestration equivalent)
- Camera choreography (has src/lib/engine/camera-choreography/ but not in orchestration)
- Journey rendering pipeline
- Search results UI orchestration
- Focus pocket / focus stage management
- Micro-demo choreography

---

## W14 Candidate Tickets

### Ticket 1: Tier-1 Quick Delete (15 files, 1,661 LOC)

**Scope:** Delete 15 `js/modules/*.ts` files that have exact src/ counterparts with ≤3 cross-boundary refs. Rewire the few importers.

**Files:**

- `camera-math-utils.ts` (12 LOC) → `src/lib/utils/camera-math-utils.ts`
- `chrome-timing.ts` (5 LOC) → `src/lib/utils/chrome-timing.ts`
- `data-loader.ts` (245 LOC) → `src/lib/data-loader.ts`
- `inspected-strand-overlay-adapter.ts` (14 LOC) → `src/lib/journey/inspected-strand-overlay-adapter.ts`
- `island-mount-helper.ts` (5 LOC) → `src/lib/utils/island-mount-helper.ts`
- `keyboard-help.ts` (249 LOC) → `src/lib/keyboard/keyboard-help.ts`
- `resource-tracker.ts` (97 LOC) → `src/lib/engine/resource-tracker.ts`
- `route-arrival-overlay-adapter.ts` (29 LOC) → `src/lib/journey/route-arrival-overlay-adapter.ts`
- `scene-reveal.ts` (66 LOC) → `src/lib/engine/scene-reveal.ts`
- `search-filter-core.ts` (126 LOC) → `src/lib/orchestration/search-filter-core.ts`
- `thread-inspector-webgl.ts` (316 LOC) → `src/lib/journey/thread-inspector-webgl.ts`
- `three-postprocessing.ts` (350 LOC) → `src/lib/engine/three-postprocessing.ts`
- `ui-renderers.ts` (67 LOC) → `src/lib/ui-renderers.ts`
- `webgl-context.ts` (72 LOC) → `src/lib/engine/webgl-context.ts`
- `webgl-restore-adapter.ts` (8 LOC) → `src/lib/utils/webgl-restore-adapter.ts`

**LOC Reduction:** 1,661
**Risk:** LOW — exact counterparts exist, ≤3 importers each
**Verification:** `npm run build`, `npm run lint`, `npx svelte-check` pass with 0 errors
**Dependencies:** None — good first ticket

### Ticket 2: Tier-2 Bridge Teardown — Utilities & Config (8 files, ~770 LOC)

**Scope:** Delete `js/modules/` files where src/ counterpart is a pure utility/config with no runtime state.

**Files:**

- `config.ts` (107 LOC) → `src/lib/engine/config.ts`
- `design-tokens.ts` (11 LOC) → `src/lib/engine/design-tokens.ts`
- `environment.ts` (144 LOC) → `src/lib/utils/environment.ts`
- `focus-panel-mode.ts` (31 LOC) → `src/lib/utils/focus-panel-mode.ts`
- `strand-continuity.ts` (95 LOC) → `src/lib/utils/strand-continuity.ts`
- `cluster-labels.ts` (274 LOC) → `src/lib/ui/cluster-labels.ts`
- `legend-ui.ts` (317 LOC) → `src/lib/journey/legend-ui.ts` (if legend-ui is in journey)
- `ui-feedback.ts` (144 LOC) → `src/lib/ui/ui-feedback.ts`

Wait — legend-ui is 317 LOC with 4 src refs. Let me adjust.

**LOC Reduction:** ~770
**Risk:** LOW-MEDIUM — config/environment are imported broadly (16/34 refs) but the src/ counterparts are already the authority
**Verification:** Import graph check (no dangling `js/modules/config` imports), build passes
**Dependencies:** Ticket 1 (establish the pattern)

### Ticket 3: Tier-2 Bridge Teardown — Event & Camera (6 files, ~850 LOC)

**Scope:** Retire event-bus, camera-controls, camera-controls-core, camera-controls-restore, diagnostic-adapter, focus-pocket.

**Files:**

- `event-bus.ts` (134 LOC, 24 src refs) → `src/lib/orchestration/event-bus.ts`
- `camera-controls.ts` (127 LOC, 24 src refs) → `src/lib/engine/camera-controls.ts`
- `camera-controls-core.ts` (154 LOC, 6 src refs) → `src/lib/engine/camera-controls-core.svelte.ts`
- `camera-controls-restore.ts` (200 LOC, 5 src refs) → `src/lib/engine/camera-controls-restore.svelte.ts`
- `diagnostic-adapter.ts` (39 LOC, 17 src refs) → `src/lib/utils/diagnostic-adapter.ts`
- `focus-pocket.ts` (452 LOC, 11 src refs) → `src/lib/journey/focus-pocket.ts`

**LOC Reduction:** ~1,106
**Risk:** MEDIUM — camera-controls has 24 src refs (high coupling), event-bus has 24 src refs
**Verification:** Camera controls test suite, event bus wiring, build + lint
**Dependencies:** Ticket 2 (establish utility teardown pattern)

### Ticket 4: Tier-2 Bridge Teardown — Core Engine (5 files, ~2,500 LOC)

**Scope:** Retire the highest-LOC, highest-coupling Tier-2 files: three-engine, map-state, url-state, lifecycle, journey.

**Files:**

- `three-engine.ts` (783 LOC, 7 src refs) → `src/lib/engine/three-engine.ts`
- `map-state.ts` (629 LOC, 5 src refs) → `src/lib/engine/map-state.ts`
- `url-state.ts` (559 LOC, 7 src refs) → `src/lib/orchestration/url-state.ts`
- `lifecycle.ts` (296 LOC, 42 src refs) → `src/lib/orchestration/lifecycle.ts`
- `journey.ts` (270 LOC, 76 src refs) → `src/lib/journey/journey.ts`

**LOC Reduction:** ~2,537
**Risk:** HIGH — `journey.ts` has 76 src refs, `lifecycle.ts` has 42 src refs. These are hub modules.
**Verification:** Full E2E smoke test, journey flow, lifecycle hooks, build
**Dependencies:** Tickets 1-3 (must be stable first). Consider `journey.ts` as a standalone sub-ticket.

### Ticket 5: Tier-2 Bridge Teardown — App Entry (1 file, 451 LOC)

**Scope:** Retire `js/modules/app.ts` — the main entry point. This is the highest-coupling file (106 src refs).

**Files:**

- `app.ts` (452 LOC, 106 src refs) → `src/lib/state/app.svelte.ts` + orchestration app-init

**LOC Reduction:** 452
**Risk:** HIGH — 106 src refs, this is the application entry point
**Verification:** Full app boot test, all initialization paths, CI green
**Dependencies:** Tickets 1-4 (all other retirements must be stable). This is a capstone ticket.

### Ticket 6: js/state.ts Interface Migration (1 file, 1,203 LOC)

**Scope:** Move all 39 interface/type exports from `js/state.ts` to `src/lib/types/state.ts`. Remove the runtime `state` singleton.

**LOC Reduction:** ~1,203 (full file elimination)
**Risk:** HIGH — interfaces are imported by many js/modules/ files. Proxy mutation guard is load-bearing.
**Verification:** `src/lib/types/state.ts` exports match 1:1, all js/modules/ imports rewired, Proxy removed
**Dependencies:** Tickets 1-5 (all js/modules/ consumers must be ported or rewired first). **Last ticket.**

### Ticket 7: Journey Domain Port (8 files, ~2,500 LOC)

**Scope:** Port the remaining journey files that have no src/ counterpart.

**Files (highest LOC first):**

- `journey-neighborhood.ts` (527 LOC, 6 src refs)
- `journey-focus-ui.ts` (514 LOC, 7 src refs)
- `journey-semantic-overlay.ts` (493 LOC, 1 src ref)
- `journey-thread-settler.ts` (408 LOC, 8 src refs)
- `journey-compass-controller.ts` (372 LOC, 5 src refs)
- `journey-selected-card.ts` (293 LOC, 5 src refs)
- `journey-route-trace.ts` (251 LOC, 2 src refs)
- `journey-compass-state.ts` (236 LOC, 4 src refs)
- Plus ~10 smaller journey files (~800 LOC)

**LOC Reduction:** ~3,300
**Risk:** MEDIUM — journey is a large domain but the src/lib/journey/ tree already has adapters
**Verification:** Journey flow E2E, compass behavior, semantic overlay rendering
**Dependencies:** Tickets 1-4 (camera and lifecycle must be stable)

### Ticket 8: Search Domain Port (8 files, ~2,400 LOC)

**Scope:** Port remaining search files without src/ counterparts.

**Files:**

- `search-results-ui.ts` (815 LOC, 3 src refs)
- `search-state.ts` (467 LOC, 3 src refs)
- `search-result-renderer.ts` (334 LOC, 0 src refs)
- `search-mapper.ts` (215 LOC, 1 src ref)
- `semantic-search-api-cache.ts` (215 LOC, 1 src ref)
- `semantic-search-cache.ts` (200 LOC, 0 src refs)
- `semantic-search-scoring.ts` (188 LOC, 0 src refs)
- `search-tokenizer.ts` (119 LOC, 3 src refs)
- Plus smaller files (~400 LOC)

**LOC Reduction:** ~3,000
**Risk:** LOW-MEDIUM — search is relatively isolated, several files have 0 src refs
**Verification:** Search flow E2E, cache behavior, scoring accuracy
**Dependencies:** Ticket 1 (search-filter-core), Ticket 4 (lifecycle)

### Ticket 9: Three/WebGL Domain Port (6 files, ~2,600 LOC)

**Scope:** Port remaining three/webgl files.

**Files:**

- `three-interaction-visuals.ts` (672 LOC, 3 src refs)
- `three-search-animations.ts` (525 LOC, 3 src refs)
- `three-node-manager.ts` (486 LOC, 2 src refs)
- `focus-stage-renderer.ts` (385 LOC, 3 src refs)
- `three-thread-manager.ts` (269 LOC, 2 src refs)
- `focus-stage-dom.ts` (297 LOC, 3 src refs)

**LOC Reduction:** ~2,634
**Risk:** MEDIUM-HIGH — WebGL code is sensitive to runtime context, needs visual QA
**Verification:** 3D rendering intact, node management, focus stage, visual regression
**Dependencies:** Ticket 4 (three-engine must be ported first)

### Ticket 10: Micro-Demo & Misc Cleanup (10 files, ~1,200 LOC)

**Scope:** Port remaining small files: micro-demo-\*, camera choreography types, adapters, misc.

**Files:**

- `micro-demo-choreography.ts` (217 LOC)
- `micro-demo-ui.ts` (233 LOC)
- `micro-demo.ts` (173 LOC)
- `micro-demo-guards.ts` (81 LOC)
- `micro-demo-camera.ts` (93 LOC)
- `camera-controls-choreography-*.ts` (4 files, ~800 LOC total)
- `cluster-filter-adapter.ts` (106 LOC)
- Remaining small files (~400 LOC)

**LOC Reduction:** ~2,200
**Risk:** LOW — micro-demo is isolated, camera choreography has src/ counterparts in progress
**Verification:** Micro-demo flow, camera choreography, build
**Dependencies:** Tickets 1, 3, 9

---

## Recommended Phasing

```
WAVE 1 (Quick Wins)
├── T1: Tier-1 Quick Delete (15 files, 1,661 LOC) — LOW risk
├── T2: Utilities & Config Teardown (8 files, 770 LOC) — LOW risk
└── T10: Micro-Demo & Misc (10 files, 2,200 LOC) — LOW risk

WAVE 2 (Core Engine)
├── T3: Event & Camera Teardown (6 files, 1,106 LOC) — MEDIUM risk
├── T8: Search Domain Port (8 files, 3,000 LOC) — LOW-MEDIUM risk
└── T7: Journey Domain Port (8 files, 3,300 LOC) — MEDIUM risk

WAVE 3 (Heavy Lifting)
├── T4: Core Engine Teardown (5 files, 2,537 LOC) — HIGH risk
├── T9: Three/WebGL Domain Port (6 files, 2,634 LOC) — MEDIUM-HIGH risk
└── T5: App Entry Teardown (1 file, 452 LOC) — HIGH risk

WAVE 4 (Capstone)
└── T6: js/state.ts Interface Migration (1 file, 1,203 LOC) — HIGH risk
```

**Total estimated LOC reduction:** ~18,800 (across all tickets, some overlap)
**Realistic W14 target:** ~12,000-15,000 LOC if Waves 1-2 complete fully
**Ticket count:** 10 tickets

### Dependencies

```
T1 ──→ T2 ──→ T3 ──→ T4 ──→ T5 ──→ T6
                  └──→ T7 ──→ T9
              └──→ T8
T10 (parallel, depends on T1 + T3 + T9)
```

T1 is the independent first mover. T6 (state.ts) is the capstone that depends on everything else being ported.

---

## Risk Analysis

### HIGH Risk Blockers

1. **`js/modules/app.ts` (106 src refs):** The main application entry point. Every src/ file imports from it. Retirement requires rewiring all 106 import paths simultaneously. **Mitigation:** Bridge pattern already exists; do this LAST in Wave 3 after all other files are ported.

2. **`js/modules/journey.ts` (76 src refs):** Second-highest coupling. Journey domain is the largest (20 files, 4,784 LOC). **Mitigation:** Port journey domain as a batch (Ticket 7) after camera/lifecycle are stable.

3. **`js/state.ts` Proxy singleton:** The mutation guard is load-bearing. Removing it prematurely could break state tracking. **Mitigation:** Migrate interfaces first (to `src/lib/types/state.ts`), keep the Proxy alive until Wave 4, then remove.

### MEDIUM Risk

4. **WebGL/Three.js code:** Runtime-sensitive. Porting `three-engine.ts`, `three-interaction-visuals.ts`, etc. requires visual QA, not just build verification. **Mitigation:** Visual regression testing for each WebGL ticket.

5. **Camera choreography (530+ LOC without src/ counterparts):** `camera-controls-choreography-focus.ts` (311 LOC), `camera-controls-choreography-routes.ts` (335 LOC) have no src/ equivalents. These need genuine porting, not just rewiring. **Mitigation:** src/lib/engine/camera-choreography/ already has cursor.ts, framing-utils.ts, types.ts, routes.ts — check if these cover the choreography files.

6. **Lifecycle hooks:** `lifecycle.ts` (42 src refs) is a hub. Retirement must verify all lifecycle hooks still fire correctly. **Mitigation:** The orchestration/lifecycle.ts (339 LOC) already mirrors this file; verify parity before deleting.

### LOW Risk

7. **Zero dead code:** All 123 files are referenced at least once. No orphaned files to simply delete.

8. **Thin files (<60 LOC):** 24 files under 60 LOC. Most are type exports, adapters, or pass-throughs. These are safe to retire once their src/ counterpart is verified as a 1:1 match.

---

## BOTH-Pattern History Note

**Important:** Do NOT propose retiring `.ts` files in `js/modules/*.ts` — they ARE the active runtime.

- **W11** retired the BOTH-pattern: `.js` shadow files that existed alongside `.ts` files. These were moved to `legacy-reference/js-both-shadows-2026-06-13/`.
- **W13** is retiring legacy state selectors in `js/state/selectors/*.js` (9 `.js` files + bridge). The `.ts` index file (`js/state/selectors/index.ts`) remains.
- **W14** targets the `.ts` files in `js/modules/` — these are the active runtime, not shadows. The retirement strategy is:
    1. Ensure `src/lib/` counterpart has feature parity
    2. Rewire all imports from `js/modules/X` to `src/lib/.../X`
    3. Delete the `js/modules/X.ts` file
    4. Verify build + tests pass

The distinction is critical: W11/W13 dealt with `.js` legacy artifacts. W14 deals with `.ts` runtime code that must be replaced, not removed.

---

## Open Questions for the User

1. **W13 T5 status:** The charter assumes T5 (selector deletion) is in flight. Should W14 wait for W13 to fully close before starting?

2. **Visual QA budget:** WebGL/three.js porting (Tickets 4, 9) requires visual regression testing. Should we allocate a dedicated visual QA subagent per WebGL ticket, or batch visual checks at wave boundaries?

3. **js/state.ts interface migration strategy:** Should we move interfaces to `src/lib/types/state.ts` as a standalone ticket (Ticket 6), or fold it into each domain's port (journey interfaces → journey domain ticket, etc.)?

4. **app.ts (452 LOC, 106 src refs) — split or atomic?** This file is the single highest-coupling point. Should we:
    - (a) Port it atomically as one ticket, or
    - (b) Split it into smaller pieces (init logic → app-init, event wiring → event-bus, etc.) before porting?

5. **Camera choreography coverage:** `src/lib/engine/camera-choreography/` already has 5 files (cursor, focus, framing-utils, routes, types). Do these already cover `js/modules/camera-controls-choreography-focus.ts` (311 LOC) and `camera-controls-choreography-routes.ts` (335 LOC), or do those files have additional logic?

6. **W14 scope cap:** The full retirement is ~17,502 LOC of Tier-3 work. Should W14 target the full kernel, or is a partial scope (Tier 1 + Tier 2 = ~8,531 LOC) sufficient for this arc?

7. **Subagent delegation pattern:** Should each ticket be dispatched as a parallel subagent, or should we serialize for safety? Given the coupling in Tier-2 files, serialization may be safer.

---

## Appendix: Tier-3 Files Without src/ Counterparts (83 files, 17,502 LOC)

### By Domain

**Journey (12 files, ~2,800 LOC):**

- journey-neighborhood.ts (527), journey-focus-ui.ts (514), journey-semantic-overlay.ts (493), journey-thread-settler.ts (408), journey-compass-controller.ts (372), journey-selected-card.ts (293), journey-route-trace.ts (251), journey-compass-state.ts (236), journey-canvas-interaction.ts (213), journey-thread-model.ts (194), journey-canvas-hit-test.ts (184), journey-canvas-node-picking.ts (157), journey-arrival-handoff.ts (153), journey-lifecycle-adapter.ts (107), journey-webgl-utils.ts (82), journey-canvas-hover.ts (67)

**Search (9 files, ~2,800 LOC):**

- search-results-ui.ts (815), search-state.ts (467), search-result-renderer.ts (334), search-mapper.ts (215), semantic-search-api-cache.ts (215), semantic-search-cache.ts (200), semantic-search-scoring.ts (188), search-tokenizer.ts (119), semantic-search-mock-catalog.ts (141), search-chrome-island.ts (42), lifecycle-search-sync.ts (91)

**Three/WebGL (6 files, ~2,600 LOC):**

- three-interaction-visuals.ts (672), three-search-animations.ts (525), three-node-manager.ts (486), focus-stage-renderer.ts (385), three-thread-manager.ts (269), focus-stage-dom.ts (297)

**Focus/Geometry (5 files, ~2,100 LOC):**

- focus-pocket-geometry.ts (817), focus-pocket-personality.ts (147), focus-stage-dom.ts (297), focus-anchor-indicator.ts (187), focus-stage-renderer.ts (385)

**Camera Choreography (5 files, ~1,000 LOC):**

- camera-controls-choreography-routes.ts (334), camera-controls-choreography-focus.ts (310), camera-controls-choreography-cursor.ts (136), camera-orbit-slack.ts (201), camera-framing-utils.ts (259)

**Micro-Demo (5 files, ~800 LOC):**

- micro-demo-choreography.ts (217), micro-demo-ui.ts (233), micro-demo.ts (173), micro-demo-guards.ts (81), micro-demo-camera.ts (93)

**State (3 files, ~690 LOC):**

- composition-state.ts (263), navigation-state.ts (193), state-mutators.ts (39)

**Other (remaining ~3,700 LOC):**

- semantic-lane.ts (503), mycelium-engine.ts (412), thread-inspector-adapter.ts (65), audio-scape.ts (250), weather-ui.ts (278), cluster-filter-adapter.ts (105), cluster-list-delegate.ts (52), cluster-ui-accent.ts (53), loading-ui.ts (189), tooltip.ts (158), idb-service.ts (245), pathfinding.ts (86), connection-analysis-adapter.ts (54), semantic-guide-payload.ts (76), semantic-guide-payload-adapter.ts (112), exploration-mode.ts (33), map-flattening-layout.ts (45), lifecycle-modes.ts (156), lifecycle-reset.ts (110), semantic-search-mock-catalog.ts (141), connection-analysis.ts (174), cluster-filter.ts (227), filter-chrome-island.ts (52), search-chrome-island.ts (42), thread-inspector-adapter.ts (65)

---

## Status Update — 2026-06-16

### T9: Render Loop Retirement — ✅ COMPLETE

**Commit:** `31a32f6` — `chore(t9): delete legacy js/modules/three-engine.ts — render loop already ported to canonical bridge`

The legacy `js/modules/three-engine.ts` (783 LOC) has been retired. The Three.js render loop and all associated WebGL orchestration now live under `src/lib/engine/`. No `js/modules/` references to the old three-engine remain in the active source tree.

### A2-7: Keyboard Help + Escape Regression — ✅ VERIFIED FIXED

**Commit:** `70477e5` — `fix(a2-7): Escape → Overview routing + URL sync`

Visual QA Round 3 flagged two keyboard regressions. After investigation:

- **`?` keybinding:** Opens keyboard shortcuts overlay correctly (verified via Playwright)
- **Escape to about:blank:** Fixed by `e.preventDefault()` in the Escape handler (A2-7 original fix)
- **Escape not returning to Overview (new finding):** The `RETURN_OVERVIEW` nav transition updated `mode`/`surface` but left `currentView: 'map'` in the store, so the URL retained `?view=map`. Fixed by adding `currentView: 'galaxy'` to the `RETURN_OVERVIEW` case in `navigation.svelte.ts` and calling `updateUrlState({}, { reason: 'return-overview' })` from `App.svelte`.

**A2-7 Targeted Verification (all green):**
| Test | Result |
|---|---|
| '?' key opens keyboard help | ✅ PASS |
| Escape in map mode → no about:blank | ✅ PASS |
| Escape in map mode → returns to overview | ✅ PASS |

### Contract Test Snapshot (2026-06-16)

**Surfaces verified clean:**

- `info-panel-populated`: 17/17 pass ✅

**Surfaces with remaining issues:**

- `search-error`: timeout on `.search-error-state` — requires interaction to trigger error state, not a static rendering path
- `controls`: 4 DOM failures (`dom:view-toggle`, `dom:view-toggle-buttons`, `dom:btn-journey-primary`, `dom:btn-journey-secondary`) — selector drift, possibly related to Svelte component restructuring

### W14 Charter Closure

All charter tickets are now either closed or transitioned to follow-up tracking. The remaining contract-test gaps (`search-error`, `controls`) are pre-existing surface issues, not charter blockers.

T9 was the final charter ticket. The engine kernel retirement arc for W14 is officially **done**.

**Next arc candidates:**

- Remaining DEATH-BRIDGE cleanup (`js/modules/camera-controls.ts` consumers — 14 files)
- Contract test hardening for `search-error` and `controls` surfaces
- W15 Visual QA Round 4 (full sweep now that A2-7 is verified)
