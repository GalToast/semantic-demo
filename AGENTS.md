# Agents - Semantic Explorer

## Project Overview
3D semantic mycelium visualization for exploring Montgomery County TX business relationships.

## Harness Self-Improvement
- Pi harness self-upgrade is an explicit operating requirement here too. Keep `AGENTS.md`, Pi memory docs, USER.md, and the skill registry current as durable operating truth.
- If the Pi harness, tooling, prompts, switchboard workflow, MCP setup, browser resource policy, or agent instructions create friction and there is a safe upgrade path, improve the harness rather than repeatedly working around it.
- Avoid broad recursive filesystem searches in this workspace; prefer shallow, scoped probes and exact path checks unless a full inventory is requested. If a command hangs, stop and switch to narrower checks.
- Pi harness is fully customizable: dispatch a focused subagent or edit the relevant harness files when an immediate upgrade, fix, optimization, or user-friendly polish is available, then verify with targeted tests before continuing product work.
- Look for opportunities to create or update reusable Pi harness skills so the agent keeps evolving across sessions.
- For Pi's executable JavaScript scratch tool, use the `js-repl` skill instead of embedding REPL safety rules in broad project instructions.
- For external/community research (library version quirks, bundler config gotchas, known bugs), use the `websearch` MCP server (5 tools: `websearch_web_search`, `websearch_web_fetch`, `websearch_content_search`, `websearch_company_search`, `websearch_web_search_status`). Connect via `mcp({connect: "websearch"})` if not already connected. Tavily is the most reliable backend; Exa may 402 on credit limits. Search aggressively and early — don't burn cycles reinventing what the community already documented. Query pattern: `"<library> <version> <exact symptom>"` (e.g., `vite three.js webgpu build pulls in three.core.js`). Cross-reference web answers against local code before applying.

## Dev Environment Hardening
- **Static Dev Mode**: The app includes a JS-side fallback for static Python development servers. If `api.php` returns raw PHP source code, the `detectStaticDevPHP` utility triggers a mock healthy state and provides high-synergy search results.
- **Hardware Resilience**: GPU textures are tracked and disposed in `js/modules/three-node-manager.js` (`_trackedTextures` + `disposeTextures()`). Event listeners in `event-bindings.js` use an `AbortController` for `global-bindings.js`. As of 2026-06-05 sweep, 4 binding modules (legend, onboarding, journey, panel) registered listeners outside the signal — all fixed in the binding-listeners fix wave (verified resolved).

