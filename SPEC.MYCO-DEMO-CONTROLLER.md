> **Superseded:** The micro-demo choreography is now specified in `MICRO-DEMO-SPEC.md` (living spec). `demo-controller.js` still implements the trigger/state-machine logic described here, but `micro-demo.js` owns the choreography. Both specs are maintained; this file is kept for historical reference.

# MoCo Mycelium Micro-Demo - Trigger & State Management Specification

## 1. First-Visit Detection

### Storage Schema

```js
// localStorage key
'moco_mycelium_demo_v1'

// Stored value (JSON)
{
  "seen": true,
  "seenAt": 1715567600000,        // Unix ms timestamp — first visit ever
  "sessionCount": 3,              // How many sessions across this browser
  "lastSeenAt": 1715654400000     // Timestamp of most recent completion/cancel
}

// sessionStorage key (for session-scope guard)
'moco_mycelium_demo_session'
{
  "started": true,                // Demo began this session (prevents double-start)
  "pausedAt": null,              // Timestamp of last pause
  "resumeCount": 0                // How many times user resumed from pause
}
```

### Per-Origin, Per-Browser

The flag is tied to the origin (`https://mccullough.cloud`) — it is **not** shared across origins. Within the same origin it is persistent across page reloads and closing tabs.

### Incognito / Private Browsing Mode

**Strategy: Graceful Degradation — No Force**

Private/incognito mode typically blocks `localStorage` writes or limits them to the session. The guard check is:

```js
function storageAvailable(type) {
  try {
    const test = '__storage_test__';
    sessionStorage.setItem(test, '1');   // Use sessionStorage as the canary
    sessionStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

function isStorageEnabled() {
  if (!storageAvailable('localStorage')) return false;
  try {
    localStorage.setItem('__probe__', '1');
    localStorage.removeItem('__probe__');
    return true;
  } catch {
    return false;
  }
}
```

- If `localStorage` is unavailable, fall back to **session-only** behavior (treat it as a first visit each session, but do not persist the "seen" flag).
- The demo still runs on first session. On subsequent sessions the `sessionStorage` flag (`moco_mycelium_demo_session.started`) prevents re-entry.

### Users Who Clear Browser Data

The flag is a first-visit signal, not a contractual guarantee. If users wipe browser data, they see the demo again on next visit — this is acceptable UX (the demo is non-intrusive and short). The design optimizes for the 99% case of a returning user who never wants to see it again.

**Optional hardening:** If you need to resist data clearing for legal/compliance reasons, add a server-side signal (e.g., a dated flag in a known API response) — but for a micro-demo this is overkill.

### Force-Testing Flag

For developers and QA, add a bypass:

```js
const DEMO_PARAM_BYPASS = new URLSearchParams(window.location.search).get('demo') === 'force';
const DEMO_COOKIE_BYPASS = document.cookie.includes('moco_demo_debug=1');
const DEMO_FLAG = DEMO_PARAM_BYPASS || DEMO_COOKIE_BYPASS;
```

Passing `?demo=force` on the URL re-triggers eligibility even if the "seen" flag is set. Also recognize `?nodemo=1` to suppress the demo entirely.

---

## 2. Demo State Machine

### State Definitions

| State | Meaning |
|---|---|
| `idle` | App is running normally. No demo. |
| `eligible` | First visit confirmed; demo has not started yet. Waiting for scene ready. |
| `running` | Demo is in progress. Camera choreography, narration, node highlights all active. |
| `paused` | User interacted during playback. Demo frozen. A toast/modal asks user to dismiss or skip. |
| `completing` | Demo is wrapping up — camera is executing a final pull-back to overview position. |
| `done` | Demo is finished. The "seen" localStorage flag is set. App has returned to normal overview state. |
| `cancelled` | User explicitly cancelled (Escape, skip button, or repeated interruption). Immediate transition to `done`. |

### State Diagram (ASCII)

```
                    ┌──────────────────────────────────────────────────────────┐
                    │                                                          │
                    ▼                                                          │
 idle ──────► eligible ───────────────────► running ───────────────────────────┤
                    │  (scene ready)          │   ▲                           │
                    │                         │   │ user dismisses             │
                    │                         ▼   │ pause prompt              │
                    │                       paused ◄─────────────────────────┤
                    │                         │                                │
                    │                         │ user hits Escape /            │
                    │                         │ clicks skip /                  │
                    │                         │ 2nd interruption               │
                    │                         ▼                                │
                    │                    cancelling ◄───────────────────────────┤
                    │                         │                                │
                    │                         ▼                                │
                    └────────────────────► completing ───────► done ◄──────────┘
                                                     (complete)
```

