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
- For structural code pattern searches in this repo, prefer the ast-grep tools (`ast_grep_search`, `ast_grep_replace`, `ast_dump`) over `rg`/Bash. ast-grep is structural (TS/TSX/Svelte-aware) and matches the BOTH-pattern codebase much better than text-grep. Three installed skills: `ast-grep` (pattern syntax, metavars, gotchas), `ast-grep-decision-tree` (when to use ast-grep vs `rg` vs `ctx_execute` vs LSP), `write-ast-grep-rule` (custom YAML rules). Common gotchas: metavars (`$X`) don't work inside string literals — use literal path strings; bare identifier patterns trigger "Multiple AST nodes are detected" — wrap in a call/import structure (e.g., `foo($X)` or `import $X from "..."`); check metavar captures appear under each match line. Example patterns that work: `syncFocusStage($$$ARGS)` for call sites, `import { $NAMES } from $PATH` for named imports, `function $NAME($$$) { $$$ }` for declarations. Fall back to `rg` only for: partial string matches, comments, URLs, or after one simplified ast-grep retry returns zero. See `~/.pi/agent/skills/ast-grep-decision-tree/SKILL.md` for tool routing.
- For external/community research (library version quirks, bundler config gotchas, known bugs), use the `websearch` MCP server (5 tools: `websearch_web_search`, `websearch_web_fetch`, `websearch_content_search`, `websearch_company_search`, `websearch_web_search_status`). Connect via `mcp({connect: "websearch"})` if not already connected. Tavily is the most reliable backend; Exa may 402 on credit limits. Search aggressively and early — don't burn cycles reinventing what the community already documented. Query pattern: `"<library> <version> <exact symptom>"` (e.g., `vite three.js webgpu build pulls in three.core.js`). Cross-reference web answers against local code before applying.

## Parallel Session Serial Gate

When multiple Pi / Codex / subagent sessions share this repo, a parallel session worker may continuously commit to `master` while the main lane performs reads and edits. This creates race conditions, phantom diffs, and overwritten work.

### Rule

1. Before any non-trivial `git commit` or `git push`, run:

   ```bash
   git log --since="3 hours ago" --oneline
   git status --short
   ```

2. If 5+ unseen commits exist since your last verified `HEAD` → **queue work but DO NOT commit** until the parallel stream quiesces.
3. If `git status --short` shows tracked-file modifications that you did not create → **pause and pick a different seam**.
4. Only commit after `git log` stabilizes (no new commits in ~60 seconds) AND your working tree matches intended changes.

### Why

The wave-absorption pattern (parallel session closing tickets faster than main lane reads) creates stale-HEAD commits. The serial gate prevents the main lane from landing on outdated ground truth.

## Subagent Throughput Doctrine

**We use subagents aggressively — for throughput AND quality, not just speed.** Default to decomposition: any meaningful work should be sliced and dispatched in parallel unless it is quick enough, safe enough, and cheap enough to do in-lane. The main lane coordinates, verifies, and synthesizes; subagents do the focused work.

**Subagents increase quality, not just speed:**