## Key Files
| Path | Role |
|---|---|
| `js/modules/app.js` | Main entry; imports all modules |
| `js/state.js` | Single source of truth for all global state |
| `js/modules/bridge-registry.js` | Legacy global action/state compatibility registry |
| `js/modules/diagnostic-adapter.js` | Central gate for debug/devtool probes such as `_ti` |
| `js/modules/environment.js` | Shared viewport, pointer, DPR, and reduced-motion helpers |
| `js/modules/lifecycle.js` | App orchestration, view handoff, window bindings, scene-reveal logic |
| `js/modules/micro-demo.js` | 9-second guided choreography |
| `js/modules/journey.js` | Thin journey orchestration layer; delegates extracted journey owners and preserves the public surface |
| `js/modules/journey-neighborhood.js` | Neighborhood manifest, bounded walk candidates, trail seed, and route index derivation |
| `js/modules/journey-selected-card.js` | Focus-stage sync, selected-card rendering, and selected business DOM hydration |
| `js/modules/journey-canvas-interaction.js` | Thin facade: re-exports from extracted canvas interaction modules + inline event binding orchestrator |
| `js/modules/journey-canvas-hit-test.js` | Canvas node hit testing, pointer position, thread candidate visibility |
| `js/modules/journey-canvas-node-picking.js` | Raycaster-based canvas field node picking and candidate comparison |
| `js/modules/journey-canvas-hover.js` | Canvas field hover state (set/clear) |
| `js/modules/journey-focus-ui.js` | Focus/traversal DOM UI, neighbor rail rendering, and walk breadcrumb internals |
| `js/modules/journey-thread-settler.js` | Thread walk traversal, neighbor timers, inspection settle flow, and inside preview state |
| `js/modules/journey-thread-model.js` | Thread state model and trail seed derivation shared across journey and thread inspector |
| `js/modules/journey-webgl.js` | Journey-side WebGL overlay orchestration (delegates to extracted modules below) |
| `js/modules/journey-arrival-handoff.js` | Camera handoff overlay for journey thread arrival (orchestrates arrival frame lifecycle) |
| `js/modules/journey-route-trace.js` | Route trace overlay rendering and frame updates for trail visualization |
| `js/modules/journey-semantic-overlay.js` | Semantic-overlay (manifold + lens) rendering tied to journey focus state |
| `js/modules/journey-webgl-utils.js` | Shared WebGL utilities for journey overlays (texture lookups, geometry helpers) |
| `js/modules/relationship-roles.js` | Shared relationship role normalization used by journey, thread inspector, and semantic threads |
| `js/modules/strand-continuity.js` | Shared strand phase and arrival continuity state for journey and thread inspector |
| `js/modules/thread-inspector.js` | Inspecting connections: pulsing, score-reactive WebGL lines between nodes when exploring semantic neighborhoods |
| `js/modules/thread-inspector-webgl.js` | WebGL line geometry and shader setup for the thread inspector (extracted from monolithic inspector) |
| `js/modules/focus-pocket.js` | Focus pocket node layout and animation (delegates to extracted geometry/personality modules) |
| `js/modules/focus-pocket-geometry.js` | Focus pocket constellation geometry, seeded placement, screen-bounds, thread curve points |
| `js/modules/focus-pocket-personality.js` | Per-focus personality variants (rotation/scale seeds, neighborhood shape) driving focus pocket variation |
| `js/modules/ui-renderers.js` | Window-bound DOM renderers for legend, search rows, and selected-card chrome |
| `js/modules/search-state.js` | Search engine, query tokenization, result rendering |
| `js/modules/three-engine.js` | WebGL engine: scene, camera, renderer, shaders, instanced meshes |
| `js/modules/three-node-manager.js` | Node/spore instancing, per-node spore scales, points buffer lifecycle |
| `js/modules/three-thread-manager.js` | Mycelium/thread line geometry, pulse opacity, presentation profile |
| `js/modules/three-interaction-visuals.js` | Semantic manifold + lens overlays, interaction-driven uniforms |
| `js/modules/three-search-animations.js` | Hero moment, corridor glow, search corridor animation lifecycle |
| `js/modules/utils/seeded-random.js` | GLSL-portable `seededUnit(index, salt)` for deterministic per-node variation |
| `js/modules/camera-controls.js` | Camera choreography: transitions, auto-rotation, orbit slack |
| `js/modules/camera-framing-utils.js` | Canvas unobstructed region, focus-pocket screen bounds, safe-area target offset |
| `js/modules/camera-orbit-slack.js` | Search-route focus active, focus orbit slack pivot and apply/clear |
| `js/modules/focus-pocket.js` | Focus pocket node layout and animation |
| `js/modules/event-bindings.js` | Thin orchestrator: imports each `bindings/` module and dispatches its `bind*` function via `initEventListeners` |
| `js/modules/bindings/` | Per-surface DOM event listeners (filter, journey, legend, mode, panel, search, view, etc.) — replaces the monolithic event-bindings.js with focused per-feature modules |
| `js/modules/journey-compass-state.js` | Journey compass derivation function (pure computation, not an FSM). Returns descriptor with `phase ∈ {'map', 'inside', 'focus', 'search', 'overview'}` |
| `js/modules/loading-ui.js` | Loading overlay, phases, deferred hydration |