### Transition Table

| From | To | Trigger |
|---|---|---|
| `idle` | `eligible` | First-visit check passes; `!localStorage.moco_mycelium_demo_v1.seen` |
| `eligible` | `running` | `sceneReady` event or `TREE_READY` phase fired (all Three.js assets, data loaded) |
| `eligible` | `done` | Timeout exceeded (5s) — scene not ready in time, guard fails |
| `running` | `paused` | Any user interaction: click, touch, keypress, scroll, window blur |
| `paused` | `running` | User dismisses the pause prompt (clicks "Resume" or taps the canvas) |
| `paused` | `cancelled` | User clicks "Skip Demo", presses Escape twice, or interacts again within Xs |
| `running` | `completing` | Demo timer completes (e.g., 15s choreography done) |
| `running` | `cancelled` | Direct "Skip" action by user |
| `completing` | `done` | Exit animation finishes (camera has returned to overview; `state.navState.mode === 'overview'`) |
| `cancelled` | `done` | Immediate (no animation on cancel) |
| `done` | `idle` | After 800ms soak — confirms app is stable in overview state |

---

## 3. Guard Conditions

A guard is checked in the `idle → eligible` transition. All must pass.

```js
const DEMO_GUARDS = {
  // 1. Already seen
  notSeen() {
    if (DEMO_FLAG) return { pass: true, reason: 'debug-force' };
    const raw = localStorage.getItem('moco_mycelium_demo_v1');
    if (!raw) return { pass: true, reason: 'no-flag' };
    try {
      const meta = JSON.parse(raw);
      if (meta.seen) return { pass: false, reason: 'already-seen' };
      return { pass: true, reason: 'first-visit' };
    } catch {
      return { pass: true, reason: 'corrupt-flag-reset' };
    }
  },

  // 2. Scene ready within timeout
  sceneReady() {
    return new Promise((resolve) => {
      const TIMEOUT_MS = 5000;
      const timer = setTimeout(() => resolve({ pass: false, reason: 'scene-timeout' }), TIMEOUT_MS);

      // Listen for the "everything is loaded" signal the app already fires
      const readyHandler = () => {
        clearTimeout(timer);
        removeEventListener('scene-ready', readyHandler);
        removeEventListener('semantic-data-loaded', readyHandler);
        resolve({ pass: true, reason: 'scene-ready' });
      };
      addEventListener('scene-ready', readyHandler);
      addEventListener('semantic-data-loaded', readyHandler);
    });
  },

  // 3. Accessibility: respects reduced motion
  reducedMotion() {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (mq?.matches) return { pass: false, reason: 'prefers-reduced-motion' };
    // Also check OS-level accessibility settings that some browsers surface
    if (document.documentElement.dataset.reduceMotion === '1') return { pass: false, reason: 'os-reduced-motion' };
    return { pass: true };
  },

  // 4. WebGL availability (SSR / headless)
  webGL() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return { pass: false, reason: 'no-webgl' };
      // Check for minimal capability
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (/SwiftShader|llvmpipe|softpipe/i.test(renderer)) {
          return { pass: false, reason: 'software-renderer' };
        }
      }
      return { pass: true };
    } catch {
      return { pass: false, reason: 'webgl-exception' };
    }
  },

  // 5. URL parameter override
  urlParam() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('nodemo') === '1') return { pass: false, reason: 'url-nodemo' };
    return { pass: true };
  }
};

async function evaluateGuards() {
  // Guards 1, 3, 4, 5 are synchronous — run them all first
  const syncResults = [
    DEMO_GUARDS.notSeen(),
    DEMO_GUARDS.reducedMotion(),
    DEMO_GUARDS.webGL(),
    DEMO_GUARDS.urlParam()
  ];
  const syncFail = syncResults.find(r => !r.pass);
  if (syncFail) return syncFail;

  // Guard 2 is async — check last
  return await DEMO_GUARDS.sceneReady();
}
```

---

## 4. Cancellation & Interruption Handling

### Interaction Taxonomy

