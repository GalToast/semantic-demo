# Svelte Build Visual QA — 2026-06-13

**Target:** `npm run dev:svelte` at `http://localhost:5173/`
**Browser:** Playwright MCP headed (Chromium)
**Headed:** yes
**Screenshots:** `qa-screenshots/01–06-*.png`
**Coverage:** desktop-idle, mobile-idle, search-mode. NOT covered: launch-focus, focus-pocket, field-node, info-panel-populated, info-panel-empty, compass-rail, filters, mode-grid, thread-inspector, controls, loading-overlay, map-trail, global-spacing (see "Open surfaces" at end).

---

## TL;DR

The 3D mycelium **does render** (8,406 points, 538k triangles, 15k lines, ~60 fps on desktop). UI chrome is mostly in place. Search works end-to-end. But the visual QA pass surfaced **4 real bugs** the contract tests don't catch:

1. **🔴 CRITICAL — WebGL canvas does NOT resize on viewport change.** The renderer, drawing buffer, and CSS client size all stay at 1440×900 no matter what the window is. Mobile is broken.
2. **🟠 HIGH — Welcome/tour card persists in search mode** and after demo completion. The "OVERVIEW | MONTGOMERY COUNTY / The MoCo Mycelium / STEP INSIDE / MAP" card sits on top of search results.
3. **🟡 MEDIUM — `initJourneySelectedCard` is a stub** in the Svelte bridge. Logged as a console warning on every load. Likely means the journey selected card is not initialized on the Svelte track.
4. **🟡 MEDIUM — Demo state machine throws on dismiss-after-complete** ("Invalid transition: COMPLETE → CANCELLED"). Clicking × on a finished demo logs a state-machine warning.

---

## What's working (verified)

| Surface | Result | Evidence |
|---|---|---|
| Page title | ✅ "Semantic Explorer \| MoCo Business Mycelium" | `document.title` |
| Body data-attrs sync | ✅ All 30+ expected `data-*` attrs set | `bodyDataView: galaxy`, `demoPhase: IDLE`, `navMode: search`, etc. |
| Data load | ✅ 8,406 business records | Console: `data-loader] Loaded 8,406 business records, 8,406 with lead IDs` |
| WebGL render loop | ✅ Running, ~60 fps on desktop | `rendererFrame: 210` after 2s idle |
| 3D scene content | ✅ 8,406 points + 538,944 triangles + 15,019 lines per frame | `renderer.info.render` |
| Search query | ✅ "coffee" → 17 results (10 shown, 7 behind) | DOM: `searchStatus: results`, 12 result options |
| Mode chips | ✅ All 6 modes (M/S/T/F/I/G) clickable, radio states toggle | snapshot + click on "S Search" → `bodyDataNavMode: search` |
| Category legend | ✅ 15 categories with counts, color-coded dots | snapshot |
| Camera controls | ✅ Toolbar visible (zoom in/out, reset, auto-rotate, share) | snapshot |
| Weather widget | ✅ 71°, wind icon, clickable | snapshot |
| Bridge globals | ✅ `__semanticEngine`, `__LEGACY_APP_STATE__`, `__APP_STATE__`, `__APP_ACTIONS__`, `__TEST_STATE__` all present | introspection |
| Console errors | ✅ 0 errors | console_messages |
| Screenshot capture | ✅ Working with absolute paths | `qa-screenshots/01-06-*.png` saved |

---

## Bug 1 — 🔴 CRITICAL: WebGL canvas does not resize

**Reproduction:** `playwright_browser_resize` from 1440×900 → 390×844.

**Expected:** `renderer.getSize()` returns 390×844, canvas client size = 390×844, mycelium reframes to portrait aspect.

**Actual:**
```
rendererSize:           { w: 1440, h: 900 }
rendererDrawingBuffer:  { w: 1440, h: 900 }
canvasSize:             { w: 1440, h: 900 }     (internal)
canvasClientSize:       { w: 1440, h: 900 }     (CSS)
rendererAspect:         1.6
viewportAspect:         0.462
```

**Visual result:** The 3D mycelium is squished into the lower-right corner of a 390-wide viewport, with most of the canvas black. Screenshot: `qa-screenshots/05-mobile-idle-390x844.png`. Even worse, the legend and other UI elements overflow on top.

