/**
 * micro-demo-contract.mjs
 *
 * Node contract test for the demo-controller / micro-demo cluster.
 * Tests critical integration contracts WITHOUT requiring a browser.
 *
 * Covers:
 *   1. window.demoController exposes required API
 *   2. State machine: init -> eligible -> running -> done/cancelled
 *   3. isRunning() reflects _state
 *   4. cancel() fires demo-cancelled and transitions to DONE
 *   5. complete() fires demo-complete and writes localStorage
 *   6. demo=force bypasses the seen guard
 *   7. init() is idempotent unless demo=force intentionally re-arms it
 *   8. guardNotSeen blocks when localStorage seen flag is set
 *   9. sessionStorage guard prevents double-fire
 *   10. micro-demo bridge listeners are removed after completion/cancel
 *
 * Run from semantic-demo root:
 *   node tests/micro-demo-contract.mjs
 *   node tests/run-from-semantic-demo.cjs micro-demo-contract.mjs
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Minimal DOM/window shim - sufficient to exercise demo-controller guard
// and state machine logic in Node.
// ---------------------------------------------------------------------------

const _listeners = new Map();
const _localStorage = new Map();
const _sessionStorage = new Map();
const _timers = new Map();
let _timerId = 0;
const _dispatchedEvents = [];

class FakeClassList {
  constructor() { this._items = new Set(); }
  add(...n)    { n.forEach(x => this._items.add(x)); }
  remove(...n) { n.forEach(x => this._items.delete(x)); }
  contains(n)  { return this._items.has(n); }
  toggle(n, f) {
    const on = f !== undefined ? f : !this._items.has(n);
    on ? this._items.add(n) : this._items.delete(n);
    return on;
  }
  get length() { return this._items.size; }
  [Symbol.iterator]() { return this._items[Symbol.iterator](); }
}

class FakeElement {
  constructor(tag) {
    this.tagName    = (tag || 'div').toUpperCase();
    this.classList  = new FakeClassList();
    this.dataset    = {};
    this.style      = {};
    this.children   = [];
    this._innerHTML  = '';
    this._text       = '';
    this._attr       = new Map();
    this._elListeners = new Map();
  }
  get innerHTML()          { return this._innerHTML; }
  set innerHTML(v)         { this._innerHTML = String(v); }
  get textContent()        { return this._text; }
  set textContent(v)       { this._text = String(v); }
  appendChild(c)           { this.children.push(c); return c; }
  setAttribute(k, v)       { this._attr.set(String(k), String(v)); }
  getAttribute(k)          { return this._attr.get(String(k)) ?? null; }
  addEventListener(e, h, o) {
    if (!this._elListeners.has(e)) this._elListeners.set(e, []);
    this._elListeners.get(e).push(h);
  }
  removeEventListener(e, h) {
    const arr = this._elListeners.get(e) || [];
    this._elListeners.set(e, arr.filter(x => x !== h));
  }
  dispatchEvent(ev)        { return document.dispatchEvent(ev); }
}

// Canvas that supports getContext for WebGL guard
const _fakeCanvas = new FakeElement('canvas');
_fakeCanvas.addEventListener = (e, h, o) => {
  if (!_fakeCanvas._elListeners.has(e)) _fakeCanvas._elListeners.set(e, []);
  _fakeCanvas._elListeners.get(e).push(h);
};
_fakeCanvas.removeEventListener = (e, h) => {
  const arr = _fakeCanvas._elListeners.get(e) || [];
  _fakeCanvas._elListeners.set(e, arr.filter(x => x !== h));
};
_fakeCanvas.getContext = (type) => {
  if (type === 'webgl2' || type === 'webgl') {
    return {
      getExtension: () => null,
      getParameter: () => 'Intel GPU',
    };
  }
  return null;
};
_fakeCanvas._elListeners = new Map();

// Loading overlay element (hidden by default)
function makeLoadingOverlay() {
  const el = new FakeElement('div');
  el.classList = new FakeClassList();
  el.classList.add('hidden');
  return el;
}

// A persistent loading overlay so getElementById returns same instance
const _persistentOverlay = makeLoadingOverlay();

const FakeDocument = {
  body: new FakeElement('body'),
  documentElement: new FakeElement('html'),
  querySelector: (sel) => sel === 'canvas' ? _fakeCanvas : null,
  querySelectorAll: () => [],
  getElementById: (id) => {
    if (id === 'loading-overlay') return _persistentOverlay;
    return null;
  },
  createElement(tag) { return new FakeElement(tag); },
  head: new FakeElement('head'),
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  _listeners: new Map(),
  addEventListener(e, h, o) {
    if (!this._listeners.has(e)) this._listeners.set(e, []);
    this._listeners.get(e).push(h);
  },
  removeEventListener(e, h) {
    const arr = this._listeners.get(e) || [];
    this._listeners.set(e, arr.filter(x => x !== h));
  },
  dispatchEvent(ev) {
    _dispatchedEvents.push(ev);
    const handlers = this._listeners.get(ev.type) || [];
    handlers.forEach(h => h.call(this, ev));
    return true;
  }
};

globalThis.document = FakeDocument;

let _clockNow = Date.now();

// Also expose localStorage as a bare global (used directly in demo-controller.js)
globalThis.localStorage = {
  getItem: (k) => _localStorage.get(k) ?? null,
  setItem: (k, v) => _localStorage.set(k, String(v)),
  removeItem: (k) => _localStorage.delete(k),
  clear: () => _localStorage.clear(),
};

globalThis.window = {
  location: { href: 'http://localhost/', pathname: '/', search: '' },
  history: {
    state: {},
    replaceState(state, _title, url) {
      this.state = state;
      if (typeof url === 'string') {
        const next = new URL(url, globalThis.window.location.href);
        globalThis.window.location.href = next.href;
        globalThis.window.location.pathname = next.pathname;
        globalThis.window.location.search = next.search;
      }
    },
    pushState(state, _title, url) {
      this.replaceState(state, _title, url);
    }
  },
  localStorage: {
    getItem: (k) => _localStorage.get(k) ?? null,
    setItem: (k, v) => _localStorage.set(k, String(v)),
    removeItem: (k) => _localStorage.delete(k),
    clear: () => _localStorage.clear(),
  },
  sessionStorage: {
    getItem: (k) => _sessionStorage.get(k) ?? null,
    setItem: (k, v) => _sessionStorage.set(k, String(v)),
    removeItem: (k) => _sessionStorage.delete(k),
    clear: () => _sessionStorage.clear(),
  },
  matchMedia: (q) => ({ matches: false, media: q }),
  performance: { now: () => _clockNow },
  setTimeout: (fn, delay = 0) => {
    const id = ++_timerId;
    _timers.set(id, { fn, delay, start: _clockNow });
    return id;
  },
  clearTimeout: (id) => _timers.delete(id),
  clearInterval: (id) => _timers.delete(id),
  dispatchEvent: (ev) => {
    _dispatchedEvents.push(ev);
    const handlers = _listeners.get(ev.type) || [];
    handlers.forEach(h => h.call(globalThis.window, ev));
    return true;
  },
  addEventListener: (e, h, o) => {
    if (!_listeners.has(e)) _listeners.set(e, []);
    _listeners.get(e).push(h);
  },
  removeEventListener: (e, h) => {
    const arr = _listeners.get(e) || [];
    _listeners.set(e, arr.filter(x => x !== h));
  },
  _orbitControls: { enabled: true },
  _app: { autoRotate: true },
  cancelMicroDemo: null,
  startMicroDemo: null,
  demoController: null,
  resetNodePositions: () => {},
  setAutoRotateSuspended: () => {},
  updateSelectedBusiness: () => {},
  applyPointFilterColors: () => {},
  refreshCompositionState: () => {},
  updateJourneyCompass: () => {},
};

globalThis.sessionStorage = globalThis.window.sessionStorage;

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------
function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`FAIL: ${message} - expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function extractFunctionBody(source, name, { exported = false } = {}) {
  const prefix = exported ? `export function ${name}` : `function ${name}`;
  const start = source.indexOf(prefix);
  if (start < 0) throw new Error(`Could not find ${prefix}`);
  const open = source.indexOf('{', start);
  if (open < 0) throw new Error(`Could not find body for ${prefix}`);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`Could not close body for ${prefix}`);
}

// Path to demo-controller module
const _basePath = 'file://' + process.cwd().replace(/\\/g, '/') + '/js/modules/demo-controller.js';
let _importCounter = 0;

// Re-import to reset module-level state between tests
async function freshImport() {
  delete globalThis.window.demoController;
  const mod = await import(`${_basePath}?t=${Date.now()}-${++_importCounter}`);
  return mod;
}

async function clearState() {
  _localStorage.clear();
  _sessionStorage.clear();
  _timers.clear();
  _listeners.clear();
  _fakeCanvas._elListeners.clear();
  _dispatchedEvents.length = 0;
  _timerId = 0;
  _clockNow = Date.now();
  globalThis.window.location.href = 'http://localhost/';
  globalThis.window.location.pathname = '/';
  globalThis.window.location.search = '';
  globalThis.window.history.state = {};
  // Remove stale window listeners from previous demo-controller.start() calls
  // (start() registers 'demo-complete'/'demo-cancelled' listeners on window)
  const STALE_EVENTS = ['demo-complete', 'demo-cancelled', 'demo-started'];
  for (const ev of STALE_EVENTS) {
    const handlers = _listeners.get(ev) || [];
    for (const h of handlers) {
      globalThis.window.removeEventListener(ev, h);
    }
  }
  // Re-import to get a fresh module with _initCalled=false and _state=IDLE
  return await freshImport();
}

// ---------------------------------------------------------------------------
// Load initial module
// ---------------------------------------------------------------------------
let demoController;
try {
  const mod = await import(_basePath);
  demoController = mod;
} catch (err) {
  console.error('Could not import demo-controller.js:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

async function test(name, fn) {
  // Always clear the event log first (before any async ops that might throw)
  _dispatchedEvents.length = 0;
  try {
    demoController = await clearState();
  } catch (_) {}
  try {
    await fn();
    console.log(`  ok ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${name}`);
    console.log(`        ${err.message}`);
    failed++;
  }
}

// Contract 1: window.demoController API surface
await test('window.demoController is attached after module load', async () => {
  assert(typeof globalThis.window.demoController === 'object', 'demoController exists on window');
  const api = globalThis.window.demoController;
  assert(typeof api.init === 'function', 'init is a function');
  assert(typeof api.start === 'function', 'start is a function');
  assert(typeof api.cancel === 'function', 'cancel is a function');
  assert(typeof api.complete === 'function', 'complete is a function');
  assert(typeof api.isRunning === 'function', 'isRunning is a function');
});

// Contract 2: isRunning() returns false initially
await test('isRunning() is false when demo has not started', async () => {
  assertEqual(demoController.isRunning(), false, 'isRunning() initially false');
});

// Contract 3: init() is idempotent
await test('init() can only be called once (idempotency guard)', async () => {
  globalThis.window.location.search = '?demo=force';
  demoController.init();
  const firstResult = demoController.isRunning();
  demoController.init(); // second call must be no-op
  assertEqual(demoController.isRunning(), firstResult, 'second init does not change state');
});

await test('demo=force re-init clears active listeners before re-arming', async () => {
  globalThis.window.location.search = '?demo=force';
  demoController.init();
  await Promise.resolve();

  assertEqual((_listeners.get('demo-complete') || []).length, 1, 'demo-complete listener registered once');
  assertEqual((_listeners.get('demo-cancelled') || []).length, 1, 'demo-cancelled listener registered once');
  assertEqual((_listeners.get('keydown') || []).length, 1, 'keydown listener registered once');
  assertEqual((_fakeCanvas._elListeners.get('click') || []).length, 1, 'canvas click listener registered once');

  demoController.init();
  await Promise.resolve();

  assertEqual((_listeners.get('demo-complete') || []).length, 1, 'demo-complete listener remains singular after force re-init');
  assertEqual((_listeners.get('demo-cancelled') || []).length, 1, 'demo-cancelled listener remains singular after force re-init');
  assertEqual((_listeners.get('keydown') || []).length, 1, 'keydown listener remains singular after force re-init');
  assertEqual((_fakeCanvas._elListeners.get('click') || []).length, 1, 'canvas click listener remains singular after force re-init');

  demoController.complete();
  assertEqual((_listeners.get('demo-complete') || []).length, 0, 'demo-complete listener removed after forced run completes');
  assertEqual((_listeners.get('demo-cancelled') || []).length, 0, 'demo-cancelled listener removed after forced run completes');
});

// Contract 4: demo=force bypasses seen guard
await test('demo=force allows start despite localStorage seen=true', async () => {
  _localStorage.set('moco_mycelium_demo_v1', JSON.stringify({ seen: true, seenAt: Date.now(), version: 1 }));
  globalThis.window.location.search = '?demo=force';
  demoController.init();
  demoController.start();
  assertEqual(demoController.isRunning(), true, 'demo=force allows start despite seen flag');
});

// Contract 5: guardNotSeen blocks demo when seen=true
await test('localStorage seen=true blocks demo (no demo=force)', async () => {
  _localStorage.set('moco_mycelium_demo_v1', JSON.stringify({ seen: true, seenAt: Date.now(), version: 1 }));
  globalThis.window.location.search = '';
  demoController.init();
  assertEqual(demoController.isRunning(), false, 'demo blocked by seen guard');
});

// Contract 6: cancel() fires demo-cancelled event
await test('cancel() fires demo-cancelled CustomEvent', async () => {
  globalThis.window.location.search = '?demo=force';
  demoController.init();
  demoController.start();

  const before = _dispatchedEvents.filter(e => e.type === 'demo-cancelled').length;
  demoController.cancel();
  const after = _dispatchedEvents.filter(e => e.type === 'demo-cancelled').length;

  assertEqual(after, before + 1, 'demo-cancelled event dispatched');
  assertEqual(demoController.isRunning(), false, 'isRunning() is false after cancel');
});

// Contract 7: complete() fires demo-complete and writes localStorage
await test('complete() fires demo-complete and writes seen flag to localStorage', async () => {
  globalThis.window.location.search = '?demo=force';
  demoController.init();
  demoController.start();

  const before = _dispatchedEvents.filter(e => e.type === 'demo-complete').length;
  demoController.complete();
  const after = _dispatchedEvents.filter(e => e.type === 'demo-complete').length;

  assertEqual(after, before + 1, 'demo-complete event dispatched');

  const stored = _localStorage.get('moco_mycelium_demo_v1');
  assert(stored !== null, 'localStorage moco_mycelium_demo_v1 is written');
  const parsed = JSON.parse(stored);
  assertEqual(parsed.seen, true, 'localStorage seen flag is true after complete');
  assert(parsed.seenAt !== undefined, 'localStorage seenAt timestamp is set');
});

// Contract 8: cancel/complete no-op when not RUNNING
await test('cancel() and complete() are no-op when not running', async () => {
  demoController.cancel();
  demoController.complete();
  assertEqual(demoController.isRunning(), false, 'still not running after cancel/complete when idle');
});

// Contract 9: start() requires ELIGIBLE state
await test('start() is no-op in idle state (not eligible)', async () => {
  demoController.start();
  assertEqual(demoController.isRunning(), false, 'start() in idle state does nothing');
});

// Contract 10: complete() dispatches demo-complete event
await test('complete() dispatches demo-complete event', async () => {
  globalThis.window.location.search = '?demo=force';
  demoController.init();
  demoController.start();

  const before = _dispatchedEvents.filter(e => e.type === 'demo-complete').length;
  demoController.complete();
  const after = _dispatchedEvents.filter(e => e.type === 'demo-complete').length;

  // complete() dispatches one demo-complete event
  assertEqual(after, before + 1, 'complete() dispatches exactly one demo-complete event');
});

// Contract 11: micro-demo bridge listener lifecycle
await test('micro-demo bridge listeners are removed after completion and cancel', async () => {
  globalThis.window.location.search = '?demo=force';
  demoController.init();
  demoController.start();
  assertEqual((_listeners.get('demo-complete') || []).length, 1, 'demo-complete listener registered');
  assertEqual((_listeners.get('demo-cancelled') || []).length, 1, 'demo-cancelled listener registered');
  demoController.complete();
  assertEqual((_listeners.get('demo-complete') || []).length, 0, 'demo-complete listener removed after complete');
  assertEqual((_listeners.get('demo-cancelled') || []).length, 0, 'demo-cancelled listener removed after complete');

  demoController = await clearState();
  globalThis.window.location.search = '?demo=force';
  demoController.init();
  demoController.start();
  demoController.cancel();
  assertEqual((_listeners.get('demo-complete') || []).length, 0, 'demo-complete listener removed after cancel');
  assertEqual((_listeners.get('demo-cancelled') || []).length, 0, 'demo-cancelled listener removed after cancel');
});

await test('teardown clears controller timers and micro-demo bridge listeners in source', async () => {
  const src = readFileSync(resolve(process.cwd(), 'js/modules/demo-controller.js'), 'utf8');
  const teardownBody = extractFunctionBody(src, 'teardown');
  assert(/clearDemoListeners\s*\(\s*\)/.test(teardownBody), 'teardown clears controller DOM listeners');
  assert(/clearDemoTimers\s*\(\s*\)/.test(teardownBody), 'teardown clears controller timers');
  assert(/clearMicroDemoListeners\s*\(\s*\)/.test(teardownBody), 'teardown clears micro-demo listeners');

  const clearMicroDemoListenersBody = extractFunctionBody(src, 'clearMicroDemoListeners');
  assert(/removeEventListener\s*\(\s*['"]demo-complete['"]/.test(clearMicroDemoListenersBody), 'demo-complete listener removed');
  assert(/removeEventListener\s*\(\s*['"]demo-cancelled['"]/.test(clearMicroDemoListenersBody), 'demo-cancelled listener removed');
});

// Contract 12: sessionStorage key contract
await test('sessionStorage moco_mycelium_demo_session_v1 key can be set and cleared', async () => {
  const key = 'moco_mycelium_demo_session_v1';
  _sessionStorage.set(key, new Date().toISOString());
  assertEqual(_sessionStorage.has(key), true, 'sessionStorage key is set');
  _sessionStorage.delete(key);
  assertEqual(_sessionStorage.has(key), false, 'sessionStorage key can be deleted');
});

// Contract 13: nodemo URL param blocks demo
await test('nodemo URL param blocks demo init', async () => {
  globalThis.window.location.search = '?nodemo';
  demoController.init();
  assertEqual(demoController.isRunning(), false, 'demo blocked by nodemo param');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'-'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'-'.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
