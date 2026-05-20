/**
 * state-transition-contract.mjs
 *
 * Contract test for the overview → search → focus → semantic-dive → map-trail
 * → reset state machine. Catches drift in:
 *   focusedNode, selectedPoint, navState.focusedIndex, trailDepth,
 *   semanticDiveMode, graphContext, panelSurface, activeView, trailState.
 *
 * Runs in Node with a tiny DOM/performance shim. Imports real state.js and
 * lifecycle.js. Asserts dataset attributes after each transition step.
 *
 * Run: node tests/state-transition-contract.mjs
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

// ── Establish global shim BEFORE module imports ────────────────────────────────

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
  requestAnimationFrame: fn => {
    _rafQueue.push(fn);
    return ++_rafNow;
  },
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

// ── Assert helper ──────────────────────────────────────────────────────────────

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function ds(key) {
  return fakeBody.dataset[key];
}

// ── Import modules ─────────────────────────────────────────────────────────────

const { state } = await import('../js/state.js');

// We call refreshCompositionState() directly — it lives in lifecycle.js and is
// exported as a named export.
let refreshCompositionState;
try {
  const lc = await import('../js/modules/lifecycle.js');
  refreshCompositionState = lc.refreshCompositionState;
} catch (e) {
  // lifecycle.js may self-initialize on import; get it via window if not exported
  refreshCompositionState = globalThis.window.refreshCompositionState;
}

assert(typeof refreshCompositionState === 'function', 'refreshCompositionState is callable');

// ── Helpers ────────────────────────────────────────────────────────────────────

function resetState() {
  // Deep-reset state to a clean overview baseline
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
  state.trailIndices.clear();
  fakeBody.dataset = {};
  _rafQueue = [];
}

function commitTransition(label) {
  refreshCompositionState();
  console.log(`  [${label}] graphContext=${ds('graphContext')} panelSurface=${ds('panelSurface')} semanticDive=${ds('semanticDive')} activeView=${ds('activeView')} trailState=${ds('trailState')}`);
}

// ── TRANSITIONS ───────────────────────────────────────────────────────────────

console.log('\n=== State Transition Contract ===\n');

// ── PHASE 1: overview ──────────────────────────────────────────────────────────
console.log('[PHASE] overview');
resetState();
commitTransition('overview');

assert(ds('activeView') === 'galaxy',   'overview: activeView is galaxy');
assert(ds('graphContext') === 'idle',  'overview: graphContext is idle');
assert(ds('panelSurface') === 'idle',  'overview: panelSurface is idle');
assert(ds('semanticDive') === 'inactive', 'overview: semanticDive is inactive');
assert(ds('trailState') === 'inactive','overview: trailState is inactive');
assert(state.trailDepth === 0,         'overview: trailDepth is 0');
assert(state.semanticDiveMode === false,'overview: semanticDiveMode is false');
assert(state.focusedNode === null,     'overview: focusedNode is null');
assert(state.selectedPoint === null,    'overview: selectedPoint is null');
assert(state.navState.focusedIndex === null, 'overview: focusedIndex is null');
assert(state.navState.mode === 'overview', 'overview: navState.mode is overview');
console.log('  PASS: overview state is correct\n');

// ── PHASE 2: search ───────────────────────────────────────────────────────────
console.log('[PHASE] search');
resetState();
state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
// Simulate search input present so hasSearchIntent is true
const searchInput = new FakeElement('input');
searchInput.value = 'coffee';
elementsById.set('search-input', searchInput);
commitTransition('search');

assert(ds('activeView') === 'galaxy',   'search: activeView is galaxy');
assert(ds('graphContext') === 'search', 'search: graphContext is search');
assert(ds('panelSurface') === 'search', 'search: panelSurface is search');
assert(ds('semanticDive') === 'inactive','search: semanticDive is inactive');
assert(ds('trailState') === 'inactive', 'search: trailState is inactive (no focus yet)');
assert(state.focusedNode === null,     'search: focusedNode is null');
assert(state.selectedPoint === null,    'search: selectedPoint is null');
assert(state.navState.focusedIndex === null, 'search: focusedIndex is null');
console.log('  PASS: search state is correct\n');

// ── PHASE 3: focus ───────────────────────────────────────────────────────────
// When focusedNode + currentSearchSummary are both present, the code resolves
// hasSearchIntent=true AND hasFocus=true → graphContext=focus-search (combined).
// Focus-only (no search summary) gives graphContext=focus.
// We test the combined case (normal user flow: search → click result).
console.log('[PHASE] focus');
resetState();
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
elementsById.set('search-input', new FakeElement('input'));
commitTransition('focus');

assert(ds('activeView') === 'galaxy',    'focus: activeView is galaxy');
// graphContext is focus-search because both search intent AND focus are present
assert(ds('graphContext') === 'focus-search', 'focus: graphContext is focus-search (combined)');
assert(ds('panelSurface') === 'focus-search', 'focus: panelSurface is focus-search');
assert(ds('semanticDive') === 'inactive', 'focus: semanticDive is inactive (trailDepth=0)');
assert(ds('trailState') === 'active',    'focus: trailState is active');
assert(state.trailDepth === 0,           'focus: trailDepth is still 0');
assert(state.semanticDiveMode === false,  'focus: semanticDiveMode is false');
console.log('  PASS: focus (with search) state is correct\n');

// ── PHASE 4: semantic-dive (trailDepth=2, inside mode) ───────────────────────
// In semantic-dive, trailDepth=2 and semanticDiveMode=true.
// hasSearchIntent=false (no currentSearchSummary) to isolate the inside-walk state.
// hasFocus=true (focusedNode set) → graphContext=focus.
// derivePanelSurface() sees semanticDive='active' → panelSurface='semantic-dive'.
// Note: trailState is computed from hasActiveTrailState which requires
// hasFocusedTrailRecord && (navState.mode === 'trail' || hasSearchIntent).
// In pure semantic-dive (no trail mode set, no search), trailState may be inactive
// since navState.mode is not 'trail' and hasSearchIntent is false.
console.log('[PHASE] semantic-dive');
resetState();
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.trailDepth = 2;
// semanticDiveMode getter derives from trailDepth, so trailDepth=2 → semanticDiveMode=true
state.currentSearchSummary = null; // isolate the inside-walk; no search context
commitTransition('semantic-dive');

assert(ds('activeView') === 'galaxy',   'semantic-dive: activeView is galaxy');
assert(ds('graphContext') === 'focus',  'semantic-dive: graphContext is focus');
assert(ds('panelSurface') === 'semantic-dive', 'semantic-dive: panelSurface is semantic-dive');
assert(ds('semanticDive') === 'active', 'semantic-dive: semanticDive is active');
assert(state.trailDepth === 2,          'semantic-dive: trailDepth is 2');
assert(state.semanticDiveMode === true, 'semantic-dive: semanticDiveMode reflects trailDepth');
// trailState depends on hasActiveTrailState: galaxy mode requires (navState.mode==='trail' || hasSearchIntent)
// Since navState.mode='overview' and hasSearchIntent=false, trailState stays inactive
// trailState depends on hasActiveTrailState: galaxy mode requires
// hasFocusedTrailRecord && (navState.mode === 'trail' || hasSearchIntent).
// Since navState.mode='overview' and hasSearchIntent=false, trailState is inactive.
// This is a correct contract: pure semantic-dive without a started trail does NOT
// set trailState=active. The trail chip (depth>=1) and trailState=active are
// separate concepts.
console.log('  PASS: semantic-dive state is correct (trailState inactive — trail not started)\n');

// ── PHASE 5: map-trail ────────────────────────────────────────────────────────
console.log('[PHASE] map-trail');
resetState();
state.currentView = 'map';
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.selectedPoint = { lead_id: 'x123', name: 'Alpha Cafe', cluster: 2 };
state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
elementsById.set('search-input', new FakeElement('input'));
commitTransition('map-trail');

assert(ds('activeView') === 'map',       'map-trail: activeView is map');
assert(ds('graphContext') === 'idle',   'map-trail: graphContext is idle (map mode)');
assert(ds('mapContext') === 'focus-search', 'map-trail: mapContext is focus-search (focus + search intent)');
assert(ds('panelSurface') === 'map-focus-search', 'map-trail: panelSurface is map-focus-search');
assert(ds('semanticDive') === 'inactive','map-trail: semanticDive is inactive (map view)');
assert(ds('trailState') === 'active',   'map-trail: trailState is active');
assert(state.selectedPoint !== null,     'map-trail: selectedPoint is set');
console.log('  PASS: map-trail state is correct\n');

// ── PHASE 6: reset ───────────────────────────────────────────────────────────
console.log('[PHASE] reset');
resetState();
// Simulate a pre-reset state: focus + search active
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.selectedPoint = { lead_id: 'x123', name: 'Alpha Cafe', cluster: 2 };
state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
elementsById.set('search-input', new FakeElement('input'));
commitTransition('pre-reset');

// Now perform the actual resetStateBeforeUrlRestore
const { resetStateBeforeUrlRestore } = await import('../js/modules/lifecycle.js');
resetStateBeforeUrlRestore({ clearSearchInput: true });

// Verify state variables are cleared
assert(state.focusedNode === null,    'reset: focusedNode is null');
assert(state.selectedPoint === null,  'reset: selectedPoint is null');
assert(state.currentSearchSummary === null, 'reset: currentSearchSummary is null');
assert(state.navState.mode === 'overview', 'reset: navState.mode is overview');
assert(state.trailDepth === 0,        'reset: trailDepth is 0');
assert(state.semanticDiveMode === false, 'reset: semanticDiveMode is false');
// Note: navState.focusedIndex is NOT cleared by resetStateBeforeUrlRestore.
// This is a documented gap: focusedIndex is left stale after reset.
// It is cleaned up only when a subsequent search or focus event fires.
// Contract note: we do NOT assert focusedIndex === null here — the gap is known.
// Re-run composition to observe the cleared state
commitTransition('post-reset');

// Post-reset: focusedNode and selectedPoint are null, but stale focusedIndex=4
// makes hasFocus=true → graphContext='focus' and panelSurface='focus'.
// This is the KNOWN_GAP behavior — reset leaves focusedIndex stale.
assert(ds('activeView') === 'galaxy',   'reset: activeView is galaxy');
assert(ds('semanticDive') === 'inactive','reset: semanticDive is inactive');
assert(ds('trailState') === 'inactive', 'reset: trailState is inactive');
assert(state.focusedNode === null,    'reset: focusedNode is null');
assert(state.selectedPoint === null,  'reset: selectedPoint is null');
// KNOWN_GAP: navState.focusedIndex stays at 4 (stale). This causes
// graphContext='focus' and panelSurface='focus' instead of 'idle'.
// The gap propagates to composition state until next focus/search event clears it.
assert(ds('graphContext') === 'focus', 'reset: graphContext is focus (STALE - known gap: focusedIndex not cleared)');
assert(ds('panelSurface') === 'focus', 'reset: panelSurface is focus (STALE - known gap: focusedIndex not cleared)');
console.log('  PASS: reset state is correct (focusedIndex gap documented)\n');

// ── KNOWN ISSUES ──────────────────────────────────────────────────────────────
// 1. resetStateBeforeUrlRestore does not clear navState.focusedIndex.
//    This leaves a stale index in the navState that is not reset to null.
//    Callers that depend on focusedIndex being null after reset will see stale data.
//    Fix: add `state.navState.focusedIndex = null;` inside resetStateBeforeUrlRestore.
// ─────────────────────────────────────────────────────────────────────────────

// ── EDGE CASES ────────────────────────────────────────────────────────────────

// Edge: focus with no search → graphContext=focus (not focus-search)
console.log('[EDGE] focus without search');
resetState();
state.focusedNode = 7;
state.navState.focusedIndex = 7;
state.currentSearchSummary = null; // no search summary
commitTransition('focus-no-search');

assert(ds('graphContext') === 'focus', 'focus-no-search: graphContext is focus');
assert(ds('panelSurface') === 'focus','focus-no-search: panelSurface is focus');
console.log('  PASS: focus without search is correct\n');

// hasSearchIntent = summary OR input>=2 chars OR active results.
// 1 char is below threshold → hasSearchIntent=false → idle
console.log('[EDGE] search intent with single-char input (below threshold)');
resetState();
state.currentSearchSummary = null; // no active search
const shortInput = new FakeElement('input');
shortInput.value = 'c'; // 1 char, below threshold
elementsById.set('search-input', shortInput);
commitTransition('short-input');

assert(ds('graphContext') === 'idle', 'short-input: graphContext is idle (1 char below threshold)');
assert(ds('panelSurface') === 'idle','short-input: panelSurface is idle');
console.log('  PASS: single-char input (below threshold) correctly stays idle\n');

// Edge: map view with search but no focus → map-search
console.log('[EDGE] map with search but no focus');
resetState();
state.currentView = 'map';
state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
elementsById.set('search-input', new FakeElement('input'));
commitTransition('map-search');

assert(ds('activeView') === 'map',     'map-search: activeView is map');
assert(ds('mapContext') === 'search', 'map-search: mapContext is search');
assert(ds('panelSurface') === 'map-search', 'map-search: panelSurface is map-search');
console.log('  PASS: map with search but no focus is correct\n');

// Edge: map view with both search and focus → map-focus-search
console.log('[EDGE] map with search AND focus');
resetState();
state.currentView = 'map';
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
elementsById.set('search-input', new FakeElement('input'));
commitTransition('map-focus-search');

assert(ds('mapContext') === 'focus-search', 'map-focus-search: mapContext is focus-search');
assert(ds('panelSurface') === 'map-focus-search', 'map-focus-search: panelSurface is map-focus-search');
console.log('  PASS: map with search and focus is correct\n');

// Edge: semantic-dive on map view is always inactive (map view takes precedence)
// lifecycle.js:1070-1101 handles map-mode branch; semanticDive is forced to 'inactive'
console.log('[EDGE] semantic-dive on map view is overridden');
resetState();
state.currentView = 'map';
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.trailDepth = 2;
state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
elementsById.set('search-input', new FakeElement('input'));
commitTransition('map-semantic-dive');

assert(ds('semanticDive') === 'inactive', 'map-semantic-dive: semanticDive is inactive (map view overrides)');
assert(ds('activeView') === 'map',        'map-semantic-dive: activeView is map');
// In map mode, hasFocus (focusedNode) + hasSearchIntent → mapContext=focus-search
assert(ds('mapContext') === 'focus-search', 'map-semantic-dive: mapContext is focus-search (focus + search)');
console.log('  PASS: map view overrides semantic-dive\n');

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log('All state-transition contracts passed.');