| Interaction | Result | Rationale |
|---|---|---|
| Click on canvas (3D space, no UI target) | **Pause** | User might be trying to orbit/examine. Pause gives them control. If they click AGAIN within 1.5s after pause, cancel. |
| Click on sidebar panel (filter, cluster list) | **Pause** then navigate | Same pause-first behavior. The panel should open after demo exits. |
| Click on search input | **Cancel** | User wants to search — override the demo immediately. |
| Escape key (first press) | **Pause** with "Press Escape again to skip" hint | Confirms intent before full cancel. |
| Escape key (second press within 2s) | **Cancel** | Explicit skip. |
| Arrow keys / Space / Enter | **Pause** | These are navigation keys that could accidentally trigger during demo. |
| Window blur (tab switch) | **Pause** | User is multi-tasking — pause and let them return. |
| Window focus (return) | **Auto-resume after 1.5s** | If they come back within 1.5s, resume demo. After 1.5s, stay paused and show dismiss prompt. |
| Touch on mobile | **Pause** | Same as click. |
| Pinch-to-zoom gesture | **Cancel** | User wants to interact with the scene — respect immediately. |
| Scroll on trackpad | **Pause** | User may be trying to read something. |
| Keyboard shortcut (e.g., `s` for search) | **Cancel** | Any defined keyboard shortcut takes precedence. |

### Pause Handling

When paused, the demo state freezes but does not exit. A non-blocking overlay appears:

```html
<div id="demo-pause-overlay" role="dialog" aria-modal="true" aria-label="Demo paused">
  <div class="demo-pause-card">
    <span class="demo-pause-icon">⏸</span>
    <p class="demo-pause-title">Demo paused</p>
    <p class="demo-pause-body">You interacted with the app. The demo will resume in a moment.</p>
    <div class="demo-pause-actions">
      <button id="demo-resume-btn" type="button">Resume</button>
      <button id="demo-skip-btn" type="button" class="secondary">Skip demo</button>
    </div>
  </div>
</div>
```

**Auto-resume behavior:** If the user does nothing for **8 seconds**, auto-resume automatically. If auto-resume fires and the user interacts again, go to cancel immediately.

### State Left After Interruption

After any pause → cancel transition, the app state must be exactly as if the demo never ran:

- `state.navState.mode` restored to `'overview'`
- `state.focusedNode` → `null`
- `state.currentSearchSummary` → `null`
- Any temporary camera overrides cleared
- All demo-specific uniforms (glow, shader values) reset to defaults
- Event listeners that were added by the demo module are removed
- `window.autoRotate` re-enabled if it was disabled during demo

---

## 5. Exit & Cleanup

When `done` or `cancelled` is entered:

```js
function demoCleanup() {
  // 1. Remove demo event listeners
  demoListeners.forEach(({ target, event, handler }) => {
    target?.removeEventListener(event, handler);
  });
  demoListeners = [];

  // 2. Clear demo timers
  demoTimers.forEach(id => window.clearTimeout(id));
  demoTimers.forEach(id => window.clearInterval(id));
  demoTimers = [];

  // 3. Reset any modified uniforms (node glow, shader values)
  if (state.myceliumGlowIntensity !== undefined) {
    state.myceliumGlowIntensity = 1.0; // default
  }
  if (typeof window.resetDemoNodeGlow === 'function') {
    window.resetDemoNodeGlow();
  }

  // 4. Restore camera to overview
  if (typeof window.resetNodePositions === 'function') {
    window.resetNodePositions({ skipUrlSync: true });
  }
  if (state.controls) {
    // If controls were modified during demo, restore defaults
    state.controls.enabled = true;
    state.controls.autoRotate = true; // Let the idle auto-rotate kick back in
  }

  // 5. Restore app to overview mode
  if (state.navState.mode !== 'overview') {
    if (typeof window.setMyceliumMode === 'function') {
      window.setMyceliumMode('default', { skipUrlSync: true });
    }
    state.navState.mode = 'overview';
    state.focusedNode = null;
  }

  // 6. Clear any session-paused flag
  try {
    sessionStorage.removeItem('moco_mycelium_demo_session');
  } catch {}

  // 7. Set the lifetime "seen" flag
  try {
    const existing = JSON.parse(localStorage.getItem('moco_mycelium_demo_v1') || '{}');
    localStorage.setItem('moco_mycelium_demo_v1', JSON.stringify({
      seen: true,
      seenAt: existing.seenAt || Date.now(),
      sessionCount: (existing.sessionCount || 0) + 1,
      lastSeenAt: Date.now()
    }));
  } catch {}

  // 8. Log for analytics
  if (typeof window.recordSemanticLaneSnapshot === 'function') {
    window.recordSemanticLaneSnapshot({
      demo_state: 'done',
      demo_triggered: state._demoStartedAt ? true : false,
      demo_duration_ms: state._demoStartedAt ? Date.now() - state._demoStartedAt : null
    });
  }
}
```

---

## 6. Session vs Lifetime

### Recommendation: **Lifetime per Browser** (localStorage)

**Rationale:**

The micro-demo is designed to orient a new user once — on first encounter with the app. After seeing it, a returning user should **never** see it again on that browser/device, even across sessions, tabs, and days. This is the correct mental model for an "arrival experience."

