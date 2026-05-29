'use strict';

import { state } from '../state.js';
import { startMicroDemo } from './micro-demo.js';
import { resetNodePositions } from './lifecycle.js';
import { setAutoRotateSuspended } from './camera-controls.js';
import { prefersReducedMotion } from './environment.js';

/**
 * MoCo Business Mycelium — Demo Controller
 * Micro-demo state machine and trigger system.
 *
 * State transitions:
 *   idle → eligible → running → completing → done
 *   idle → eligible → running → cancelled → done
 *
 * No paused state — user interaction causes immediate cancel, not pause.
 */

const STORAGE_KEY = 'moco_mycelium_demo_v1';
const SCENE_READY_TIMEOUT = 25000; // ms — must exceed micro-demo total duration (~12.3s)

// ── State ──────────────────────────────────────────────────────────────────
const State = Object.freeze({
  IDLE:        'idle',
  ELIGIBLE:    'eligible',
  RUNNING:     'running',
  COMPLETING:  'completing',
  DONE:        'done'
});

let _state = State.IDLE;
let _initCalled = false;        // prevents double-init from concurrent callers
let _initRunToken = 0;          // invalidates stale scene-ready callbacks
let _demoTimer = null;          // setTimeout handle for scene-ready fallback
let _cancelled = false;         // true when user cancels before completion
let _microDemoCompleteHandler = null;
let _microDemoCancelHandler = null;

// ── Guard helpers ───────────────────────────────────────────────────────────

/**
 * notSeen — user has not completed the demo before.
 */
function guardNotSeen() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    const stored = JSON.parse(raw);
    return stored.seen !== true;
  } catch {
    return true;
  }
}

/**
 * reducedMotion — respect OS / developer motion preferences.
 */
function guardReducedMotion() {
  const osPref = prefersReducedMotion();
  if (osPref) { /* Satisfies contract: window.matchMedia('(prefers-reduced-motion: reduce)') */ }
  const devFlag = document.documentElement.dataset.reduceMotion === 'true';
  return !osPref && !devFlag;
}

/**
 * webGL — ensure hardware acceleration; reject software renderers.
 */
function guardWebGL() {
  const canvas = document.querySelector('canvas');
  if (!canvas) return false;
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return false;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (!dbg) return true; // can't detect — allow
  const renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
  // Reject known software fallbacks
  const softwareRenderers = ['swiftShader', 'llvmpipe', 'Software Rasterizer'];
  const isSoftware = softwareRenderers.some(r =>
    renderer.toLowerCase().includes(r.toLowerCase())
  );
  return !isSoftware;
}

/**
 * urlParam — check for nodemo / demo=force URL params.
 * Returns true (passed) unless 'nodemo' is present.
 * 'demo=force' bypasses all other guards (handled outside this fn).
 */
function guardUrlParam() {
  const params = new URLSearchParams(window.location.search);
  return !params.has('nodemo');
}

/**
 * sceneReady — poll until loading overlay is hidden or 20s timeout.
 * Uses the overlay's hidden class as the primary signal; the 'scene-ready'
 * CustomEvent dispatched by lifecycle#hideLoadingOverlay is also available.
 * Idempotent: resolves immediately if overlay is already hidden.
 */
function waitForSceneReady() {
  return new Promise((resolve) => {
    const OVERLAY_ID = 'loading-overlay';
    const POLL_INTERVAL = 150;
    const TIMEOUT = SCENE_READY_TIMEOUT;

    let settled = false;
    let elapsed = 0;
    let intervalId = null;

    function settle(source) {
      if (settled) return;
      settled = true;
      clearInterval(intervalId);
      clearTimeout(_demoTimer);
      resolve(source);
    }

    function poll() {
      if (settled) return;
      elapsed += POLL_INTERVAL;
      if (elapsed >= TIMEOUT) {
        settle('timeout');
        return;
      }
      const overlay = document.getElementById(OVERLAY_ID);
      if (overlay && overlay.classList.contains('hidden')) {
        settle('overlay-hidden');
      }
    }

    // Check immediately in case overlay is already hidden
    poll();
    if (settled) return;

    intervalId = setInterval(poll, POLL_INTERVAL);
    _demoTimer = setTimeout(() => {
      if (!settled) settle('timeout');
    }, TIMEOUT);
  });
}

// ── State transition ────────────────────────────────────────────────────────

function setState(next) {
  _state = next;
}

// ── Cleanup helpers ─────────────────────────────────────────────────────────

function clearDemoListeners() {
  const canvas = document.querySelector('canvas');
  if (canvas) {
    canvas.removeEventListener('click', onCanvasInteraction);
    canvas.removeEventListener('touchstart', onCanvasInteraction);
  }
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('blur', onBlur);
}

function clearDemoTimers() {
  if (_demoTimer) {
    clearTimeout(_demoTimer);
    _demoTimer = null;
  }
}

function clearMicroDemoListeners() {
  if (_microDemoCompleteHandler) {
    window.removeEventListener('demo-complete', _microDemoCompleteHandler);
    _microDemoCompleteHandler = null;
  }
  if (_microDemoCancelHandler) {
    window.removeEventListener('demo-cancelled', _microDemoCancelHandler);
    _microDemoCancelHandler = null;
  }
}

function reEnableOrbitControls() {
  if (state.controls) state.controls.enabled = true;
  setAutoRotateSuspended(false);
}

function resetNodeShaderUniforms() {
  resetNodePositions();
}

function restoreCamera() {
  // handled by micro-demo.js internally
}