- Isolated scope prevents cross-seam drift (worker can't see the rest of the codebase to drift into)
- Forced evidence (worker writes reports to `tmp/`, main lane reviews the diff + reruns checks)
- Parallel investigation (multiple hypotheses in flight at once beats serial "tried it, didn't work, try next")
- Focused context (a 50K-token worker prompt beats a 500K-token main-lane context for deep dives)

**When to dispatch (project examples):**

- Verification: "run svelte-check + test:unit on the orphan tip in a worktree, report pass/fail counts"
- Investigation: "find the commit that introduced the garbage filenames `'` and `'+s.slice(Math.max(0`"
- Comparison: "diff `fix/seam-X` against master and report which commits are subsumed by W11 work"
- Cleanup: "delete all `safe-snapshot-*` branches that are 0 ahead of master, list what you deleted"
- "Haven't tried" research: "rg src/lib/orchestration/ for Svelte 5 ports that might exist for any W12 pre-emption sweep"

**When to do in-lane:**

- Quick file reads / 1-line edits
- Coordinating, synthesizing, making a decision
- Anything that needs the user's input or context the subagent can't see

**The full subagent pattern (TypeScript template, $0.27–$0.50 per worker, live_steer protocol, prompt boundary rules, followup recovery) lives in the global `AGENTS.md` → "Subagents" section.** This file only carries the project-level doctrine and the project-specific examples above.

**Live steer is the actual mitigation for off-seam drift.** Prompt language is necessary but insufficient. Main lane must poll every 60–90 s during worker execution and steer immediately when drift appears. Cost: a few minutes of attention per worker. Benefit: an order-of-magnitude more throughput and significantly fewer cross-seam regressions.

**Tool surface check before artifact-producing work.** Subagents may not inherit MCP/browser tools depending on the dispatch profile. Have the worker report its exposed tools before it starts writing files; if expected tools (Read/Write/Edit/Bash/Glob/Grep or needed MCP tools) are missing, the worker stops and reports the harness defect instead of improvising with fragile shell writes.

## Worktree Coordination (added 2026-06-15)

**Stale worktrees block T9 (fix/* branch cleanup) and T-style porting work.** This pattern bit W12: 4 parallel-session worktrees had 11+1 uncommitted items, blocking `git worktree remove --force` + `git branch -D` for ~30 minutes.

**The protocol:**

1. **Before any T9 work**, run `git worktree list --porcelain` to see all worktrees + their HEAD.
2. **For each worktree**, run `cd <path> && git status --short | wc -l` to count uncommitted items.
3. **Clean worktrees (0 uncommitted)** are safe to `git worktree remove --force` + `git branch -D` immediately.
4. **Dirty worktrees (uncommitted)** need coordination with the parallel session before removal:
   - If the uncommitted work is real (modified M files), the parallel session needs to commit first.
   - If the uncommitted work is build artifacts (dist/, .svelte-check), the worktree owner can `git checkout HEAD -- <path>` to discard.
   - Untracked files (?? in status) can be deleted with `git worktree remove --force` only if you've verified they're not load-bearing scratch (e.g., vitest.legacy.config.js written by a worker).
5. **Document the partial state** in the next-session-prompt so the next session knows what's left.

**Why:** `git worktree remove` on a dirty worktree fails by default; `--force` discards uncommitted work. Force-remove is destructive. The cost of waiting for the parallel session to land is 5 min; the cost of force-removing a parallel session's WIP is hours of regression hunting.

## Memory Tool Quirk (added 2026-06-15)

**The `memory` tool's `remove` and `replace` actions have a matching quirk.** `old_text` is matched against stored entry text, but:

- **Long old_text (>500 chars) often fails to match** even when the text exists. Try a shorter, unique substring.
- **Trailing HTML comments** like `<!-- created=2026-06-15, last=2026-06-15 -->` in stored entries (added by the memory tool itself for duplicate tracking) are NOT part of the searchable text. Including them in `old_text` causes "No entry matched" errors.
- **Multi-line `old_text` may need exact whitespace**. Trailing newlines or leading spaces break the match.

**The protocol:**

1. For duplicate entries, use a short, unique **first line** as the `old_text` anchor.
2. If that fails, use `replace` with a short unique phrase to mark one duplicate, then `remove` the marked one.
3. If both fail, the audit is on disk (`tmp/memory-triage/AUDIT.md`) and can be re-attempted in a future session.

**Why this matters:** memory is at 99% capacity (50K of 50K chars), so consolidation is required to save new lessons. Tool quirk blocks the obvious path; the protocol above unblocks it.

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
- Paid Mimo and paid DeepSeek worker routes are available for normal delegated work when they fit the slice. When workers exercise a model during meaningful Semantic Explorer work, capture concise model-catalog notes from the actual task outcome rather than running synthetic benchmark chores.

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

Verified files on disk: 26 components. `JourneyCanvas.svelte` is retired/deleted and not included below. The 5 newest (DevGui, FocusPocketA11y, MapView, SpectorInspector, Toast) were added during the W24–W29 migration arc.

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
| `DevGui.svelte` | **Complete** | 198 | `dev-gui.js` | Dev-only WebGL tuning (spector, etc.); tree-shaken from prod |
| `FocusPocketA11y.svelte` | **Complete** | 208 | `focus-pocket.js` | A11y surface listing focus pocket neighbors for screen readers |
| `MapView.svelte` | **Complete** | 365 | `map-state.ts`, `camera-controls.js` | Backdrop-2D map view; still dynamic-imports `@lib/engine/map-state` (W32 T2-A target) |
| `SpectorInspector.svelte` | **Complete** | 355 | `spector` | Dev-only WebGL inspector; tree-shaken from prod |
| `Toast.svelte` | **Complete** | 90 | `toast.js` | Lightweight toast notifications |

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
8. **Bridge files are the canonical seam manifest — do not mass-delete them during active migration.** The `src/lib/engine/*` bridge files define the contract between the reactive Svelte UI and the imperative engine kernel. Bridge files are load-bearing even when they seem under-utilized; removing them risks creating dangling imports (see `scripts/check-bridge-references.mjs`). Inlining and then immediately re-creating bridge files has caused 3+ direction reversals. Keep bridge files stable during a migration wave; only remove a bridge file after (a) all its callers are inlined or repointed, AND (b) the file is verified gone by `npm run check:bridges`.
9. **Do not introduce lazy dynamic imports (`{#await import()}`) in Svelte components during hot refactoring waves.** Vite HMR and Svelte 5 runes make deferred import default-export resolution fragile; runtime `TypeError: Cannot read properties of undefined (reading 'default')` is a common failure mode. If async loading is truly needed, guard it with a fallback UI, verify the component resolves under both `npm run dev:svelte` and `npm run build:svelte`, and land it on a stable branch — not mid-wave.

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
- **src/ scaffold:** 26/26 complete (was 21/21 at charter write; W24–W29 added DevGui, FocusPocketA11y, MapView, SpectorInspector, Toast)
- **Stores+types+orchestration:** 12/12 stores, 4/4 types, 4/4 orchestration, engine/bridge.ts 1212 lines
- **Architecture state:** InfoPanel is single-track (src/ only — 767L). The legacy islands (`selected-details-svelte-island.{ts,js}`, `search-results-svelte-island.{ts,js}`, `island-mount-helper.{ts,js}`) were marked 100% orphan by the m3 sweep on 2026-06-07, deleted in `b8a50ba`, then restored by the `ec520da` revert on 2026-06-12. Per the BOTH pattern below, they are part of the in-flight migration, not confirmed dead
- `docs/migration-plan.md` — being written by migration-architect worker

## Engine Kernel Architecture (replaces old BOTH-pattern section)

**As of Wave 10 W2 (commit `7fc7b9d`, 2026-06-13):** The BOTH-pattern shadows are retired. The `.ts` files in `js/modules/*` are now the **single source of truth** for the engine kernel. The `.js` siblings have been moved to `legacy-reference/js-both-shadows-2026-06-13/` for reference (preserved via `git mv`).

### What lives where

| Layer | Path | Role |
|---|---|---|
| **Svelte UI** | `src/lib/components/*`, `src/lib/stores/*` | Reactive UI shell (Svelte 5 runes) |
| **Svelte bridge** | `src/lib/engine/*` | Imperative wrapper that calls into the engine kernel (12 of 14 files have 0 js/ imports; the rest delegate) |
| **Engine kernel** | `js/modules/*.ts` (125+ files), `js/state.ts`, `js/state/*`, `js/workers/*` | Three.js scene, camera, shaders, instanced meshes, journey, search, weather — the active runtime |
| **Archived shadows** | `legacy-reference/js-both-shadows-2026-06-13/*` | 50 BOTH-pattern `.js` files; reference material only |

### Why this is intentional architecture

The Svelte UI is reactive; the engine kernel is imperative + WebGL-bound. Wrapping one with the other requires an **imperative seam** — the bridge. Calling it "legacy" implied it should be replaced. The W1 audit (`3df8336`) proved otherwise: 38 src/ files import from `js/`, ~80 unique import paths, the entire bridge layer is built on the kernel. **The kernel is not stale coupling; it's the working system.**

The Svelte UI calls into the bridge, which calls into the kernel. This is the same shape as the Svelte → adapter → engine pattern in many production apps. Future "engine port" work (if desired) is a separate multi-week arc, not this project's scope.

### Rule for future "is this dead?" sweeps on `js/`

A file under `js/` is NOT dead if ANY of these hold:

1. It's a `.ts` file in `js/modules/*` (engine kernel — active runtime)
2. It's a `.ts` file in `js/state/*` (state kernel — active runtime)
3. It's a `.js` file in `js/workers/*` (worker kernel — active runtime)
4. It's imported by name in `src/`, `docs/`, `tests/`, or `legacy-reference/` (any reference)
5. It has a commit in the last 60 days

A file under `js/` IS dead and can be removed if:

- No `.ts` sibling (i.e., not a BOTH pattern)
- No imports in `src/`, `docs/`, `tests/`
- No recent commits

### BOTH-pattern history (preserved for reference)

The BOTH pattern was the original migration design:

- `.ts` is the typed source (Vite resolves it first when an import has no extension)
- `.js` is the runtime stub (thin `export * from './X.ts'` re-export)
- The `@legacy/*` path alias pointed to the `.ts` (retired in 9D-Option-B, commit `cbc6509`)
- The `.js` shadows were the only vestigial part after 9D-Option-B; retired in Wave 10 W2 (commit `7fc7b9d`)

**Never repeat the blanket-deleted pattern.** The 2026-06-12 M3 bugsweep H2 was wrong to blanket-call 145 .ts files "dead shadows" based on "zero explicit .ts importers + tsconfig excludes js." Both signals are real but neither is conclusive. Use the 4-signal audit before any future "dead code" sweep on `js/`.

## Pi Tool Output Hygiene

The `pi_background_jobs` tool and the `/jobs`, `/job`, `/kill-job`, `/clear-jobs` slash commands return a **compact summary** (counts + bounded previews + a note), not the raw job record. The full record grows over time and a raw dump floods the chat transcript. The summarize-don't-enumerate fix lives in `C:\Users\HP\.pi\agent\local-packages\pi-background-detach\index.ts`.

**Do not "fix" the summarized output by re-injecting the raw list.** The transcript flood was the original bug. If a more verbose output is genuinely needed for one specific job, query the underlying helpers directly via `node -e` against the package, or extend the `summarizeJob` / `summarizeJobs` previews with explicit fields — never bypass the summarize contract.

`/tail-job <jobId>` and `pi_background_jobs action=tail` stay raw because the user asked for that specific log.

---

## Subagent Friction Patterns (W20-W23 learnings)

This section captures friction patterns observed when dispatching subagents (mimo-v2.5 model on opencode-go) during the W20-W23 cleanup and migration arcs. Apply these guard rails in future subagent prompts.

### 1. mimo-v2.5 file-size degeneration

**Symptom:** Worker stuck in write phase for 10+ min with no progress; `output_tokens: 0` in stream_summary.
**Cause:** Model attempts to generate files >800 lines in a single Write call.
**Fix:** Use Edit tool with small targeted changes, OR split work across multiple files (e.g., separate scaffold per store).
**When to apply:** Any subagent prompt that involves writing >300 line files. Prefer Edit over Write, or split into per-store files.

### 2. `pi_background_jobs` log-reading trap

**Symptom:** Worker stuck in `pi_background_jobs` poll loop, trying to read JSONL log file.
**Cause:** Worker uses `pi_background_jobs action: "poll"` (which is invalid) or loops on log reading.
**Fix:** Steer with explicit instruction: "do NOT use pi_background_jobs to read logs; use bash directly with timeout". Or cancel and manual main-lane commit.
**When to apply:** Any subagent prompt that runs long-running bash commands (>30s).

### 3. Cross-file race conditions

**Symptom:** Multiple workers on same file produce conflicting commits; one succeeds, others fail with rebase conflicts.
**Cause:** Workers dispatched in parallel to modify the same file (e.g., main scaffold).
**Fix:** Decompose work to use SEPARATE files per worker (e.g., state-class-migration-2-viewport, -3-focus, -4-demo instead of appending to -1-main).
**When to apply:** Any parallel subagent dispatch where work could touch the same file.

### 4. Stale audit data

**Symptom:** Worker reports "nothing to do" — work was already done in a previous bug-sweep.
**Cause:** Audit doc referenced state that no longer exists (e.g., 7 dead CSS selectors already deleted 2026-06-06).
**Fix:** Always verify current state with `rg "^export"` or `ls -la` before acting on doc claims. The W20 retrospective lesson "verify before trust" applies here.
**When to apply:** Any subagent prompt based on an audit or doc. Add a pre-flight verification step.

### 5. Parallel session force-push drops commits

**Symptom:** Local commit disappears from `git log` after `git pull --rebase origin master`.
**Cause:** Parallel session rebased and the local commit was dropped.
**Fix:** Recover with `git reflog | grep <sha>` then `git cherry-pick <lost-sha>`. Then `git reset --hard <sha>` to update local branch.
**When to apply:** If a worker reports its commit SHA but `git log` doesn't show it, check reflog.

### 6. Parallel session speed dominance

**Symptom:** Subagent dispatches produce 1 net commit while parallel session lands 10+ in the same window.
**Cause:** Parallel session is actively executing W21/W22/W23 work and beating subagents to commits.
**Fix:** When parallel session is moving fast, decompose into seams that COMPLEMENT (not duplicate) their work. Or step back and let them finish, then verify.
**When to apply:** Check `git log --since="30 minutes ago"` before dispatching — if parallel session is landing commits in the same area, pivot.

### Worker prompt template additions

When dispatching subagents for parallel work, prepend these lines:

```
BEFORE EACH WORK:
- Verify tool surface (Read/Write/Edit/Bash/Grep)
- Verify target file is CLEAN (not M-flagged via `git status --short`)
- Verify pre-flight data (rg/ls/cat the source before editing)

AFTER EACH WORK:
- Commit with `--only pathspec` to avoid parallel session WIP
- Push to origin
- Report: pre-flight results + commit SHA + push result + any surprises

NEVER:
- Use `pi_background_jobs action: "poll"` (invalid)
- Write a single file >800 lines (model degeneration)
- Modify the same file as another active worker (race condition)
```

## W15+ Arc Lessons (parity-attrs closure, 2026-06-17)

This section captures patterns and helpers added during the W15 deeper parity-attrs arc closure. The arc shipped 13 commits, 113 tests, 2 mirror helpers, and 1 CI lint check. Key references:

- `docs/nav-state-ownership.md` — field-by-field ownership map for the 35+ NavState fields
- `docs/svelte-5-strict-mode-cookbook.md` — the canonical `!==` → `===` inversion bug cookbook
- `docs/latent-!==-bug-sweep-2026-06-17.md` — audit of 167 `!==` usages (38 RISKY + fixed)
- `docs/production-preview-parity-baseline-2026-06-17.md` — dev-mode vs production preview parity baseline
- `docs/svelte-5-strict-mode-bug-upstream-report-2026-06-17.md` — paste-ready Svelte GitHub issue
- `notes/w15-arc-session-closeout-2026-06-17.md` — full session timeline + open seams

### Dual-store mirror discipline

Nav state lives in TWO places:

1. **Svelte writable** (`_navWritable`) at `src/lib/stores/navigation.svelte.ts` — the reactive store Svelte components subscribe to
2. **Svelte 5 class** (`appState.navState`) at `src/lib/state/app.svelte.ts` — the legacy class read by `journeyStore`, `compass-state.ts`, and the engine kernel

The canonical helper `writeNavStateMirror(patch: Partial<NavState>)` writes to BOTH stores. Every direct mutation of `appState.navState.X = ...` outside the helper is a smell flagged by `npm run lint:nav-mirror`.

For focus-pocket fields (`focusPocketIndices`, `focusPocketRoleByIndex`, `focusPocketMeta`), use `writeFocusPocketMirror(patch)` which wraps `withFocusNotify` and syncs via the existing bridge.

### Svelte 5 strict-mode `!==` bug

Rune-mode `.svelte` and `.svelte.ts` files have a compiler bug: `!==` is compiled to `$.strict_equals(a, b, false)` (which is `===`), silently inverting the comparison. NO warning at compile time or runtime.

**Three workaround patterns:**

1. `typeof x === 'number'` guards (safest for type checks)
2. Positive equality + `!` prefix: `!(x === 'idle')` instead of `x !== 'idle'`
3. Loose `!=` for null/undefined checks (limited applicability)

**Rule of thumb**: any new `.svelte` or `.svelte.ts` file should use one of these patterns instead of raw `!==`. Add a `// audit-ok:` comment if the usage is provably safe (plain function, non-reactive context).

**CI guard**: `npm run lint:svelte5-strict-mode` (added 2026-06-17) flags risky `!==` usages.

### Subagent model selection (W15+ learnings)

| Model | Status | When to use |
|-------|--------|-------------|
| `opencode-go/mimo-v2.5` (paid) | Reliable | Multi-step research, test authoring, doc authoring, refactor migrations |
| `openrouter/owl-alpha` | Unreliable | Bounces on file-content iteration, Playwright selector errors, timeouts mid-write. Avoid. |
| `kilo/openrouter/owl-alpha` | Unreliable | Same issues as owl-alpha + Kilo rate limits |

**Pattern**: mimo-v2.5 (paid) is the only model that consistently delivers. Budget ~$0.0003-0.001 per worker task.

### Production preview verification

For any body data-attr or visual regression work, verify against BOTH dev mode (Vite 5175) and production preview (Vite preview 4174):

```bash
# Start production preview
nohup npx vite preview --config vite.config.ts --port 4174 --host 127.0.0.1 &

# Verify body data-attrs via Playwright MCP
TEST_BASE_URL=http://127.0.0.1:4174 npx playwright test tests/integration/w15-body-attr-live-probe.spec.js --browser=chromium --timeout=60000
```

Production preview catches bundle-level bugs that dev mode misses (e.g. the pre-bundled `panel-bindings-*.js` issue that caused the original W15 deeper gap).
