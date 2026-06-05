/**
 * exploration-modes-contract.mjs
 *
 * Node contract test for lifecycle.js exploration-mode slice.
 * Tests critical integration contracts WITHOUT requiring a browser.
 *
 * Covers:
 *   1. MODE_DESCRIPTIONS and STORY_DESCRIPTIONS are exported constants
 *   2. setMyceliumMode calls recomputeBloomIndices / recomputeBridgeIndices
 *   3. setMyceliumMode side-effects and window call surface
 *   4. setTrailDepth gesture gate for depth=2 (fromUserGesture required)
 *   5. applyStoryPrompt signal-rich mapping (bloom/bridge/default modes)
 *
 * Run from semantic-demo root:
 *   node tests/exploration-modes-contract.mjs
 *   node tests/run-from-semantic-demo.cjs exploration-modes-contract.mjs
 */

// ---------------------------------------------------------------------------
// Minimal DOM/window shim
// ---------------------------------------------------------------------------

const _listeners = new Map();
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
  dispatchEvent(ev)        { document.dispatchEvent(ev); }
  querySelectorAll()        { return []; }
}

const _persistentOverlay = new FakeElement('div');

const FakeDocument = {
  body: new FakeElement('body'),
  documentElement: new FakeElement('html'),
  querySelector: () => null,
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
};

globalThis.document = FakeDocument;

let _clockNow = Date.now();

globalThis.window = {
  location: { search: '', pathname: '/', href: 'http://localhost/' },
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  matchMedia: (q) => ({ matches: false, media: q }),
  performance: { now: () => _clockNow },
  history: { pushState: () => {}, replaceState: () => {}, state: {} },
  setTimeout: (fn, delay = 0) => { const id = ++_timerId; _timers.set(id, { fn, delay, start: _clockNow }); return id; },
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
  // Window functions that lifecycle.js calls
  applyPointFilterColors: () => {},
  updateExplorationUi: () => {},
  updateUrlState: () => {},
  updateCityFilter: () => {},
  syncCityFilterUi: () => {},
  clearShortSemanticSearchState: () => {},
  clearSearchGlow: () => {},
  applyFilters: () => {},
  syncFilterControls: () => {},
  syncSemanticDiveUi: () => {},
  updateJourneyCompass: () => {},
  setTrailDepth: null,    // set dynamically
  findClusterByKeyword: () => null,
  navigator: { clipboard: { writeText: () => Promise.resolve() } },
};

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