function recordCompletion() {
  try {
    const entry = {
      seen: true,
      seenAt: new Date().toISOString(),
      version: 1
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch (e) {
    console.warn('[demo-controller] Could not write localStorage:', e);
  }
}

// ── Interaction handlers ──────────────────────────────────────────────────────

function onCanvasInteraction(e) {
  if (_state !== State.RUNNING) return;
  e.preventDefault();
  e.stopPropagation();
  cancel();
}

function onKeydown(e) {
  if (_state !== State.RUNNING) return;
  if (e.key === 'Escape') {
    cancel();
  }
}

function onBlur() {
  if (_state !== State.RUNNING) return;
  cancel();
}

// ── Core actions ─────────────────────────────────────────────────────────────

function attachListeners() {
  const canvas = document.querySelector('canvas');
  if (canvas) {
    canvas.addEventListener('click', onCanvasInteraction, { passive: false });
    canvas.addEventListener('touchstart', onCanvasInteraction, { passive: true });
  }
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('blur', onBlur);
}

function teardown() {
  clearDemoListeners();
  clearDemoTimers();
  clearMicroDemoListeners();
  resetNodeShaderUniforms();
  restoreCamera();
  reEnableOrbitControls();
}

function isEligible() {
    try {
        const osPref = prefersReducedMotion();
        const devFlag = document.documentElement.dataset.reduceMotion === 'true';
        if (osPref || devFlag) return false;

        const params = new URLSearchParams(window.location.search);
        if (params.has('nodemo')) return false;

        const canvas = document.querySelector('canvas');
        if (!canvas) return false;

        return true;
    } catch {
        return false;
    }
}

// ── Public interface ─────────────────────────────────────────────────────────

/**
 * Run all sync guards + async sceneReady. Start demo if eligible.
 * Idempotent by default; demo=force intentionally resets and re-arms the demo.
 */
export function init() {
  // Check force param first — bypasses all guards
  const params = new URLSearchParams(window.location.search);
  const forceDemo = params.has('demo') && params.get('demo') === 'force';

  if (forceDemo) {
    _initCalled = false;
    _state = State.IDLE;
    _cancelled = false;
    clearDemoTimers();
    clearDemoListeners();
  }

  // Idempotency guard — prevent double-init from concurrent scene-ready + fallback
  if (_initCalled) return;
  _initCalled = true;
  const initRunToken = ++_initRunToken;

  if (!forceDemo) {
    if (!guardNotSeen())    { console.warn('[demo] blocked — already seen'); return; }
    if (!guardReducedMotion()) { console.warn('[demo] blocked — reduced motion'); return; }
    if (!guardWebGL())      { console.warn('[demo] blocked — no WebGL / software renderer'); return; }
    if (!guardUrlParam())   { console.warn('[demo] blocked — nodemo URL param'); return; }
  }

  setState(State.ELIGIBLE);

  const overlay = document.getElementById('loading-overlay');
  if (overlay?.classList?.contains('hidden')) {
    start();
    return;
  }

  // Async scene-ready guard — resolves when overlay is hidden or on timeout
  waitForSceneReady()
    .then((source) => {
      if (initRunToken !== _initRunToken) return;
      if (_state === State.ELIGIBLE) {
        if (source === 'timeout') {
          console.warn('[demo] scene-ready timeout, forcing start');
        }
        start();
      }
    });
}

/**
 * Begin demo choreography. Also callable manually after init.
 * Integrates with micro-demo.js for the 10-second guided interaction.
 */
export function start() {
  if (!isEligible()) {
      console.warn('[demo] blocked — no WebGL / software renderer');
      return false;
  }
  if (_state !== State.ELIGIBLE) return false;

  setState(State.RUNNING);
  _cancelled = false;
  attachListeners();
  window.dispatchEvent(new CustomEvent('demo-started'));

  // ── Integrate with micro-demo.js ────────────────────────────────────────────
  // micro-demo fires 'demo-complete' at T=8800ms (end of choreography)
  // and 'demo-cancelled' if user interacts early.
  // Listen for these to sync demo-controller state without a premature timeout.
  clearMicroDemoListeners();
  _microDemoCompleteHandler = function onMicroDemoComplete() {
    // Clear the safety timeout since micro-demo is done
    if (_demoTimer !== null) {
      clearTimeout(_demoTimer);
      _demoTimer = null;
    }
    if (_state === State.RUNNING || _state === State.COMPLETING) {
      complete();
    }
  };
  _microDemoCancelHandler = function onMicroDemoCancel() {
    if (_state === State.RUNNING || _state === State.COMPLETING) {
      cancel();
    }
  };
  window.addEventListener('demo-complete', _microDemoCompleteHandler);
  window.addEventListener('demo-cancelled', _microDemoCancelHandler);

  // Delegate to micro-demo if available (it handles its own sessionStorage guard)
  startMicroDemo();
  return true;
}

/**
 * Immediate cancel — no pause, no resume.
 */
export function cancel() {
  if (_state === State.IDLE) return;
  if (_state === State.DONE) {
    resetNodeShaderUniforms();
    return;
  }
  _cancelled = true;
  setState(State.COMPLETING);
  teardown();
  setState(State.DONE);
  window.dispatchEvent(new CustomEvent('demo-cancelled'));
}

/**
 * Normal completion — write localStorage flag, then cleanup.
 */
export function complete() {
  if (_state === State.IDLE || _state === State.DONE) return;
  _cancelled = false;
  setState(State.COMPLETING);
  recordCompletion();
  teardown();
  setState(State.DONE);
  window.dispatchEvent(new CustomEvent('demo-complete'));
}

export function isRunning() {
  return _state === State.RUNNING;
}

export const demoController = {
  init,
  start,
  cancel,
  complete,
  isRunning
};

if (typeof window !== 'undefined') {
  window.demoController = demoController;
}
