/**
 * focus-semantic-state-boundary-contract.mjs
 *
 * Focused contract for the boundary transitions:
 * focus -> semantic-dive -> map-trail -> reset
 *
 * Target concepts: focusedNode, selectedPoint, navState.focusedIndex,
 * trailDepth, panelSurface, graphContext, semanticDive.
 *
 * Run: node tests/focus-semantic-state-boundary-contract.mjs
 */

let _rafNow = 0;

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
    _rafNow += 16;
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

globalThis.performance = { now: () => { _rafNow += 16; return _rafNow; } };

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function ds(key) {
  return fakeBody.dataset[key];
}

const { state, withStateMutation } = await import('../js/state.ts');

let refreshCompositionState;
try {
  const lc = await import('../js/modules/lifecycle.ts');
  refreshCompositionState = lc.refreshCompositionState;
} catch (e) {
  refreshCompositionState = globalThis.window.refreshCompositionState;
}

assert(typeof refreshCompositionState === 'function', 'refreshCompositionState is callable');

// ── Reset helper ───────────────────────────────────────────────────────────────

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
    state.trailIndices.clear();
  });
  fakeBody.dataset = {};
  _rafNow = 0;
}

function commit(label) {
  refreshCompositionState();
  console.log(`  [${label}] graphContext=${ds('graphContext')} panelSurface=${ds('panelSurface')} semanticDive=${ds('semanticDive')} activeView=${ds('activeView')} trailState=${ds('trailState')}`);
}

// ── CONTRACT TESTS ─────────────────────────────────────────────────────────────

console.log('\n=== Focus-Semantic State Boundary Contract ===\n');

// BOUNDARY 1: focus -> semantic-dive (trailDepth threshold)
console.log('[BOUNDARY 1] focus -> semantic-dive');
resetState();
withStateMutation(() => {
  state.focusedNode = 4;
  state.navState.focusedIndex = 4;
  state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
});
elementsById.set('search-input', new FakeElement('input'));
commit('focus-state');

assert(ds('graphContext') === 'focus-search', 'focus: graphContext is focus-search');
assert(ds('panelSurface') === 'focus-search', 'focus: panelSurface is focus-search');
assert(ds('semanticDive') === 'inactive', 'focus: semanticDive is inactive (trailDepth < 2)');
assert(state.trailDepth === 0, 'focus: trailDepth is 0');
assert(state.semanticDiveMode === false, 'focus: semanticDiveMode is false');
console.log('  PASS: focus state is correct\n');

// Trigger semantic-dive: trailDepth jumps to 2, search context cleared to isolate inside-walk
state.trailDepth = 2;
state.currentSearchSummary = null;
commit('semantic-dive-state');

assert(ds('graphContext') === 'focus', 'semantic-dive: graphContext is focus');
assert(ds('panelSurface') === 'semantic-dive', 'semantic-dive: panelSurface is semantic-dive');
assert(ds('semanticDive') === 'active', 'semantic-dive: semanticDive is active');
assert(state.trailDepth === 2, 'semantic-dive: trailDepth is 2');
assert(state.semanticDiveMode === true, 'semantic-dive: semanticDiveMode is true');
console.log('  PASS: semantic-dive boundary transition correct\n');

// BOUNDARY 2: semantic-dive -> map-trail (view switch)
console.log('[BOUNDARY 2] semantic-dive -> map-trail');
resetState();
withStateMutation(() => {
  state.currentView = 'map';
  state.focusedNode = 4;
  state.navState.focusedIndex = 4;
  state.selectedPoint = { lead_id: 'x123', name: 'Alpha Cafe', cluster: 2 };
  state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
});
elementsById.set('search-input', new FakeElement('input'));
commit('map-trail-state');

assert(ds('activeView') === 'map', 'map-trail: activeView is map');
assert(ds('panelSurface') === 'map-focus-search', 'map-trail: panelSurface is map-focus-search');
assert(ds('semanticDive') === 'inactive', 'map-trail: semanticDive is inactive (map view overrides)');
assert(ds('trailState') === 'active', 'map-trail: trailState is active');
assert(state.selectedPoint !== null, 'map-trail: selectedPoint is set');
console.log('  PASS: map-trail state is correct\n');

// BOUNDARY 2b: map-trail -> semantic-dive reactivation
// Tests the round-trip: semantic-dive enters map view (semanticDive forced inactive),
// then returns to galaxy view (semanticDive must reactivate when trailDepth >= 2 && hasFocus).
// This covers the map-trail -> semantic-dive boundary gap identified in the state machine.
console.log('[BOUNDARY 2b] map-trail -> galaxy (semantic-dive reactivation)');
// Set up semantic-dive state first (trailDepth=2, focusedNode, galaxy view)
withStateMutation(() => {
  state.currentView = 'galaxy';
  state.trailDepth = 2;
  state.currentSearchSummary = null;
  state.focusedNode = 4;
  state.navState.focusedIndex = 4;
  // Ensure semanticDiveMode is set (the getter setter will set trailDepth=2 when true)
  state.semanticDiveMode = true;
});
commit('semantic-dive-active');
assert(ds('semanticDive') === 'active', 'BOUNDARY 2b pre: semanticDive is active in galaxy with trailDepth=2');