A session-scoped demo (sessionStorage) would re-trigger on every new tab — which is annoying and defeats the purpose. A day-scoped demo adds complexity (date comparison logic) without meaningful benefit.

**The exception path** is incognito/private browsing: the localStorage flag is not written, so the user effectively gets the demo on every new private session. This is acceptable — incognito users have an expectation of ephemeral state, and the demo is brief and non-blocking.

### Summary Table

| Strategy | Storage | Re-seen after close tab | Re-seen after browser restart | Survives data clear |
|---|---|---|---|---|
| **Lifetime (chosen)** | `localStorage` | No | No | Only if data not cleared |
| Per-session | `sessionStorage` | **Yes** (every tab) | No | No |
| Per-day | `localStorage` + date | No | No (same day) | Only if data not cleared |

---

## 7. Complete Pseudocode for Core Logic

```js
// js/modules/demo-controller.js

import { state } from '../state.js';

// --- Constants ---
const DEMO_KEY = 'moco_mycelium_demo_v1';
const DEMO_SESSION_KEY = 'moco_mycelium_demo_session';
const DEMO_AUTO_RESUME_MS = 8000;
const DEMO_CUTOFF_MS = 1500; // Second interaction within this window = cancel

// --- Module-level state ---
let _demoState = 'idle';
let _demoListeners = [];
let _demoTimers = [];
let _pauseAt = null;
let _resumeCount = 0;
let _interactionTimer = null;
let _startedAt = null;

// --- Public API ---
export function getDemoState() { return _demoState; }

export async function initDemoController() {
  // Synchronous guard pass → eligible
  const guard = await evaluateGuards();
  if (!guard.pass) {
    _demoState = 'idle';
    return;
  }

  _demoState = 'eligible';
  _startedAt = Date.now();

  // Mark session as started (prevents double-start on rapid reload)
  try { sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ started: true })); } catch {}

  // Listen for scene-ready
  const sceneReadyHandler = () => transitionTo('running');
  const dataLoadedHandler = () => transitionTo('running');

  addListener(window, 'scene-ready', sceneReadyHandler);
  addListener(window, 'semantic-data-loaded', dataLoadedHandler);

  // Timeout: if scene not ready in 5s, bail
  const timeoutTimer = setTimeout(() => {
    if (_demoState === 'eligible') transitionTo('done');
  }, 5000);
  _demoTimers.push(timeoutTimer);

  // Also transition to running if scene was already ready before we subscribed
  if (state.points?.length > 0 && state.scene?.ready) {
    transitionTo('running');
  }
}

function transitionTo(newState) {
  const prev = _demoState;
  _demoState = newState;
  clearDemoTimers();

  switch (newState) {
    case 'running':
      _installInteractionGuards();
      _startDemoChoreography();
      break;

    case 'paused':
      _pauseAt = Date.now();
      _showPauseOverlay();
      _installResumeListeners();
      break;

    case 'completing':
      _runExitAnimation(() => transitionTo('done'));
      break;

    case 'done':
    case 'cancelled':
      demoCleanup();
      _demoState = 'done';
      setTimeout(() => { _demoState = 'idle'; }, 800);
      break;
  }
}

function _installInteractionGuards() {
  // Canvas / document clicks
  const clickHandler = (e) => {
    const target = e.target;
    // Interact with search input → cancel immediately
    if (target?.closest('#search-input, #search-results, .search-container')) {
      transitionTo('cancelled');
      return;
    }
    // Any other interaction → pause
    _handleInteraction();
  };
  addListener(document, 'click', clickHandler);
  addListener(document, 'touchstart', clickHandler, { passive: true });
  addListener(document, 'keydown', (e) => {
    if (e.key === 'Escape') _handleEscape();
    else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' '].includes(e.key)) _handleInteraction();
  });
  addListener(window, 'blur', () => _handleInteraction());
  addListener(window, 'resize', () => {}, { once: true });
}

function _handleInteraction() {
  if (_demoState !== 'running') return;
  // Track second-hit within cutoff for cancel logic
  if (_pauseAt && (Date.now() - _pauseAt) < DEMO_CUTOFF_MS) {
    transitionTo('cancelled');
    return;
  }
  transitionTo('paused');
}

function _handleEscape() {
  if (_demoState === 'paused') {
    transitionTo('cancelled'); // Second Escape = skip
  } else if (_demoState === 'running') {
    transitionTo('paused');
  }
}

function _installResumeListeners() {
  const resumeBtn = document.getElementById('demo-resume-btn');
  const skipBtn = document.getElementById('demo-skip-btn');
  const canvas = document.querySelector('#canvas-container, #three-canvas');

  if (resumeBtn) addListener(resumeBtn, 'click', () => transitionTo('running'));
  if (skipBtn) addListener(skipBtn, 'click', () => transitionTo('cancelled'));
  if (canvas) addListener(canvas, 'click', () => transitionTo('running'), { once: true });

  // Auto-resume timer
  const autoTimer = setTimeout(() => {
    if (_demoState === 'paused') transitionTo('running');
  }, DEMO_AUTO_RESUME_MS);
  _demoTimers.push(autoTimer);
}

function _showPauseOverlay() {
  const overlay = document.getElementById('demo-pause-overlay');
  if (overlay) overlay.classList.add('active');
}

function _hidePauseOverlay() {
  const overlay = document.getElementById('demo-pause-overlay');
  if (overlay) overlay.classList.remove('active');
}

function _startDemoChoreography() {
  // Call into existing journey/three-setup choreography
  if (typeof window.startMicroDemo === 'function') {
    window.startMicroDemo({
      onComplete: () => transitionTo('completing'),
      onCancel: () => transitionTo('cancelled')
    });
  } else {
    // Fallback: just auto-complete after 15s
    const timer = setTimeout(() => transitionTo('completing'), 15000);
    _demoTimers.push(timer);
  }
}

function _runExitAnimation(onComplete) {
  _hidePauseOverlay();
  // Reset camera to overview — reuse existing animation utilities
  if (typeof window.resetNodePositions === 'function') {
    window.resetNodePositions({ skipUrlSync: true });
  }
  const timer = setTimeout(onComplete, 1200); // Wait for animation
  _demoTimers.push(timer);
}

function addListener(target, event, handler, options) {
  if (!target || !event || !handler) return;
  target.addEventListener(event, handler, options);
  _demoListeners.push({ target, event, handler });
}

function clearDemoTimers() {
  _demoTimers.forEach(id => window.clearTimeout(id));
  _demoTimers = [];
}

function demoCleanup() {
  _hidePauseOverlay();
  _demoListeners.forEach(({ target, event, handler }) => {
    try { target?.removeEventListener(event, handler); } catch {}
  });
  _demoListeners = [];
  clearDemoTimers();
  // Reset state — restore app to clean overview
  state.navState.mode = 'overview';
  state.focusedNode = null;
  if (state.controls) state.controls.autoRotate = true;
  _pauseAt = null;
  _resumeCount = 0;

  // Persist seen flag
  try {
    const existing = JSON.parse(localStorage.getItem(DEMO_KEY) || '{}');
    localStorage.setItem(DEMO_KEY, JSON.stringify({
      seen: true,
      seenAt: existing.seenAt || Date.now(),
      sessionCount: (existing.sessionCount || 0) + 1,
      lastSeenAt: Date.now()
    }));
  } catch {}
}

window.getDemoState = getDemoState;
```

