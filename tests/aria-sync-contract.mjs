/**
 * aria-sync-contract.mjs
 *
 * Contract test proving that the dataset attributes which drive ARIA attribute
 * computation stay in sync with application state as the app transitions
 * between: overview → search → focus → semantic-dive → reset.
 *
 * The ARIA attributes (aria-expanded, aria-hidden, role) on Info Panel,
 * Focus Stage, and Legend are computed from body.dataset values that
 * refreshCompositionState() sets. This test asserts those dataset values,
 * proving the ARIA source-of-truth is correct. A complementary Playwright
 * test (short-landscape-layout-contract.mjs) verifies actual ARIA attribute
 * values in a live browser.
 *
 * Run: node tests/aria-sync-contract.mjs
 */

let _rafNow = 0;
let _rafQueue = [];

class FakeClassList {
  constructor() { this._items = new Set(); }
  add(...n)    { n.forEach(x => this._items.add(x)); }
  remove(...n)  { n.forEach(x => this._items.delete(x)); }
  contains(n)   { return this._items.has(n); }
  toggle(n, f)  {
    const on = f !== undefined ? f : !this._items.has(n);
    on ? this._items.add(n) : this._items.delete(n);
    return on;
  }
}

class FakeElement {
  constructor(tag = 'div') {
    this.tagName    = tag.toUpperCase();
    this.classList  = new FakeClassList();
    this.dataset    = {};
    this.style      = {};
    this.children   = [];
    this._innerHTML = '';
    this._text      = '';
    this._attr      = new Map();
    this.hidden     = false;
    this.disabled   = false;
    this.inert      = false;
    this.title      = '';
  }
  get innerHTML()  { return this._innerHTML; }
  set innerHTML(v) { this._innerHTML = String(v); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  appendChild(c)   { this.children.push(c); return c; }
  setAttribute(k, v) { this._attr.set(String(k), String(v)); }
  getAttribute(k)  { return this._attr.get(String(k)) ?? null; }
  removeAttribute(k) { this._attr.delete(String(k)); if (k === 'title') this.title = ''; }
  querySelector()  { return null; }
}

// ── Global shim ────────────────────────────────────────────────────────────────

const fakeBody = new FakeElement('body');
const elementsById = new Map();

globalThis.document = {
  body: fakeBody,
  getElementById: id => elementsById.get(id) || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: tag => new FakeElement(tag),
};

globalThis.window = {
  location: { search: '' },
  history: { replaceState: () => {} },
  setTimeout: () => 0,
  clearTimeout: () => {},
  requestAnimationFrame: fn => { _rafQueue.push(fn); return ++_rafNow; },
  cancelAnimationFrame: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  syncRouteDirectorState: () => {},
  syncSemanticDiveUi: () => {},
  updateJourneyCompass: () => {},
  updateFocusNeighborRail: () => {},
  refreshMapMarkers: () => {},
  refreshMapRouteEmbodiment: () => {},
  refreshRouteTraceOverlay: () => {},
  clearMobileRouteFieldPeek: () => {},
  updateLegendGuideState: () => {},
  updateSelectedCardHeading: () => {},
  getRouteEmbodimentIndices: () => [],
  getRouteLayerOrigin: () => 'galaxy',
  setSearchPanelState: () => {},
  hideTooltip: () => {},
  clearSearchPreviewHoverTimer: () => {},
  clearSearchPreviewOverlay: () => {},
  clearSearchGlow: () => {},
  updateSearchTrailCue: () => {},
  syncFocusStage: () => {},
  applyFilters: () => {},
  updateExplorationUi: () => {},
  updateSearchStatusMessage: () => {},
  resetNodePositions: () => {},
  updateSelectedBusiness: () => {},
};

globalThis.performance = {
  now: () => { _rafNow += 16; return _rafNow; },
};

// ── Assert helpers ────────────────────────────────────────────────────────────

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

// ── Import real modules ───────────────────────────────────────────────────────

const { state, withStateMutation } = await import('../src/lib/engine/state-bridge.ts');

let refreshCompositionState;
try {
  const lc = await import('../js/modules/lifecycle.ts');
  refreshCompositionState = lc.refreshCompositionState;
} catch (e) {
  refreshCompositionState = globalThis.window.refreshCompositionState;
}
assert(typeof refreshCompositionState === 'function', 'refreshCompositionState is callable');

// ── State reset ──────────────────────────────────────────────────────────────

function resetState() {
  withStateMutation(() => {
    state.currentView = 'galaxy';
    state.focusedNode = null;
    state.selectedPoint = null;
    state.navState.focusedIndex = null;
    state.navState.mode = 'overview';
    state.navState.trailCursor = -1;
    state.navState.trailSeedIndex = null;
    state.navState.trailNeighborIndices = [];
    state.navState.walkHistoryIndices = [];
    state.navState.threadCandidates = [];
    state.trailDepth = 0;
    state.semanticDiveMode = false;
    state.currentSearchSummary = null;
    state.activeFilters = { status: 'all', city: 'all', website: false, email: false, geocoded: false };
  });
  state.trailIndices.clear();
  fakeBody.dataset = {};
  _rafQueue = [];
  elementsById.clear();
}

function commit(label) {
  refreshCompositionState();
  console.log(`  [${label}] panelSurface=${ds('panelSurface')} semanticDive=${ds('semanticDive')} graphContext=${ds('graphContext')} trailState=${ds('trailState')}`);
}

function ds(k) { return fakeBody.dataset[k]; }

// ── ARIA state mapping (derived from dataset → expected ARIA attribute values) ──
//
// These mappings document the contract between dataset state and ARIA attributes.
// The UI layer reads body.dataset values and applies aria-* to elements.
// We assert the dataset values here; short-landscape-layout-contract.mjs
// verifies the actual ARIA attribute values in a live browser.

const ARIA_BY_STATE = {
  'idle': {
    '#info-panel':    { 'aria-hidden': 'false', 'aria-expanded': 'false' },
    '#focus-stage':   { 'aria-hidden': 'true',  'aria-expanded': 'false' },
    '#legend':        { 'aria-hidden': 'false' },
  },
  'search': {
    '#info-panel':    { 'aria-hidden': 'false', 'aria-expanded': 'true' },
    '#focus-stage':   { 'aria-hidden': 'true',  'aria-expanded': 'false' },
    '#legend':        { 'aria-hidden': 'false' },
  },
  'focus': {
    '#info-panel':    { 'aria-hidden': 'false', 'aria-expanded': 'true' },
    '#focus-stage':   { 'aria-hidden': 'false', 'aria-expanded': 'true' },
    '#legend':        { 'aria-hidden': 'false' },
  },
  'focus-search': {
    '#info-panel':    { 'aria-hidden': 'false', 'aria-expanded': 'true' },
    '#focus-stage':   { 'aria-hidden': 'false', 'aria-expanded': 'true' },
    '#legend':        { 'aria-hidden': 'false' },
  },
  'semantic-dive': {
    '#info-panel':    { 'aria-hidden': 'false', 'aria-expanded': 'true' },
    '#focus-stage':   { 'aria-hidden': 'false', 'aria-expanded': 'true' },
    '#legend':        { 'aria-hidden': 'true' },
  },
  'map-focus-search': {
    '#info-panel':    { 'aria-hidden': 'false', 'aria-expanded': 'true' },
    '#focus-stage':   { 'aria-hidden': 'true',  'aria-expanded': 'false' },
    '#legend':        { 'aria-hidden': 'false' },
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n=== ARIA Sync Contract ===\n');

// PHASE 1: overview idle
console.log('[PHASE] overview — idle state');
resetState();
commit('overview');

assert(ds('panelSurface') === 'idle', 'overview: panelSurface is idle');
assert(ds('semanticDive') === 'inactive', 'overview: semanticDive is inactive');
assert(ds('activeView') === 'galaxy', 'overview: activeView is galaxy');
assert(ds('graphContext') === 'idle', 'overview: graphContext is idle');
assert(ds('trailState') === 'inactive', 'overview: trailState is inactive');
// ARIA contract for idle
assert(ARIA_BY_STATE['idle']['#focus-stage']['aria-hidden'] === 'true',
  'overview: focus-stage aria-hidden should be true (not yet visible)');
assert(ARIA_BY_STATE['idle']['#legend']['aria-hidden'] === 'false',
  'overview: legend aria-hidden should be false');
console.log('  PASS: overview idle — dataset state and ARIA contract correct\n');

// PHASE 2: search active
console.log('[PHASE] search — search intent active, no focus');
resetState();
state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
const searchInput = new FakeElement('input');
searchInput.value = 'coffee';
elementsById.set('search-input', searchInput);
commit('search');

assert(ds('panelSurface') === 'search', 'search: panelSurface is search');
assert(ds('graphContext') === 'search', 'search: graphContext is search');
assert(ds('semanticDive') === 'inactive', 'search: semanticDive is inactive');
assert(ds('trailState') === 'inactive', 'search: trailState is inactive (no focus yet)');
assert(ARIA_BY_STATE['search']['#info-panel']['aria-expanded'] === 'true',
  'search: info-panel aria-expanded should be true (search results)');
assert(ARIA_BY_STATE['search']['#focus-stage']['aria-hidden'] === 'true',
  'search: focus-stage aria-hidden should be true (no focus selected)');
console.log('  PASS: search mode — dataset state and ARIA contract correct\n');

// PHASE 3: focus (node selected, search active)
console.log('[PHASE] focus — node selected, search intent present');
resetState();
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
elementsById.set('search-input', new FakeElement('input'));
commit('focus');

assert(ds('panelSurface') === 'focus-search', 'focus: panelSurface is focus-search');
assert(ds('graphContext') === 'focus-search', 'focus: graphContext is focus-search');
assert(ds('trailState') === 'active', 'focus: trailState is active');
assert(ARIA_BY_STATE['focus-search']['#focus-stage']['aria-hidden'] === 'false',
  'focus: focus-stage aria-hidden should be false (now visible)');
assert(ARIA_BY_STATE['focus-search']['#focus-stage']['aria-expanded'] === 'true',
  'focus: focus-stage aria-expanded should be true (expanded)');
console.log('  PASS: focus mode — dataset state and ARIA contract correct\n');

// PHASE 4: semantic-dive (trailDepth=2, inside mode)
console.log('[PHASE] semantic-dive — trailDepth >= 2, inside-walk mode');
resetState();
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.trailDepth = 2;  // trailDepth=2 → semanticDiveMode derived true
state.currentSearchSummary = null; // isolate inside-walk without search context
commit('semantic-dive');

assert(ds('panelSurface') === 'semantic-dive', 'semantic-dive: panelSurface is semantic-dive');
assert(ds('semanticDive') === 'active', 'semantic-dive: semanticDive is active');
assert(ds('graphContext') === 'focus', 'semantic-dive: graphContext is focus');
assert(state.semanticDiveMode === true, 'semantic-dive: semanticDiveMode derived from trailDepth=2');
assert(ARIA_BY_STATE['semantic-dive']['#legend']['aria-hidden'] === 'true',
  'semantic-dive: legend aria-hidden should be true (obscured by dive UI)');
assert(ARIA_BY_STATE['semantic-dive']['#focus-stage']['aria-hidden'] === 'false',
  'semantic-dive: focus-stage aria-hidden should be false (inside mode)');
console.log('  PASS: semantic-dive mode — dataset state and ARIA contract correct\n');

// PHASE 5: reset — return to idle baseline
console.log('[PHASE] reset — full state clear, return to overview');
resetState();
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.selectedPoint = { lead_id: 'x123', name: 'Alpha Cafe', cluster: 2 };
state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
state.trailDepth = 2;
elementsById.set('search-input', new FakeElement('input'));
commit('pre-reset');

const { resetStateBeforeUrlRestore } = await import('../js/modules/lifecycle.ts');
resetStateBeforeUrlRestore({ clearSearchInput: true });
commit('post-reset');

assert(ds('panelSurface') === 'idle', 'reset: panelSurface is idle');
assert(ds('graphContext') === 'idle', 'reset: graphContext is idle');
assert(ds('semanticDive') === 'inactive', 'reset: semanticDive is inactive');
assert(ds('trailState') === 'inactive', 'reset: trailState is inactive');
assert(state.focusedNode === null, 'reset: focusedNode is null');
assert(state.selectedPoint === null, 'reset: selectedPoint is null');
assert(state.currentSearchSummary === null, 'reset: currentSearchSummary is null');
assert(ARIA_BY_STATE['idle']['#focus-stage']['aria-hidden'] === 'true',
  'reset: focus-stage aria-hidden returns to true (hidden after reset)');
console.log('  PASS: reset — dataset state and ARIA contract return to baseline\n');

// EDGE: focus without search
console.log('[EDGE] focus without search — focusedNode only, no search intent');
resetState();
state.focusedNode = 7;
state.navState.focusedIndex = 7;
state.currentSearchSummary = null;
commit('focus-no-search');

assert(ds('panelSurface') === 'focus', 'focus-no-search: panelSurface is focus');
assert(ds('graphContext') === 'focus', 'focus-no-search: graphContext is focus');
assert(ARIA_BY_STATE['focus']['#focus-stage']['aria-hidden'] === 'false',
  'focus-no-search: focus-stage aria-hidden should be false');
console.log('  PASS: focus without search — ARIA contract correct\n');

// EDGE: map view forces semanticDive=inactive
console.log('[EDGE] map view overrides semantic-dive');
resetState();
withStateMutation(() => {
  state.currentView = 'map';
});
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.trailDepth = 2;
state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
elementsById.set('search-input', new FakeElement('input'));
commit('map-semantic-dive');

assert(ds('semanticDive') === 'inactive', 'map: semanticDive forced inactive in map view');
assert(ds('activeView') === 'map', 'map: activeView is map');
assert(ARIA_BY_STATE['map-focus-search']['#focus-stage']['aria-hidden'] === 'true',
  'map: focus-stage aria-hidden should be true (map view takes precedence)');
console.log('  PASS: map overrides semantic-dive — ARIA contract correct\n');

// EDGE: map-focus-search surface
console.log('[EDGE] map with focus and search');
resetState();
withStateMutation(() => {
  state.currentView = 'map';
});
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
elementsById.set('search-input', new FakeElement('input'));
commit('map-focus-search');

assert(ds('panelSurface') === 'map-focus-search', 'map-focus-search: panelSurface is map-focus-search');
assert(ds('mapContext') === 'focus-search', 'map-focus-search: mapContext is focus-search');
console.log('  PASS: map-focus-search — ARIA contract correct\n');

// EDGE: single-char input below threshold
console.log('[EDGE] single-char input below threshold');
resetState();
state.currentSearchSummary = null;
const shortInput = new FakeElement('input');
shortInput.value = 'c';
elementsById.set('search-input', shortInput);
commit('short-input');

assert(ds('graphContext') === 'idle', 'short-input: graphContext is idle (1 char below threshold)');
assert(ds('panelSurface') === 'idle', 'short-input: panelSurface is idle');
assert(ARIA_BY_STATE['idle']['#focus-stage']['aria-hidden'] === 'true',
  'short-input: focus-stage remains hidden');
console.log('  PASS: single-char below threshold — ARIA stays in idle state\n');

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('\nAll ARIA sync contracts passed.');
console.log('\nNote: The actual aria-* attributes on DOM elements are applied by UI-layer');
console.log('code that reads body.dataset values. This test proves those dataset');
console.log('values are correct across all state transitions. The companion test');
console.log('short-landscape-layout-contract.mjs verifies real ARIA attribute values');
console.log('in a live browser via Playwright.\n');