// Now switch to map view - semanticDive must be forced inactive
withStateMutation(() => {
  state.currentView = 'map';
});
commit('map-forces-inactive');
assert(ds('activeView') === 'map', 'BOUNDARY 2b: activeView is map');
assert(ds('semanticDive') === 'inactive', 'BOUNDARY 2b: map view forces semanticDive inactive');

// Return to galaxy - semanticDive must reactivate when trailDepth=2 and focusedNode is set
withStateMutation(() => {
  state.currentView = 'galaxy';
  state.trailDepth = 2; // preserve trailDepth
  state.semanticDiveMode = true; // restore (setter will set trailDepth=2)
});
commit('galaxy-reactivates');
assert(ds('activeView') === 'galaxy', 'BOUNDARY 2b: activeView is galaxy on return');
assert(ds('semanticDive') === 'active', 'BOUNDARY 2b: semanticDive re-activates on galaxy return with trailDepth=2');
assert(ds('panelSurface') === 'semantic-dive', 'BOUNDARY 2b: panelSurface is semantic-dive on reactivation');
console.log('  PASS: map-trail -> galaxy semantic-dive reactivation is correct\n');

// BOUNDARY 3: map-trail -> reset (resetStateBeforeUrlRestore)
console.log('[BOUNDARY 3] map-trail -> reset');
resetState();
withStateMutation(() => {
  state.focusedNode = 4;
  state.navState.focusedIndex = 4;
  state.selectedPoint = { lead_id: 'x123', name: 'Alpha Cafe', cluster: 2 };
  state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
  state.trailDepth = 2;
  state.semanticDiveMode = true;
});
elementsById.set('search-input', new FakeElement('input'));
commit('pre-reset');

const { resetStateBeforeUrlRestore } = await import('../js/modules/lifecycle.ts');
resetStateBeforeUrlRestore({ clearSearchInput: true });
commit('post-reset');

assert(state.focusedNode === null, 'reset: focusedNode is null');
assert(state.selectedPoint === null, 'reset: selectedPoint is null');
assert(state.currentSearchSummary === null, 'reset: currentSearchSummary is null');
assert(state.navState.focusedIndex === null, 'reset: focusedIndex is null');
assert(state.trailDepth === 0, 'reset: trailDepth is 0');
assert(state.semanticDiveMode === false, 'reset: semanticDiveMode is false');
assert(ds('graphContext') === 'idle', 'reset: graphContext is idle');
assert(ds('panelSurface') === 'idle', 'reset: panelSurface is idle');
assert(ds('semanticDive') === 'inactive', 'reset: semanticDive is inactive');
console.log('  PASS: reset boundary transition correct\n');

// EDGE: focusedNode null during semantic-dive should not occur but guard
console.log('[EDGE] semantic-dive with no focusedNode');
resetState();
withStateMutation(() => {
  state.focusedNode = null;
  state.navState.focusedIndex = null;
  state.trailDepth = 2;
  state.currentSearchSummary = null;
});
commit('semantic-dive-no-focus');

assert(ds('graphContext') === 'idle', 'semantic-dive-no-focus: graphContext is idle (no focus)');
assert(ds('panelSurface') === 'idle', 'semantic-dive-no-focus: panelSurface is idle');
console.log('  PASS: no-focusedNode during semantic-dive guards correctly\n');

// EDGE: selectedPoint persists after focus exit, cleared only in reset
console.log('[EDGE] selectedPoint persists after focus exit');
resetState();
withStateMutation(() => {
  state.focusedNode = 4;
  state.navState.focusedIndex = 4;
  state.selectedPoint = { lead_id: 'x123', name: 'Alpha Cafe', cluster: 2 };
  state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
});
elementsById.set('search-input', new FakeElement('input'));
// Exit focus by clearing focusedNode but keep selectedPoint + search context
withStateMutation(() => {
  state.focusedNode = null;
  state.navState.focusedIndex = null;
});
commit('focus-exit');

assert(state.selectedPoint !== null, 'focus-exit: selectedPoint persists after focusNode cleared');
// panelSurface stays focus-search because hasSearchIntent is still true (currentSearchSummary)
assert(ds('panelSurface') === 'focus-search', 'focus-exit: panelSurface stays focus-search (search intent holds)');
console.log('  PASS: selectedPoint persists correctly after focus exit\n');

// ── SUMMARY ────────────────────────────────────────────────────────────────────
console.log('All focus-semantic state boundary contracts passed.');