## Demo Spec
- **MICRO-DEMO-SPEC.md** - camera choreography, timing, node selection for `micro-demo.js` (living spec)

`micro-demo.js` is the sole demo entry point; it owns both the first-visit eligibility guard and the choreography. `app.js` imports it for the launch path.

## 3D Network Framing
The 8,406-point mycelium data lives in `state.rawPositionsBuffer` (Float32Array) in `[0,1]³` unit-cube space (UMAP/PCA projection). `getPointBoundsCenter(points, positionBuffer)` in `js/modules/three-node-manager.js:103` is the canonical bounds reader. It must be called with the raw buffer, not just the points array (the data objects don't carry x/y/z). With the buffer, `state.overviewBounds.renderCenterOffset` correctly centers the network on origin, and `MYCELIUM_FIELD_SCALE = (3.2, 2.6, 3.7)` scales it to fill the camera frustum. Bug history: prior to the fix, the call site passed only `state.points`, so `getPointBoundsCenter` saw count=0 and the network sat at its raw (0.5, 0.5, 0.5) centroid scaled up — visible as the network in the upper-right of the canvas. Always pass the buffer to bounds readers.

## State Machine Reference

Verified state machine integrity: `docs/semantic-demo-bugsweep-2026-06-05.md`

### micro-demo.js (`js/modules/micro-demo.js`)
```
IDLE -> GLIDING -> ARRIVED -> CARD_VISIBLE -> PULLBACK -> WIDE_VIEW -> RETURNING -> COMPLETE
    |           |            |              |            |            |            |
    +---------->+----------->+------------->+----------->+----------->+---------->+
                |            |              |            |            |            |
                +---> CANCELLED <-----------+------------+------------+------------+
```
CANCELLED can branch from **any non-terminal phase** (GLIDING, ARRIVED, CARD_VISIBLE, PULLBACK, WIDE_VIEW, or RETURNING); the `cancelMicroDemo()` guard only blocks IDLE, COMPLETE, and already-cancelled.
Phase timing targets: GLIDING 1400ms, ARRIVED immediate, CARD_VISIBLE 1800ms hold, PULLBACK 1200ms, RETURNING 1000ms.

### journey-compass-state.js (`js/modules/journey-compass-state.js`)
`journey-compass-state.js` is a pure derivation function (no FSM). `getJourneyCompassState()` returns a descriptor with `phase ∈ {'map', 'inside', 'focus', 'search', 'overview'}` derived from current view and journey state. Driven by `data-panel-surface` and `data-active-view` body attributes via the controller.

## Storage
- `localStorage.moco_mycelium_demo_v1` - lifetime per-browser flag (set by micro-demo on completion/cancel)
- `sessionStorage.moco_mycelium_demo_session_v1` - per-session guard preventing duplicate choreography within an active browsing session

## CSS Architecture
CSS is split into ordered modules in `css/`. The root `semantic-demo.css` is an import manifest that loads modules in cascade order. The final premium mobile owner is the ordered split loaded directly by the app shell:
`css/mobile_premium__focus-dive.css`, `css/mobile_premium__chrome.css`, `css/mobile_premium__state.css`, `css/mobile_premium__idle.css`, `css/mobile_premium__map.css`, `css/mobile_premium__surfaces.css`, and `css/mobile_premium__narrow.css`.

Key modules:
- `css/layout_base.css` - info panel, legend, mode chips, broad layout
- `css/journey_active.css` - active journey, field-node, route, mobile focus cockpit
- `css/mobile_premium__*.css` - split mobile final owner: focus/dive, chrome, state-machine, idle, map summary, surface corrections, and narrow viewport corrections
- `css/progressive_disclosure.css` - graph-context/dive show/hide behavior, search empty-state

Use `docs/semantic-demo-css-ownership-map.md` and `docs/semantic-demo-mobile-state-ownership.md` to find the owning module before editing.

## Quick Dev Commands
```bash
npm run build         # Vite/Svelte production build to dist/svelte/
npm run lint          # ESLint js/modules/
npm run test          # shell/cache/CSS ownership checks
npm run test:unit     # Vitest unit tests under tests/unit/
npm run test:contract # structural JS/DOM contract tests
npm run qa:contract:all  # DOM/layout assertions (fast, all surfaces)
npm run qa:surface:all    # Visual screenshot audit (full suite)
npm run qa:surface:mobile-idle  # Single visual state
npm run test:microdemo   # Micro-demo programmatic verification
npm run serve          # static dev server on 127.0.0.1:8795
```

## Surface/Contract Tests (Playwright)
`tests/surface-contract-check.mjs` runs fast DOM/layout assertions for named surfaces:
- `mobile-idle`, `desktop-idle`, `launch-focus`, `search-error`, `map-trail`, `focus-pocket`, `field-node`, `info-panel-empty`, `compass-rail`, `loading-overlay`, `mode-grid`, `filters`, `thread-inspector`, `controls`, `search-chrome`, `info-panel-populated`, `global-spacing`

`tests/visual-state-audit.mjs` captures screenshots for visual QA across the full named surface matrix.

Additional contract tests: `tests/demo-init-seam-contract.mjs`, `tests/micro-demo.spec.js`, `tests/focus-pocket-motion-contract.mjs`, `tests/loading-ui-contract.mjs`, `tests/scene-atmosphere-contract.mjs`, `tests/three-visual-polish-contract.mjs`, `tests/weather-surface-ownership-contract.mjs`, `tests/weather-widget-render-contract.mjs`, `tests/info-panel-collapsed-render-contract.mjs`, `tests/mode-chip-state-render-contract.mjs`, `tests/search-peek-expanded-render-contract.mjs`

**Contract test status** — All 225 contract tests now pass. Some surfaces have slower execution times (e.g., search-no-results at 33.7s). Visual critique deferred focus/trail/journey states to follow-up due to interaction requirements, not tooling limits.

## UI Critic Operating Contract
- Diagnose before editing: identify the owning surface, winning selector/state writer, and whether transitions, inline style, `!important`, media queries, or late imports control the bug.
- For every UI fix, capture failing geometry before and passing geometry after; include overlap, clipping, stale hidden-layout elements, z-index/occlusion, and visible screenshot/snapshot evidence when composition matters.
- When Codex or a worker lacks native vision/audio/generative media capability, NVIDIA NIM multimodal models may be used as a fallback for visual QA, screenshot critique, text-to-speech, image generation, or video generation. Verify the specific NIM model is present and callable before relying on it, and never record API keys in prompts, reports, docs, or memory.
- Run browser-based tests headed. Static/non-browser checks may stay normal, but Playwright/Chromium tests must use headed mode.
- Treat repeated narrow CSS fixes on the same surface as an ownership smell. Stop and define or update the layout contract instead of adding another selector.
- Do not keep unproven CSS. If a rule does not change live computed geometry in DevTools or focused QA, remove it before handoff.
- Final UI handoffs must state verified checks, unverified surfaces, known unrelated failures, and the next suspicious seam.

## Debug Flags
- `?demo=force` - re-trigger demo even if already seen
- `?nodemo=1` - suppress demo entirely

## Edit Safety
- Keep edits inside the assigned slice; do not opportunistically reformat or clean unrelated files.
- Treat `js/state.js`, `js/modules/app.js`, `js/modules/journey.js`, `js/modules/lifecycle.js`, and deploy scripts as high-risk surfaces that need explicit ownership and targeted tests.
- CSS is split into ordered modules in `css/`; `semantic-demo.css` is an import manifest, while the `css/mobile_premium__*.css` files are loaded by the Svelte app shell (`src/index.html` -> `dist/svelte/index.html`).
- Do not move the app root until `deploy.sh` and `deploy.ps1` no longer depend on the sibling `../js/scanner.js` path.
- **CSS state ownership**: Use `docs/semantic-demo-mobile-state-ownership.md` and `docs/semantic-demo-css-ownership-map.md` to trace which `data-*` attribute and CSS module owns a visual surface before editing.
- **No `!important` in CSS**: Every `!important` is a signal of unresolved specificity conflict. Surface-level `!important` declarations are documented in `docs/semantic-demo-css-ownership-next-pass.md`.

## Durable Code Invariants

- **`withStateMutation()` required for tracked sub-objects** — `_makeProdProxy` throws in production when `!_isMutating`. All mutations to `navState`, `strandContinuityState`, and other `TRACKED_SUB_KEYS` in `state.js` MUST be wrapped in `withStateMutation()`. Failure to do so causes a production throw. Applied to `focus-pocket.js` state writes during the constellation sweep.
- **Dead CSS selectors are deleted outright** — When grep confirms zero references in any JS/TS/HTML/Svelte file, delete the dead selectors without TODO comments. Established pattern from `clusters.css` and `demo_ui.css` cleanup.
- **`initSemanticLens()` disposes before reinit** — Both the `.js` and `.ts` paths for `initSemanticLens()` now call `disposeSemanticLens()` first. Any future lens/manifold reinit must keep both paths in sync.
- **Deterministic geometry via `seededUnit()`** — `Math.random()` in WebGL/geometry code breaks determinism. Use `seededUnit(index, salt)` from `js/modules/utils/seeded-random.js` instead. Applied to `three-search-animations.js` particle trails.

## MCP Recovery

**Symptom:** `mcp__chrome-devtools__*` or `mcp__playwright__*` tool calls return `No such tool available`. `claude mcp list` reports both as ✓ Connected.

**Diagnosis:** Claude Code's tool catalog is stale even though the MCP node processes are alive at the OS level. The MCP node connection has wedged in a way that the tool catalog snapshot inside Claude Code does not refresh. Browser profile collisions can also present as missing or failing tools when multiple Codex/Claude/subagent sessions reuse the same default Chrome profile.

**Launcher invariant:** Shared launchers under `C:\Users\HP\.codex\mcp-runtimes\` must assign session-scoped, client-tagged browser profiles by default (`playwright-<client>-session-*`, `chrome-devtools-<client>-session-*`) and pass broad MCP flags. Do not switch to persistent profile scope unless intentional shared login state is more important than concurrent subagent safety. Do not auto-open a docked DevTools panel during visual QA; it changes `window.innerWidth` and invalidates viewport/aspect-ratio evidence. DevTools-panel automation is opt-in via `CODEX_MCP_OPEN_DEVTOOLS_PANEL=1` or `CLAUDE_MCP_OPEN_DEVTOOLS_PANEL=1`.

**Recovery:**
1. Run `npm run mcp:recover` (or `pwsh -NoProfile -File scripts/mcp-recover.ps1`). This:
   - Removes Chrome's stale `Singleton{Lock,Cookie,Socket}` lock files tied to MCP profiles
   - Sets force-clean-start env vars for the next Playwright launch validation
2. **Restart Claude Code/Codex** (Ctrl+C, then re-launch). The MCP node process is owned by the client and is only respawned on a fresh client start.
3. The first browser-automation tool call after restart spawns a fresh chrome against the cleaned profile dir.

**Why no recovery without client restart:** Claude Code/Codex owns the MCP node process lifecycle. `claude mcp` subcommands (add/remove/list/get) are for configuration only — there is no `restart` or `reconnect` subcommand. Killing the MCP node process externally does not trigger a respawn; the tool catalog is built at startup and is not refreshed mid-session. The 30-second recovery path is the floor.

**Multi-session caveat:** If multiple Claude Code/Codex/subagent sessions share the machine, each has its own MCP node process and session-scoped browser profile. `npm run mcp:recover` cleans shared stale Chrome state, but the client restart is per-session, not global.

## Delegated Team Pattern
- Prefer end-to-end seam owners for substantial work: each worker should diagnose, edit, run focused verification, and return changed paths plus risks.
- Workers do not all need isolated product seams. It is valid to build a small team with distinct roles such as implementer, adversarial reviewer, visual designer, test author, documentation mapper, or release/checkpoint planner.
- Overlapping read scope is fine. Overlapping write scope needs an explicit lead, a file owner, or a serial handoff so patches do not trample each other.
- Before the main lane stabilizes or commits a high-risk file, verify no worker is still running with write scope over that file. Pause or cancel the worker before local edits continue.
- Main Codex lane should coordinate, answer worker blockers, review returned diffs, rerun acceptance checks, and synthesize the final decision.

### Worker Prompt Boundary

**Role distinction.** Workers assigned to "diagnose-and-report" must not edit any source files — return the finding with a path reference. Workers assigned to "diagnose-and-fix" must stay inside the explicitly scoped seam; they do not gain license to fix adjacent surface bugs they discover in passing.

**Off-limits write surface (all require explicit lead approval to touch):**
- CSS mobile cascade — `css/journey_active.css`, `css/journey_steps.css`, `css/strands.css`, `css/progressive_disclosure.css`, `css/mobile_premium_*.css`
- Journey/UI state writers — `js/modules/journey.js`, `js/modules/lifecycle.js`, `js/modules/ui-renderers.js`
- App shell — `js/modules/app.js`, `js/state.js`
- Focus stage — `js/modules/focus-pocket.js`, `js/modules/journey-compass-state.js`
- Deploy scripts — `deploy.sh`, `deploy.ps1`
- **Exception:** During active migration phases, these files may be touched with explicit lead approval to port logic to `src/`.

**Routing cross-seam findings.** When a worker identifies a bug or fix opportunity outside its seam: stop, document the finding with path and line range, and return `Finds outside scope: <path> — <description>` to the main lane instead of editing the off-seam file. This prevents silent cross-seam corruption and preserves the lead's review gate.

## Svelte + TypeScript Migration Scaffold

The Svelte migration lives under `src/`. Vite root is set to `src/` so `npm run dev:svelte` serves the new app directly at `http://localhost:5173/`.

### Quick Commands
```bash
npm run dev:svelte   # vite dev server on port 5173
npm run build:svelte # vite build to dist/svelte/
npm run check        # svelte-check + tsc
```

### Scaffold Layout
| Path | Role |
|---|---|
| `src/index.html` | Vite entry (root: src/), has all body data-attrs for CSS coexistence |
| `src/main.ts` | App mount, URL param init (?demo=force, ?nodemo=1) |
| `src/App.svelte` | Root component, composes all skeletons, syncs body data-attrs |
| `src/lib/stores/` | 12 typed Svelte stores replacing state.js slices |
| `src/lib/types/` | Full TS types (state.ts, business.ts, webgl.ts, events.ts) — no `any` |
| `src/lib/z-index.ts` | Managed `Z_LAYERS` constant — single source for all z-index values |
| `src/lib/css/z-layers.css` | CSS custom properties mirroring z-index.ts |
| `src/lib/utils/strand-continuity.ts` | Bug-fixed strand continuity with Map-based timer tracking |
| `src/lib/engine/` | Imperative bridge to legacy Three.js engine (dynamic imports) |
| `src/components/` | Svelte component directory |

### Component Status (`src/components/`)
Verified files on disk: 21 components. `JourneyCanvas.svelte` is retired/deleted and not included below.
| File | Status | Lines | Ported from | Notes |
|---|---|---|---|---|
| `Canvas.svelte` | **Complete** | 130 | `three-engine.js` + `camera-controls.js` | Creates engine bridge, manages lifecycle |
| `CompassRail.svelte` | **Complete** | 186 | `journey-compass-state.js`, `journey-compass-controller.js` | Full compass step rendering with animation SM |
| `Controls.svelte` | **Complete** | 146 | — | Zoom, auto-rotate, reset, debug overlay |
| `DemoChoreography.svelte` | **Complete** | 169 | `micro-demo.js` | Full demo orchestration with store-based SM |
| `Filters.svelte` | **Complete** | 275 | `filter-state.js` | Status/signal/city filters, clear, count badge |
| `FocusCard.svelte` | **Complete** | 373 | `journey-selected-card.js`, `ui-renderers.js` | Full business detail card with all contract IDs |
| `FocusPocket.svelte` | **Complete** | 117 | `focus-pocket.js` | Self-populating constellation via applyLocalNeighborhoodFocus; renders pocket nodes + anchor indicator |
| `Header.svelte` | **Complete** | 229 | `bindings/mode.js`, `ui-renderers.js` | Mode chips, app title, mode descriptions |
| `InfoPanel.svelte` | **Complete** | 764 | `journey-selected-card.js`, `ui-renderers.js` | Single-track (src/ only); full info panel with all contract DOM IDs |
| `JourneyChrome.svelte` | **Complete** | 780 | `journey-focus-ui.js`, `journey-compass-state.js`, `journey-compass-controller.js` | Full compass header, breadcrumb, trail controls, neighbor rail; rendered with `visible={false}` in App.svelte (gated by legacy shell) |
| `LegacyCompassSurface.svelte` | **Complete** | 333 | `journey-compass-controller.js`, `semantic-dive-ui.js` | Legacy-compatible journey compass and focus-dive DOM IDs rendered in Svelte |
| `Legend.svelte` | **Complete** | 196 | `legend-ui.js` | Cluster legend with color swatches, toggle |
| `LoadingOverlay.svelte` | **Complete** | 214 | `loading-ui.js` | Phase chips, progress bar, fade transition |
| `MapSummary.svelte` | **Complete** | 170 | `journey-route-trace.js`, `journey-neighborhood.js` | Mini-map trail with SVG rendering |
| `ModeChips.svelte` | **Complete** | 134 | `bindings/mode.js` | Mode selection buttons with descriptions |
| `SearchBar.svelte` | **Complete** | 82 | — | Composes SearchInput + SearchResults |
| `SearchInput.svelte` | **Complete** | 323 | `search-state.js` | Input with debounce, clear, keyboard handling |
| `SearchResults.svelte` | **Complete** | 516 | `search-results-ui.js` | Results list, empty state, pagination |
| `SemanticOverlay.svelte` | **Complete** | 148 | `journey-semantic-overlay.js`, `three-interaction-visuals.js` | Manifold/lens visibility + WebGL delegation |
| `ThreadInspector.svelte` | **Complete** | 181 | `thread-inspector.js` | Overlay UI with WebGL line integration |
| `WeatherWidget.svelte` | **Complete** | 177 | `weather-widget.js` | Weather fetch, display, icons, forecast |

### Dev Server Behavior
With `root: 'src'` in vite.config.ts:
- `http://localhost:5173/` serves `src/index.html` (Svelte app)
- `/main.ts` resolves to `src/main.ts` (relative to root)
- The old root `index.html` (case study redirect) is untouched
- `/api/*` proxies to `127.0.0.1:8795` for PHP backend coexistence
- Production builds use `npm run build` / `npm run build:svelte` and write the canonical app shell to `dist/svelte/index.html`; deploy scripts publish that file as both `/semantic-demo/index.html` and the legacy `/semantic-demo/vector-explorer-polished.html` URL.

### Z-Index Layer Architecture
All z-index values flow from `src/lib/z-index.ts` -> `src/lib/css/z-layers.css` -> `src/index.html` inline `<style>`. Do NOT hardcode z-index values in component `<style>` blocks — always use `var(--z-*)`.

### Key Migration Principles
1. **Stores replace state.js slices** — stores are the single source of truth for UI state. Legacy code reads `window.__semanticState` via bridge.ts.
2. **Skeleton components are migration targets** — each `.svelte` component has a TODO block at the top listing the legacy JS files to port.
3. **Imperative-only bridge** — `@lib/engine/bridge.ts` calls legacy functions directly. No reactive state, no Three.js types in the bridge.
4. **CSS coexistence** — body `data-*` attributes are synced from stores via `$effect()` blocks in `App.svelte`, enabling legacy CSS to style Svelte components during phased migration.
5. **Bugs fixed in transit** — known bugs are resolved as code is ported to Svelte/TS, not patched in-place in the legacy tree.
6. **The src/ Svelte track is canonical.** The legacy islands track (`selected-details-svelte-island`, `search-results-svelte-island`, `island-mount-helper`) was deleted in the m3 sweep on 2026-06-07. All rendering now flows through `src/components/`.
7. **Production entry is Svelte/Vite.** Do not restore `js/modules/app.ts` or `dist/bundle.js` as the production path unless intentionally doing a legacy rollback; use `build:legacy` only for reference/rollback work.

### Bugsweep Findings (fix during migration, not separately)
**JS HIGH:** ~~strand-continuity timer-ID drop (verified fixed via `_trackedTextures` + `disposeTextures()`); three-interaction-visuals un-cleaned listeners (verified partially fixed at lines 168-177; three-lifecycle worker to dispose `anchorBloomLight` in same module); state.js Proxy bypass (confirmed at state.js:460-497 sub-object mutation gap; state-proxy worker fixing nested-Proxy return from `get()`); three-node-manager texture leak (verified fixed via `_trackedTextures` + `disposeTextures()`).~~ **RESOLVED:** all 4 items fixed — strand-continuity Map-based, three-interaction-visuals fully disposed, state.js nested Proxy at state.js:530-531, three-node-manager textures tracked.
**JS MEDIUM:** micro-demo skip-guard (open — no verified finding in slice-2); journey-thread-settler race (fixed: dual-timer-pool unified onto strand-continuity's `_timers` Map — see `docs/semantic-demo-bugsweep-2026-06-05.md` for fix wave details); search-state tokenization edge case (open — no verified finding in slice-2).
**CSS HIGH:** focus-dive.css dead journey-chip block (RESOLVED — class does not exist anywhere in repo as of 2026-06-05 sweep; stale reference removed); narrow.css escape-hatch scope leak (fixed: css-fixes worker added ≤360px escape-hatch block).
**CSS MEDIUM/LOW:** tracked in `docs/semantic-demo-bugsweep-2026-06-05.md` (4 medium, 4 low CSS).
**Constellation sweep (2026-06-06):** 1 HIGH (focus-pocket.js:202 missing return — fixed in separate commit), 2 MEDIUM (focus-pocket.js:88,93,99 state writes without withStateMutation; three-search-animations.js:126,135,137 Math.random() breaks determinism), 3 LOW (dead code, non-navState writes, lens dispose without explicit call).

### Scaffold Status
- Dev server runs: `npm run dev:svelte` → `https://localhost:5173/`
- `svelte-check`: 0 errors in `src/` code (50 errors are all in legacy `js/modules/*.ts` — out of scope for scaffold)
- **Islands track:** 12/12 complete (all `js/modules/components/` mounted via helpers)
- **src/ scaffold:** 21/21 complete
- **Stores+types+orchestration:** 12/12 stores, 4/4 types, 4/4 orchestration, engine/bridge.ts 1212 lines
- **Architecture state:** InfoPanel is single-track (src/ only — 767L). The legacy islands (`selected-details-svelte-island.{ts,js}`, `search-results-svelte-island.{ts,js}`, `island-mount-helper.{ts,js}`) are 100% orphan (zero live references) and were deleted in the m3 sweep on 2026-06-07
- `docs/migration-plan.md` — being written by migration-architect worker