**Likely cause:** `bridge.resize(w, h)` in `Canvas.svelte`'s `$effect` is not being called when the viewport store updates. The `initViewportListeners` from `@lib/stores/viewport` may be wired to the legacy resize path, not the bridge. The legacy `scene-reveal.ts` has an `onWindowResize()` that calls `renderer.setSize()` but the bridge has its own path that takes precedence.

**Bridge init order in `lifecycle-bridge.ts` (lines 165-178):**
```ts
// 5. Ensure the live renderer canvas fills its container
if (ctx._state?.renderer?.domElement) {
  const liveCanvas = ctx._state.renderer.domElement;
  liveCanvas.style.width = '100%';
  liveCanvas.style.height = '100%';
  liveCanvas.style.display = 'block';
}
```
This sets CSS to 100% but the renderer.setSize() is never called. The `$effect` in `Canvas.svelte` IS supposed to call `bridge.resize(w, h)` but evidently does not.

**Fix sketch:** Either (a) wire the viewport store's reactivity to the bridge resize call, or (b) call `renderer.setSize()` directly in the bridge after the live canvas is set up. Compare against the legacy `scene-reveal.ts:onWindowResize()` which uses `getViewportSize()` and properly calls `renderer.setSize(width, height)`.

---

## Bug 2 — 🟠 HIGH: Welcome/tour card persists in search mode

**Reproduction:** Load page → click "S Search" mode chip → type "coffee" in the search input.

**Expected:** The center "OVERVIEW | MONTGOMERY COUNTY / The MoCo Mycelium / STEP INSIDE / MAP" welcome card disappears; only the search panel + mycelium remain.

**Actual:** The welcome card sits next to the search results panel, occupying the right half of the canvas. Screenshot: `qa-screenshots/06-search-mode-coffee.png`.

**DOM evidence:** The card is a separate Svelte snippet rendered independently of the panel-surface data-attr. It doesn't read `data-panel-surface === "search"` to hide itself.

