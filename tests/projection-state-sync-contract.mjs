/**
 * projection-state-sync-contract.mjs
 *
 * Focused contract for siloed projection fields not fully exercised
 * by the existing state transition and focus-semantic boundary contracts:
 *   - strandJourney: setStrandContinuityState phase sync to body.dataset
 *   - terrainHandoff: setTerrainHandoffState phase/from/to/routeCount sync
 *   - routeDirector: getRouteDirectorState consistency across view transitions
 *   - semanticDive/trailDepth: mutual consistency of depth and mode flags
 *
 * Run: node tests/projection-state-sync-contract.mjs
 */

/* ─── Minimal DOM shim (matches existing contracts) ─────────────────────────── */

class FakeElement {
    constructor(tag = 'div') {
        this.tagName = tag.toUpperCase();
        this._attr = new Map();
        this.children = [];
        this.dataset = {};
        this._innerHTML = '';
        this._text = '';
        this.hidden = false;
        this.disabled = false;
        this.inert = false;
        this.title = '';
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

const elementsById = new Map();
const fakeBody = new FakeElement('body');

globalThis.document = {
    body: fakeBody,
    getElementById: id => elementsById.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: tag => new FakeElement(tag),
};

globalThis.window = {
    location: { search: '' },
    history: { replaceState: () => {}, pushState: () => {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    requestAnimationFrame: fn => setTimeout(fn, 16),
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
    hideViewHandoff: () => {},
    syncArrivalHandoffOverlay: () => {},
    disposeArrivalHandoffOverlay: () => {},
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
    zoomMap: null,  // map-state.js assigns this; must exist before lifecycle.js import
    resetNodePositions: () => {},
    updateSelectedBusiness: () => {},
};

globalThis.performance = { now: () => Date.now() };

function assert(cond, msg) {
    if (!cond) throw new Error(`FAIL: ${msg}`);
}

function ds(key) {
    return fakeBody.dataset[key];
}

/* ─── Imports ─────────────────────────────────────────────────────────────────── */

const { state } = await import('../js/state.js');
const { refreshCompositionState, updateExplorationUi } = await import('../js/modules/lifecycle.js');
const { setStrandContinuityState, clearStrandContinuityState } = await import('../js/modules/journey.js');
const { setTerrainHandoffState, getRouteDirectorState, syncRouteDirectorState } = await import('../js/modules/map-state.js');

/* ─── Reset helper ────────────────────────────────────────────────────────────── */

function resetState() {
    state.currentView = 'galaxy';
    state.focusedNode = null;
    state.selectedPoint = null;
    state.navState.focusedIndex = null;
    state.navState.mode = 'overview';
    state.navState.trailCursor = -1;
    state.navState.walkHistoryIndices = [];
    state.trailDepth = 0;
    state.semanticDiveMode = false;
    state.currentSearchSummary = null;
    state.activeFilters = { status: 'all', city: 'all', website: false, email: false, geocoded: false };
    state.trailIndices.clear();
    fakeBody.dataset = {};
}

/* ─── Bootstrap minimal DOM ──────────────────────────────────────────────────── */

function bootstrap() {
    elementsById.clear();
    fakeBody.dataset = {};
    fakeBody.dataset.trailDepth = '0';
    fakeBody.dataset.graphContext = 'idle';
    fakeBody.dataset.panelSurface = 'idle';
    fakeBody.dataset.semanticDive = 'inactive';
    fakeBody.dataset.activeView = 'galaxy';
    fakeBody.dataset.trailState = 'inactive';
    fakeBody.dataset.mapContext = 'idle';
    fakeBody.dataset.journeyPhase = 'overview';
    fakeBody.dataset.journeyCompassDensity = 'compact';
    fakeBody.dataset.journeyCompassCopy = 'quiet';
    fakeBody.dataset.journeyNavigationOwner = 'scene';
}

/* ═══════════════════════════════════════════════════════════════════════════════
   CONTRACT TESTS
   ══════════════════════════════════════════════════════════════════════════════ */

console.log('\n=== Projection State Sync Contract ===\n');

/* ─── TEST 1: strandJourney phase sync ──────────────────────────────────────── */

console.log('[TEST 1] strandJourney phase sync');
resetState();
bootstrap();

const phases = ['idle', 'preview', 'pinned', 'exploring', 'arrived', 'returning'];
for (const phase of phases) {
    setStrandContinuityState(phase, {
        targetIndex: phase === 'arrived' ? 7 : null,
        fromIndex: phase === 'arrived' ? 3 : null,
        reason: `test-${phase}`
    });
    assert(ds('strandJourney') === phase,
        `strandJourney phase=${phase}: expected '${phase}', got '${ds('strandJourney')}'`);
    if (phase === 'arrived') {
        assert(ds('strandJourneyTarget') === '7', `strandJourneyTarget should be '7', got '${ds('strandJourneyTarget')}'`);
        assert(ds('strandJourneyFrom') === '3', `strandJourneyFrom should be '3', got '${ds('strandJourneyFrom')}'`);
        assert(ds('strandJourneyReason') === 'test-arrived', `strandJourneyReason should be 'test-arrived', got '${ds('strandJourneyReason')}'`);
    }
}
console.log('  PASS: all strandJourney phases sync correctly\n');

/* ─── TEST 2: refreshCompositionState does not clobber strandJourney ─────────── */

console.log('[TEST 2] strandJourney survives refreshCompositionState');
resetState();
bootstrap();
state.focusedNode = 4;
state.navState.focusedIndex = 4;
setStrandContinuityState('arrived', { targetIndex: 4, fromIndex: 2, reason: 'arrived-from-focus' });
refreshCompositionState();

assert(ds('strandJourney') === 'arrived',
    `strandJourney after refreshCompositionState should be 'arrived', got '${ds('strandJourney')}'`);
assert(ds('strandJourneyTarget') === '4',
    `strandJourneyTarget after refresh should be '4', got '${ds('strandJourneyTarget')}'`);
console.log('  PASS: strandJourney survives refreshCompositionState\n');

/* ─── TEST 3: clearStrandContinuityState resets to idle ──────────────────────── */

console.log('[TEST 3] clearStrandContinuityState');
resetState();
bootstrap();
setStrandContinuityState('arrived', { targetIndex: 5, reason: 'clear-test' });
clearStrandContinuityState('programmatic');
assert(ds('strandJourney') === 'idle', `strandJourney after clear should be 'idle', got '${ds('strandJourney')}'`);
assert(ds('strandJourneyTarget') === '', `strandJourneyTarget after clear should be '', got '${ds('strandJourneyTarget')}'`);
assert(ds('strandJourneyReason') === 'programmatic', `strandJourneyReason should be 'programmatic', got '${ds('strandJourneyReason')}'`);
console.log('  PASS: clearStrandContinuityState resets correctly\n');

/* ─── TEST 4: terrainHandoff phase sync ──────────────────────────────────────── */

console.log('[TEST 4] terrainHandoff phase sync');
resetState();
bootstrap();

setTerrainHandoffState('idle');
assert(ds('terrainHandoff') === 'idle', `terrainHandoff idle: got '${ds('terrainHandoff')}'`);
assert(ds('terrainHandoffFrom') === 'overview', `terrainHandoffFrom default: got '${ds('terrainHandoffFrom')}'`);
assert(ds('terrainHandoffTo') === 'galaxy', `terrainHandoffTo default: got '${ds('terrainHandoffTo')}'`);

setTerrainHandoffState('prelude', { from: 'galaxy', to: 'map', routeCount: 12 });
assert(ds('terrainHandoff') === 'prelude', `terrainHandoff prelude: got '${ds('terrainHandoff')}'`);
assert(ds('terrainHandoffFrom') === 'galaxy', `terrainHandoffFrom: got '${ds('terrainHandoffFrom')}'`);
assert(ds('terrainHandoffTo') === 'map', `terrainHandoffTo: got '${ds('terrainHandoffTo')}'`);
assert(ds('terrainRouteCount') === '12', `terrainRouteCount: got '${ds('terrainRouteCount')}'`);

setTerrainHandoffState('settled', { from: 'galaxy', to: 'map', routeCount: 12 });
assert(ds('terrainHandoff') === 'settled', `terrainHandoff settled: got '${ds('terrainHandoff')}'`);
console.log('  PASS: terrainHandoff phase/from/to/routeCount sync correctly\n');

/* ─── TEST 5: terrainHandoff passes through normalized phase (no whitelist) ─── */

console.log('[TEST 5] terrainHandoff passes through normalized phase without throwing');
resetState();
bootstrap();
// setTerrainHandoffState uses regex replace that passes through alphanumeric+hyphen
// Input "garbage-input" normalizes to "garbage-input" (not thrown, not crash)
setTerrainHandoffState('garbage-input', { from: 'galaxy', to: 'map' });
// The key property: no throw, and the dataset reflects the normalized value
assert(ds('terrainHandoff') === 'garbage-input',
    `terrainHandoff with garbage-input should pass through, got '${ds('terrainHandoff')}'`);
console.log('  PASS: terrainHandoff passes through normalized phase without throwing\n');

/* ─── TEST 6: routeDirector consistency across view transitions ─────────────── */

console.log('[TEST 6] routeDirector consistency across views');
resetState();
bootstrap();

// Galaxy + no focus = overview
let director = getRouteDirectorState();
let synced = syncRouteDirectorState('test');
assert(ds('routeDirector') === director,
    `routeDirector galaxy-overview: dataset='${ds('routeDirector')}' vs getRouteDirectorState()='${director}'`);
assert(synced === director, `syncRouteDirectorState should return '${director}', got '${synced}'`);

// Galaxy + focused node, no search = node-focus
state.focusedNode = 3;
state.navState.focusedIndex = 3;
director = getRouteDirectorState();
synced = syncRouteDirectorState('test');
assert(director === 'node-focus', `expected node-focus, got '${director}'`);
assert(synced === director, `syncRouteDirectorState should return '${director}', got '${synced}'`);
assert(ds('routeDirector') === director,
    `routeDirector node-focus: dataset='${ds('routeDirector')}' vs getRouteDirectorState()='${director}'`);

// Galaxy + focused node + search = search-focus
state.currentSearchSummary = { query: 'cafe', visibleMatches: 4 };
director = getRouteDirectorState();
synced = syncRouteDirectorState('test');
assert(director === 'search-focus', `expected search-focus, got '${director}'`);
assert(synced === director, `syncRouteDirectorState should return '${director}', got '${synced}'`);
assert(ds('routeDirector') === director,
    `routeDirector search-focus: dataset='${ds('routeDirector')}' vs getRouteDirectorState()='${director}'`);

// Galaxy + semanticDiveMode + focus = inside-pocket
state.semanticDiveMode = true;
state.trailDepth = 2;
director = getRouteDirectorState();
synced = syncRouteDirectorState('test');
assert(director === 'inside-pocket', `expected inside-pocket, got '${director}'`);
assert(synced === director, `syncRouteDirectorState should return '${director}', got '${synced}'`);
assert(ds('routeDirector') === director,
    `routeDirector inside-pocket: dataset='${ds('routeDirector')}' vs getRouteDirectorState()='${director}'`);

// Map view + selectedPoint = map-trail
state.semanticDiveMode = false;
state.currentView = 'map';
state.selectedPoint = { lead_id: 'x99', name: 'Beta', cluster: 1 };
director = getRouteDirectorState();
synced = syncRouteDirectorState('test');
assert(director === 'map-trail', `expected map-trail, got '${director}'`);
assert(synced === director, `syncRouteDirectorState should return '${director}', got '${synced}'`);
assert(ds('routeDirector') === director,
    `routeDirector map-trail: dataset='${ds('routeDirector')}' vs getRouteDirectorState()='${director}'`);

// Map view + no selection + no focus = map-overview
state.selectedPoint = null;
state.focusedNode = null;
state.navState.focusedIndex = null;
director = getRouteDirectorState();
synced = syncRouteDirectorState('test');
assert(director === 'map-overview', `expected map-overview, got '${director}'`);
assert(synced === director, `syncRouteDirectorState should return '${director}', got '${synced}'`);
assert(ds('routeDirector') === director,
    `routeDirector map-overview: dataset='${ds('routeDirector')}' vs getRouteDirectorState()='${director}'`);

console.log('  PASS: routeDirector state/dataset sync是一致的 across all view transitions\n');

/* ─── TEST 7: semanticDive trailDepth mutual consistency ────────────────────── */

console.log('[TEST 7] semanticDive/trailDepth mutual consistency');
resetState();
bootstrap();

// trailDepth=0 + no focus → semanticDive inactive
state.semanticDiveMode = false;
state.trailDepth = 0;
state.focusedNode = null;
refreshCompositionState();
updateExplorationUi();
assert(ds('semanticDive') === 'inactive', `trailDepth=0 no-focus: semanticDive should be inactive, got '${ds('semanticDive')}'`);
assert(Number(ds('trailDepth')) === 0, `trailDepth dataset should be '0', got '${ds('trailDepth')}'`);

// trailDepth=2 + focus → semanticDive active
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.trailDepth = 2;
state.semanticDiveMode = true;
refreshCompositionState();
updateExplorationUi();
// updateExplorationUi (called via lifecycle guards) syncs trailDepth to body.dataset
assert(ds('semanticDive') === 'active', `trailDepth=2 + focus: semanticDive should be active, got '${ds('semanticDive')}'`);
assert(Number(ds('trailDepth')) === 2, `trailDepth dataset should be '2', got '${ds('trailDepth')}'`);

// Disable semanticDive → inactive immediately
state.semanticDiveMode = false;
refreshCompositionState();
updateExplorationUi();
assert(ds('semanticDive') === 'inactive', `semanticDiveMode=false: should be inactive, got '${ds('semanticDive')}'`);

// trailDepth without semanticDiveMode (orphan trailDepth) — should not activate semanticDive
// NOTE: do NOT set state.semanticDiveMode = false here — doing so triggers the backward-compat
// setter that resets trailDepth to 0. The semanticDiveMode property is derived from trailDepth
// (getter returns trailDepth === 2), so it only needs to be set when entering dive mode.
state.trailDepth = 3;
// state.semanticDiveMode is already false from prior test; leave it untouched.
// To enter semantic dive, set state.semanticDiveMode = true (which sets trailDepth = 2 via setter).
state.focusedNode = 4;
state.navState.focusedIndex = 4;
refreshCompositionState();
updateExplorationUi();
// semanticDive is driven by semanticDiveMode (which is derived from trailDepth via getter),
// not directly by trailDepth — so orphan trailDepth should not activate semanticDive
assert(ds('semanticDive') === 'inactive',
    `orphan trailDepth=3: semanticDive should stay inactive, got '${ds('semanticDive')}'`);
assert(Number(ds('trailDepth')) === 3,
    `orphan trailDepth should still sync: dataset should be '3', got '${ds('trailDepth')}'`);
console.log('  PASS: semanticDive/trailDepth mutual consistency verified\n');

/* ─── TEST 8: routeDirectorReason is always set ────────────────────────────── */

console.log('[TEST 8] routeDirectorReason populated on every sync');
resetState();
bootstrap();
state.focusedNode = 5;
syncRouteDirectorState('manual-trigger');
const reason = ds('routeDirectorReason');
assert(reason.length > 0, `routeDirectorReason should be set, got '${reason}'`);
assert(/^[a-z0-9-]+$/.test(reason), `routeDirectorReason should be kebab-case, got '${reason}'`);
console.log('  PASS: routeDirectorReason is always kebab-case on sync\n');

/* ─── TEST 9: terrainHandoff idle normalizes empty-from ─────────────────────── */

console.log('[TEST 9] terrainHandoff handles empty options gracefully');
resetState();
bootstrap();
setTerrainHandoffState('prelude', {}); // no from/to
assert(ds('terrainHandoffFrom') !== undefined, `terrainHandoffFrom should be set even with no options`);
assert(ds('terrainHandoffTo') !== undefined, `terrainHandoffTo should be set even with no options`);
console.log('  PASS: terrainHandoff handles empty options gracefully\n');

console.log('All projection-state-sync contracts passed.\n');