---

## 8. Integration Points

The controller slots into the existing app initialization in `app.js`:

```js
// OLD (app.js ~line 293):
if (!sessionStorage.getItem('micro_demo_seen')) {
  sessionStorage.setItem('micro_demo_seen', 'true');
  window.setTimeout(() => { /* click explore btn */ }, 3500);
}

// REPLACE WITH:
import { initDemoController } from './modules/demo-controller.js';
// After startDeferredHydration() and hideLoadingOverlay() resolve:
await hideLoadingOverlay();
startDeferredHydration();
if (state.currentView === 'galaxy' && state.focusedNode === null && !state.currentSearchSummary) {
  initDemoController(); // non-blocking, manages its own state machine
}
```

The existing `btn-explore-network` click behavior remains the manual fallback — the controller owns the automated flow.

---

## 9. Guard Evaluation Summary

| Guard | Sync/Async | Fail Action |
|---|---|---|
| `notSeen` | Sync | `idle` (demo never starts) |
| `reducedMotion` | Sync | `idle` |
| `webGL` | Sync | `idle` |
| `urlParam(nodemo)` | Sync | `idle` |
| `sceneReady` | Async (5s timeout) | `done` (timeout exit) |

All guards must pass for `eligible → running`. If any sync guard fails, the demo is suppressed synchronously and the app starts in `idle`. If the async scene-ready guard times out, the app starts normally but the demo exits cleanly without setting the "seen" flag (it was never running).

---

## 10. What This Replaces

The current code at `app.js:293-303` uses `sessionStorage` only (repeats per tab) with no guard conditions, no pause/cancel handling, and no cleanup contract. This spec supersedes that implementation.
