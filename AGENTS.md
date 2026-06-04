# Agents - Semantic Explorer

## Project Overview
3D semantic mycelium visualization for exploring Montgomery County TX business relationships.

## Dev Environment Hardening
- **Static Dev Mode**: The app includes a JS-side fallback for static Python development servers. If `api.php` returns raw PHP source code, the `detectStaticDevPHP` utility triggers a mock healthy state and provides high-synergy search results.
- **Hardware Resilience**: GPU textures and event listeners are tracked and explicitly disposed of in `three-setup.js` and `event-bindings.js` to prevent leaks during rapid development cycles.

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
| `js/modules/journey-canvas-interaction.js` | Canvas node hit testing, hover state, pointer bindings, and canvas-to-thread handoff |
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
| `js/modules/journey-compass-state.js` | Journey compass state machine and action synthesis |
| `js/modules/loading-ui.js` | Loading overlay, phases, deferred hydration |

## Demo Spec
- **MICRO-DEMO-SPEC.md** - camera choreography, timing, node selection for `micro-demo.js` (living spec)

`micro-demo.js` is the sole demo entry point; it owns both the first-visit eligibility guard and the choreography. `app.js` imports it for the launch path.

## 3D Network Framing
The 8,406-point mycelium data lives in `state.rawPositionsBuffer` (Float32Array) in `[0,1]³` unit-cube space (UMAP/PCA projection). `getPointBoundsCenter(points, positionBuffer)` in `js/modules/three-node-manager.js:103` is the canonical bounds reader. It must be called with the raw buffer, not just the points array (the data objects don't carry x/y/z). With the buffer, `state.overviewBounds.renderCenterOffset` correctly centers the network on origin, and `MYCELIUM_FIELD_SCALE = (3.2, 2.6, 3.7)` scales it to fill the camera frustum. Bug history: prior to the fix, the call site passed only `state.points`, so `getPointBoundsCenter` saw count=0 and the network sat at its raw (0.5, 0.5, 0.5) centroid scaled up — visible as the network in the upper-right of the canvas. Always pass the buffer to bounds readers.

## State Machine Reference

### micro-demo.js (`js/modules/micro-demo.js`)
```
IDLE -> GLIDING -> ARRIVED -> CARD_VISIBLE -> PULLBACK -> WIDE_VIEW -> RETURNING -> COMPLETE
                                                                          |
                                                                          v
                                                                     CANCELLED
```
Phase timing targets: GLIDING 1400ms, ARRIVED immediate, CARD_VISIBLE 1800ms hold, PULLBACK 1200ms, RETURNING 1000ms.

### journey-compass-state.js (`js/modules/journey-compass-state.js`)
```
idle -> checking -> synthesizing -> active
                |
                v
           interrupted -> idle
```
Driven by `data-panel-surface` and `data-journey-phase` body attributes. Composes actions from journey, search-state, and lifecycle modules.

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
npm run build         # esbuild bundle to dist/bundle.js
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

## UI Critic Operating Contract
- Diagnose before editing: identify the owning surface, winning selector/state writer, and whether transitions, inline style, `!important`, media queries, or late imports control the bug.
- For every UI fix, capture failing geometry before and passing geometry after; include overlap, clipping, stale hidden-layout elements, z-index/occlusion, and visible screenshot/snapshot evidence when composition matters.
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
- CSS is split into ordered modules in `css/`; `semantic-demo.css` is an import manifest, while the `css/mobile_premium__*.css` files are loaded directly by `vector-explorer-polished.html`.
- Do not move the app root until `deploy.sh` and `deploy.ps1` no longer depend on the sibling `../js/scanner.js` path.
- **CSS state ownership**: Use `docs/semantic-demo-mobile-state-ownership.md` and `docs/semantic-demo-css-ownership-map.md` to trace which `data-*` attribute and CSS module owns a visual surface before editing.
- **No `!important` in CSS**: Every `!important` is a signal of unresolved specificity conflict. Surface-level `!important` declarations are documented in `docs/semantic-demo-css-ownership-next-pass.md`.

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

**Routing cross-seam findings.** When a worker identifies a bug or fix opportunity outside its seam: stop, document the finding with path and line range, and return `Finds outside scope: <path> — <description>` to the main lane instead of editing the off-seam file. This prevents silent cross-seam corruption and preserves the lead's review gate.