// ---------------------------------------------------------------------------
// Load lifecycle module
// ---------------------------------------------------------------------------
const _basePath = 'file://' + process.cwd().replace(/\\/g, '/') + '/js/modules/lifecycle.js';
let lifecycle;
try {
  const mod = await import(_basePath);
  lifecycle = mod;
} catch (err) {
  console.error('Could not import lifecycle.js:', err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Contract tests
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

async function test(name, fn) {
  _dispatchedEvents.length = 0;
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

// Helper to create minimal state for testing
function makeTestState(overrides = {}) {
  return {
    points: [],
    signalScores: [],
    bloomIndices: new Set(),
    bridgeIndices: new Set(),
    bridgeScores: [],
    activeFilters: { status: 'all', city: 'all', website: false, email: false, geocoded: false },
    activeClusterFilter: null,
    activeStoryPrompt: null,
    myceliumMode: 'default',
    trailDepth: 0,
    focusedNode: null,
    currentView: 'galaxy',
    camera: null,
    renderer: null,
    originalPositions: [],
    navState: { mode: 'overview', trailCursor: -1, explorationHistoryIndices: [], walkHistoryIndices: [], threadCandidates: [] },
    restoringBrowserHistory: false,
    currentSearchSummary: null,
    ...overrides
  };
}

// Contract 1: MODE_DESCRIPTIONS is a non-empty exported object
await test('MODE_DESCRIPTIONS is exported and non-empty', () => {
  assert(typeof lifecycle.MODE_DESCRIPTIONS === 'object', 'MODE_DESCRIPTIONS is an object');
  assert(Object.keys(lifecycle.MODE_DESCRIPTIONS).length > 0, 'MODE_DESCRIPTIONS has keys');
  assert(typeof lifecycle.MODE_DESCRIPTIONS.default === 'string', 'MODE_DESCRIPTIONS.default is a string');
  assert(typeof lifecycle.MODE_DESCRIPTIONS.bloom === 'string', 'MODE_DESCRIPTIONS.bloom is a string');
  assert(typeof lifecycle.MODE_DESCRIPTIONS.bridge === 'string', 'MODE_DESCRIPTIONS.bridge is a string');
  assert(typeof lifecycle.MODE_DESCRIPTIONS.trail === 'string', 'MODE_DESCRIPTIONS.trail is a string');
});

// Contract 2: STORY_DESCRIPTIONS is a non-empty exported object
await test('STORY_DESCRIPTIONS is exported and non-empty', () => {
  assert(typeof lifecycle.STORY_DESCRIPTIONS === 'object', 'STORY_DESCRIPTIONS is an object');
  assert(Object.keys(lifecycle.STORY_DESCRIPTIONS).length > 0, 'STORY_DESCRIPTIONS has keys');
  assert(typeof lifecycle.STORY_DESCRIPTIONS['signal-rich'] === 'string', 'STORY_DESCRIPTIONS has signal-rich entry');
});

// Contract 3b: setTrailDepth source has explicit gate for depth=2 escalation
await test('setTrailDepth source has explicit fromUserGesture gate for depth=2', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('js/modules/lifecycle.js', 'utf8');
  // Gate: enteringSemanticDive is derived from nextDepth/prevDepth and requires fromUserGesture.
  const hasGate = /const\s+enteringSemanticDive\s*=\s*nextDepth\s*===\s*2\s*&&\s*prevDepth\s*<\s*2/.test(src)
    && /if\s*\(\s*enteringSemanticDive\s*&&\s*!options\.fromUserGesture\s*\)\s*\{[\s\S]*?return/.test(src);
  assert(hasGate, 'setTrailDepth has explicit gesture gate for depth=2 escalation');
});

// Contract 4: applyStoryPrompt sets up signal-rich → bloom mapping
await test('applyStoryPrompt source maps signal-rich to bloom mode', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('js/modules/lifecycle.js', 'utf8');
  // story === 'signal-rich' → setMyceliumMode('bloom', ...)
  const hasSignalRichBloom = /story\s*===\s*['"]signal-rich['"]\s*[\s\S]*?setMyceliumMode\s*\(\s*['"]bloom['"]/.test(src);
  assert(hasSignalRichBloom, 'signal-rich story maps to bloom mode');
  // story === 'bridge-businesses' → setMyceliumMode('bridge', ...)
  const hasBridgeBusinessBridge = /story\s*===\s*['"]bridge-businesses['"]\s*[\s\S]*?setMyceliumMode\s*\(\s*['"]bridge['"]/.test(src);
  assert(hasBridgeBusinessBridge, 'bridge-businesses story maps to bridge mode');
  // story === 'mapped-food' → sets geocoded filter
  const hasMappedFood = /story\s*===\s*['"]mapped-food['"]/.test(src);
  assert(hasMappedFood, 'mapped-food story is handled');
});

// Contract 5: setMyceliumMode calls recomputeBloomIndices when mode=bloom
await test('setMyceliumMode source calls recomputeBloomIndices for bloom mode', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('js/modules/lifecycle.js', 'utf8');
  // if (mode === 'bloom') { recomputeBloomIndices(); }
  const hasBloomRecompute = /if\s*\(\s*mode\s*===\s*['"]bloom['"]\s*\)\s*\{[\s\S]*?recomputeBloomIndices\s*\(\s*\)/.test(src);
  assert(hasBloomRecompute, 'setMyceliumMode calls recomputeBloomIndices for bloom');
  // if (mode === 'bridge') { recomputeBridgeIndices(); }
  const hasBridgeRecompute = /if\s*\(\s*mode\s*===\s*['"]bridge['"]\s*\)\s*\{[\s\S]*?recomputeBridgeIndices\s*\(\s*\)/.test(src);
  assert(hasBridgeRecompute, 'setMyceliumMode calls recomputeBridgeIndices for bridge');
});

// Contract 6: setMyceliumMode calls direct owner imports instead of window UI bridges
await test('setMyceliumMode source calls direct applyPointFilterColors and updateExplorationUi owners', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('js/modules/lifecycle.js', 'utf8');
  const setMyceliumModeBody = src.match(/export function setMyceliumMode\s*\([^)]*\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const importsApplyColors = /import\s*\{[\s\S]*?applyPointFilterColors[\s\S]*?\}\s*from\s*['"]\.\/journey\.js['"]/.test(src);
  const hasApplyColors = /(?<!window\.)applyPointFilterColors\s*\(/.test(setMyceliumModeBody);
  const hasUpdateExplorationUi = /(?<!window\.)updateExplorationUi\s*\(/.test(setMyceliumModeBody);
  assert(importsApplyColors, 'lifecycle imports applyPointFilterColors from journey owner');
  assert(hasApplyColors, 'setMyceliumMode calls direct applyPointFilterColors owner');
  assert(hasUpdateExplorationUi, 'setMyceliumMode calls direct updateExplorationUi owner');
  assert(!/window\.(applyPointFilterColors|updateExplorationUi)\s*\(/.test(setMyceliumModeBody), 'setMyceliumMode avoids window UI bridge calls');
});

// Contract 7: applyStoryPrompt resets activeFilters and activeClusterFilter
// Routes through filter-state owner APIs (resetActiveFilters / setActiveClusterFilter),
// which keep state AND the Svelte store in sync (see state-store-sync-contract.mjs).
await test('applyStoryPrompt source resets activeFilters and activeClusterFilter', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('js/modules/lifecycle.js', 'utf8');
  const applyStoryPromptBody = src.match(/export function applyStoryPrompt\s*\([^)]*\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const hasFilterReset = /resetActiveFilters\s*\(/.test(applyStoryPromptBody)
    || /state\.activeFilters\s*=\s*\{[\s\S]*?status:\s*['"]all['"]/.test(applyStoryPromptBody);
  const hasClusterReset = /setActiveClusterFilter\s*\(\s*null\s*\)/.test(applyStoryPromptBody)
    || /state\.activeClusterFilter\s*=\s*null/.test(applyStoryPromptBody);
  assert(hasFilterReset, 'applyStoryPrompt resets activeFilters (via resetActiveFilters or direct)');
  assert(hasClusterReset, 'applyStoryPrompt resets activeClusterFilter (via setActiveClusterFilter(null) or direct)');
});

// Contract 8: setMyceliumMode('trail') calls the direct trailDepth owner
await test('setMyceliumMode(\'trail\') source calls direct setTrailDepth(1, ...)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('js/modules/lifecycle.js', 'utf8');
  const setMyceliumModeBody = src.match(/export function setMyceliumMode\s*\([^)]*\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const hasTrailDepth1 = /mode\s*===\s*['"]trail['"][\s\S]*?(?<!window\.)setTrailDepth\s*\(\s*1\s*,/.test(setMyceliumModeBody);
  assert(hasTrailDepth1, 'setMyceliumMode with trail mode calls direct setTrailDepth(1, ...)');
  assert(!/window\.setTrailDepth\s*\(/.test(setMyceliumModeBody), 'setMyceliumMode avoids the window.setTrailDepth bridge');
});

// Contract 9: setMyceliumMode('inside') calls the direct trailDepth owner
await test('setMyceliumMode(\'inside\') source calls direct setTrailDepth(2, { fromUserGesture: true })', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('js/modules/lifecycle.js', 'utf8');
  const setMyceliumModeBody = src.match(/export function setMyceliumMode\s*\([^)]*\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const hasTrailDepth2 = /mode\s*===\s*['"]inside['"][\s\S]*?(?<!window\.)setTrailDepth\s*\(\s*2\s*,[\s\S]*?fromUserGesture:\s*true/.test(setMyceliumModeBody);
  assert(hasTrailDepth2, 'setMyceliumMode with inside mode calls direct setTrailDepth(2, { fromUserGesture: true })');
  assert(!/window\.setTrailDepth\s*\(/.test(setMyceliumModeBody), 'setMyceliumMode avoids the window.setTrailDepth bridge');
});

// Contract 10: setMyceliumMode publishes VIEW_CHANGED event
await test('setMyceliumMode source publishes VIEW_CHANGED event', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('js/modules/lifecycle.js', 'utf8');
  const setMyceliumModeBody = src.match(/export function setMyceliumMode\s*\([^)]*\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const hasEventPublish = /publish\s*\(\s*EVENTS\.VIEW_CHANGED\s*,\s*\{[\s\S]*?myceliumMode:\s*mode\s*\}\s*\)/.test(setMyceliumModeBody);
  assert(hasEventPublish, 'setMyceliumMode publishes VIEW_CHANGED event');
  assert(!/updateUrlState\s*\(/.test(setMyceliumModeBody), 'setMyceliumMode avoids direct updateUrlState call');
});

// Contract 11: applyStoryPrompt refreshes filter controls and reapplies filters
await test('applyStoryPrompt source refreshes filters after story prompt changes', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('js/modules/lifecycle.js', 'utf8');
  const applyStoryPromptBody = src.match(/export function applyStoryPrompt\s*\([^)]*\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const hasSyncFilters = /syncFilterControls\s*\(/.test(applyStoryPromptBody);
  const hasApplyFilters = /(?<!window\.)applyFilters\s*\(/.test(applyStoryPromptBody);
  assert(hasSyncFilters, 'applyStoryPrompt calls syncFilterControls');
  assert(hasApplyFilters, 'applyStoryPrompt calls direct applyFilters owner');
  assert(!/window\.applyFilters\s*\(/.test(applyStoryPromptBody), 'applyStoryPrompt avoids window.applyFilters bridge');
});

// Contract 12: recomputeBloomIndices source exists and references bloomIndices
await test('recomputeBloomIndices source references state.bloomIndices', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('js/modules/lifecycle.js', 'utf8');
  const hasBloomIndices = /state\.bloomIndices/.test(src);
  assert(hasBloomIndices, 'recomputeBloomIndices references state.bloomIndices');
});

// Contract 13: recomputeBridgeIndices source exists and references bridgeIndices
await test('recomputeBridgeIndices source references state.bridgeIndices', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('js/modules/lifecycle.js', 'utf8');
  const hasBridgeIndices = /state\.bridgeIndices/.test(src);
  assert(hasBridgeIndices, 'recomputeBridgeIndices references state.bridgeIndices');
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${'-'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${'-'.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