**Related:** The "1. overview / 2. search / 3. focus / 4. inside / 5. map" demo step list is also still rendered after the demo completes (the `data-demo-phase: COMPLETE` state doesn't remove the visual).

**Likely cause:** The welcome card is mounted unconditionally in `App.svelte` (no surface gating) and the demo step list is in a separate component that doesn't listen to `data-demo-phase`.

---

## Bug 3 — 🟡 MEDIUM: `initJourneySelectedCard` is a stub

**Reproduction:** Every page load logs:
```
[WARNING] [journey] Stub function hit: initJourneySelectedCard @ diagnostic-adapter.ts:16
```

**Impact:** The journey selected card (the focused business card that appears when you focus on a node) is not initialized. When the user actually focuses a node, the card may not render correctly.

**Location:** `js/modules/diagnostic-adapter.ts:16` (the stub logger) and the call site in `lifecycle-bridge.ts` (likely step 7 of init — canvas interaction binding — or a follow-up call).

**Suggested fix:** Find the Svelte track's journey selected card initialization (likely a function in `src/lib/orchestration/...` or `src/lib/components/JourneyChrome.svelte`) and wire it to the bridge's init flow.

---

## Bug 4 — 🟡 MEDIUM: Demo state machine throws on dismiss-after-complete

**Reproduction:** Load page (demo runs to COMPLETE state) → click the × dismiss button on the demo overlay.

**Console:**
```
[WARNING] [Demo] Invalid transition: COMPLETE → CANCELLED @ diagnostic-adapter.ts:16
```

**Impact:** Cosmetic. The dismiss action is a no-op when the demo is already complete, but it logs a state machine warning. The demo overlay remains visible.

**Fix sketch:** In `DemoChoreography.svelte`'s dismiss handler, check `isDemoCancelled()` or current phase before dispatching CANCELLED. If the demo is already in a terminal state, just hide the visual.

---

## Visual observations (not necessarily bugs)

### Mycelium composition
- The 8,406 points cluster in the lower-2/3 of the canvas, with a notable empty band at the top.
- This is a known pattern from the project: the upper area is reserved for the welcome card / search results overlay. But on idle (no overlay), the network feels "headless" — too much black space at top.
- The bounding box of the mycelium spans roughly x=300-1000, y=200-880 in screen space. Not centered, but the offset is intentional for the search/info panel on the right.

### Mobile UI (390×844 viewport)
- **Category legend**: ~50% of viewport width; each row is wide. Should be a compact drawer at mobile width.
- **Mode chips**: 6 chips don't fit; "I Inside" and "G Map" are cut off. Need horizontal scroll or a "more" menu.
- **Header title**: "Semantic Explorer" truncates to "Semantic Explor..." — needs to either wrap or be hidden.
- **Search panel header**: "SEARCH" truncates to "ARCH" because the search input overlaps the label. Visual collision.

### State machine behavior
- The `?view=galaxy` URL param sets `data-active-view: galaxy` AND the legacy `state.currentView = galaxy`. ✓ consistent
- The `?nodemo=1` URL param sets `data-demo-phase: IDLE` (suppresses demo) but the welcome card and demo step list still render. (See Bug 2.)
- Direct mutation of `_state.currentView` from the console throws "Illegal direct mutation of critical property 'currentView'. You must use withStateMutation()". This is the production guard from `_makeProdProxy` working as designed. (Confirmed: `state.js:533` in the stack trace.)

### Pixel sampling gotcha
- I initially got (0,0,0,0) pixel reads from the WebGL canvas via both `gl.readPixels` and `drawImage`. This is because `preserveDrawingBuffer: false` — the drawing buffer is cleared right after compositing.
- `page.screenshot()` works fine because it captures the composited output, not the WebGL buffer.
- This is a useful gotcha for any future visual regression work: don't rely on WebGL readback to verify the canvas is rendering. Use `page.screenshot()` or a Playwright `toMatchSnapshot()` with the right viewport.

---

## Open surfaces (not yet walked)

The original surface list had 17 named surfaces. I covered:
- ✅ desktop-idle (screenshot 04)
- ✅ mobile-idle (screenshot 05) — found the resize bug
- ✅ search-mode (screenshot 06) — works
- ⏭ launch-focus, focus-pocket, field-node, info-panel-populated, info-panel-empty, compass-rail, filters, mode-grid, thread-inspector, controls (detailed), loading-overlay, map-trail, global-spacing

These can be picked up in a follow-up pass. The two highest-leverage ones based on the open issues in `AGENTS.md`:
- **focus-pocket** (the constellation animation — known complex, recent m3 sweep found a missing return bug)
- **field-node** (canvas picking + hover — the resize bug likely affects this too)

---

## Recommendations

**Priority 1 (block release):** Fix Bug 1 (canvas resize). Mobile is unusable otherwise.

**Priority 2 (should fix before mobile release):** Mobile UI overflow (mode chips, legend, header truncation).

**Priority 3 (cleanup before next QA wave):** Bug 2 (welcome card gating) and Bug 4 (demo dismiss-after-complete).

**Priority 4 (follow-up):** Bug 3 (journey selected card stub) — track down the Svelte track's init and wire it.

**Investigation flag:** The `?nodemo=1` URL param sets `data-demo-phase: IDLE` but doesn't actually prevent the visual demo from rendering. Check whether the `noDemo` prop on `DemoChoreography.svelte` is wired correctly.

---

## Screenshot index

| File | What it shows |
|---|---|
| `qa-screenshots/01-desktop-idle.png` | First load, demo overlay center |
| `qa-screenshots/02-desktop-idle-demo-dismissed.png` | After clicking ×, demo still visible |
| `qa-screenshots/03-canvas-investigation.png` | After forcing renders — mycelium visible (off-center early, settled by frame 5) |
| `qa-screenshots/04-clean-idle-desktop.png` | With `?nodemo=1` URL param, clean idle state |
| `qa-screenshots/05-mobile-idle-390x844.png` | **Bug 1 evidence** — canvas stuck at 1440×900, mycelium squished |
| `qa-screenshots/06-search-mode-coffee.png` | **Bug 2 evidence** — search works, welcome card persists |

---

## Side observations on the harness / tooling

- `background: true` in the bash tool did work — the foreground stream was closed ("Command aborted") but the vite child process kept running on PID 19828. The misleading message is a harness quirk, not a kill signal.
- Ctrl+B behavior: I don't have a definitive answer. The vi harness's local docs at `C:\Users\HP\AppData\Roaming\npm\node_modules\@earendil-works\pi-coding-agent\docs\keybindings.md` would have the source of truth. Suggest checking that as a follow-up.
- Playwright MCP screenshots with relative paths go to the MCP's own cwd; absolute paths work cleanly to the repo.
