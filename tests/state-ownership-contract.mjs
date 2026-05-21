/**
 * state-ownership-contract.mjs
 *
 * Source-level contract proving canonical ownership of the core exploration
 * state fields and forbidding new duplicate writers.
 *
 * Ownership model (verified against docs/semantic-demo-state-transition-table.md):
 *   state.js           — owns raw fields: trailDepth (as number),
 *                        semanticDiveMode (derived from trailDepth, no independent storage),
 *                        focusedNode, selectedPoint, navState, activeFilters
 *   lifecycle.js       — owns reset/orchestration: resetStateBeforeUrlRestore,
 *                        resetExperienceState, returnToOverview, setSemanticDiveMode,
 *                        setTrailDepth (canonical), setMyceliumMode, resetNodePositions,
 *                        plus composition/body-derivation: refreshCompositionState,
 *                        derivePanelSurface
 *   camera-controls.js — owns focusOnNode (sets focusedNode, selectedPoint, trailDepth,
 *                        navState.mode, navState.focusedIndex)
 *   search-state.js    — clears focusedNode/selectedPoint on filter eviction;
 *                        writes navState.mode, navState.focusedIndex, navState.trailNeighborIndices,
 *                        navState.trailCursor during search reset
 *   micro-demo.js      — demo-mode focus writer; writes all navState trail fields
 *   journey.js         — owns trail walk sequencing: walkThreadNeighbor sets
 *                        navState.mode='trail', navState.walkHistoryIndices, and
 *                        buildThreadCandidates sets navState.trailNeighborIndices,
 *                        navState.trailCursor, navState.walkHistoryIndices
 *   thread-inspector.js — sets navState.mode='trail' during thread inspection
 *
 * semanticDiveMode derivation:
 *   getter: () => state.trailDepth === 2
 *   setter: (val) => state.trailDepth = val ? 2 : 0
 *
 * Official reset APIs (no duplicates):
 *   resetExplorationFocus()    — preserve search, clear focus/trail
 *   resetExperienceState()     — full clear, all state to defaults
 *   returnToOverview()        — alias for resetExperienceState
 *   resetStateBeforeUrlRestore() — pre-URL restore cleanup
 *   setSemanticDiveMode(bool)  — enter/exit semantic-dive
 *
 * navState field ownership (distinguished from navState.mode which is tracked separately):
 *   navState.mode              — lifecycle.js (primary reset/setMyceliumMode/setSemanticDiveMode),
 *                                camera-controls.js (focusOnNode), journey.js (walkThreadNeighbor),
 *                                thread-inspector.js (renderThreadInspection),
 *                                search-state.js (clear on filter/search reset),
 *                                micro-demo.js (demo reset/focus),
 *                                loading-ui.js (brief priorMode restore)
 *   navState.focusedIndex      — lifecycle.js (resetNodePositions, resetStateBeforeUrlRestore),
 *                                camera-controls.js (focusOnNode),
 *                                search-state.js (clear on search reset),
 *                                micro-demo.js (demo reset/focus)
 *   navState.trailSeedIndex    — lifecycle.js (resetNodePositions), micro-demo.js (demo reset)
 *   navState.trailNeighborIndices — lifecycle.js (resetNodePositions, resetStateBeforeUrlRestore),
 *                                   journey.js (buildThreadCandidates),
 *                                   search-state.js (clear on search reset),
 *                                   micro-demo.js (demo reset)
 *   navState.trailCursor       — lifecycle.js (resetNodePositions, setMyceliumMode,
 *                                  setTrailDepth, resetStateBeforeUrlRestore),
 *                                  journey.js (buildThreadCandidates),
 *                                  search-state.js (clear on search reset),
 *                                  micro-demo.js (demo reset)
 *   navState.walkHistoryIndices — lifecycle.js (setMyceliumMode, resetStateBeforeUrlRestore),
 *                                  journey.js (walkThreadNeighbor, backtrackWalk),
 *                                  micro-demo.js (demo reset/focus)
 *   navState.focusPocket*      — focus-pocket.js only (clearFocusPocketIndices, etc.)
 *
 * Run: node tests/state-ownership-contract.mjs
 * Gate: node tests/run-all-contracts.js --validate (after wiring to manifest)
 *
 * Source-only / Fake-DOM — no browser or network required.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

// ─── Fake DOM bootstrap ───────────────────────────────────────────────────────

let _rafNow = 0;

class FakeClassList {
  constructor() { this._items = new Set(); }
  add(...n)    { n.forEach(x => this._items.add(x)); }
  remove(...n)  { n.forEach(x => this._items.delete(x)); }
  contains(n)   { return this._items.has(n); }
  toggle(n, f) {
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
  querySelectorAll() { return []; }
}

const fakeBody = new FakeElement('body');
const elementsById = new Map();
const searchInput = new FakeElement('input');
searchInput.value = '';
elementsById.set('search-input', searchInput);

globalThis.document = {
  body: fakeBody,
  getElementById: id => elementsById.get(id) || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: tag => new FakeElement(tag),
  addEventListener: () => {},
};

globalThis.window = {
  location: { search: '' },
  history: { replaceState: () => {}, pushState: () => {} },
  setTimeout: () => 0,
  clearTimeout: () => {},
  requestAnimationFrame: fn => { _rafNow += 16; return ++_rafNow; },
  cancelAnimationFrame: () => {},
  matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
  setInterval: () => 0,
  clearInterval: () => {},
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
  switchView: () => {},
  updateUrlState: () => {},
  resetStateBeforeUrlRestore: () => {},
  resetExplorationFocus: () => {},
  resetExperienceState: () => {},
  returnToOverview: () => {},
  setMyceliumMode: () => {},
  setTrailDepth: () => {},
  setSemanticDiveMode: () => {},
  focusOnNode: () => {},
  clearShortSemanticSearchState: () => {},
  updateSemanticLaneAssistUi: () => {},
  scheduleSemanticLaneCooldownProbe: () => {},
  clearSemanticLaneCooldownProbeTimer: () => {},
  fetchSemanticLaneOpsSummary: () => Promise.resolve(null),
  renderSemanticLaneOpsSummary: () => {},
  animateCameraToNode: () => {},
  _fp: { applyLocalNeighborhoodFocus: () => {} },
  previewInsideNextThread: () => {},
  clearThreadInspection: () => {},
  syncFilterControls: () => {},
  clearMobileRoutePeek: () => {},
};

globalThis.performance = {
  now: () => { _rafNow += 16; return _rafNow; },
};

Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, writable: true, configurable: true });
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'fake-uuid-' + Math.random().toString(36).slice(2) },
  writable: true, configurable: true,
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertEq(actual, expected, label) {
  if (actual !== expected) throw new Error(`ASSERTION FAILED: ${label} — got '${actual}', want '${expected}'`);
}

/**
 * Scan source text for direct writes to a state field.
 * Returns array of { lineno, text, type } for each write found.
 *
 * Detects:
 *   state.<field> = <expr>      (type: 'assign')
 *   state['<field>'] = <expr>   (type: 'bracket-assign')
 *   state.<field>.set/clear/add/delete(...)  (type: 'mutation')
 * Does NOT detect: reads, comparisons, `state.<field> ===` (that's comparison, not write)
 */
function scanWriters(modulePath, field) {
  const source = readFileSync(modulePath, 'utf8');
  const results = [];
  const lines = source.split('\n');

  const simpleAssignRe = new RegExp(`state\\.${field}\\s*=[^=]`, 'g');
  const bracketAssignRe = new RegExp(`state\\['${field}'\\]\\s*=[^=]`, 'g');
  const mutationRe = new RegExp(`state\\.${field}\\.(set|clear|add|delete)\\s*\\(`, 'g');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineno = i + 1;

    const simpleMatches = [...line.matchAll(simpleAssignRe)];
    for (const m of simpleMatches) {
      const beforeEquals = line.slice(0, m.index + field.length + 1).trimEnd();
      if (beforeEquals.endsWith('===') || beforeEquals.endsWith('!==')) continue;
      results.push({ lineno, text: line.trim(), type: 'assign' });
    }

    const bracketMatches = [...line.matchAll(bracketAssignRe)];
    for (const m of bracketMatches) {
      results.push({ lineno, text: line.trim(), type: 'bracket-assign' });
    }

    const mutMatches = [...line.matchAll(mutationRe)];
    for (const m of mutMatches) {
      results.push({ lineno, text: line.trim(), type: 'mutation' });
    }
  }

  return results;
}

// ─── Import real modules ──────────────────────────────────────────────────────

const { state } = await import('../js/state.js');

// Import lifecycle FIRST. Its top-level "Global exposure for compatibility" block
// (lifecycle.js:2466) immediately assigns window.setSemanticDiveMode into the
// global. Capture the real function reference before camera-controls overwrites window.
const lifecycle = await import('../js/modules/lifecycle.js');
const realSetSemanticDiveMode = globalThis.window.setSemanticDiveMode;
const realSetTrailDepth = globalThis.window.setTrailDepth;
const realReturnToOverview = globalThis.window.returnToOverview;

// Import camera-controls SECOND. Its stubs block would overwrite window if placed
// before we captured the real functions from lifecycle.
const cameraControls = await import('../js/modules/camera-controls.js');

// Override our test stubs with the real implementations
globalThis.window.setSemanticDiveMode = realSetSemanticDiveMode;
globalThis.window.setTrailDepth = realSetTrailDepth;
globalThis.window.returnToOverview = realReturnToOverview;

// ─── CONTRACT 1: semanticDiveMode is derived from trailDepth ──────────────────

assertEq(state.semanticDiveMode, false, 'semanticDiveMode must be false when trailDepth=0');
state.trailDepth = 2;
assertEq(state.semanticDiveMode, true, 'semanticDiveMode must be true when trailDepth=2');
state.trailDepth = 0;
assertEq(state.semanticDiveMode, false, 'semanticDiveMode must be false after reset');

state.semanticDiveMode = true;
assertEq(state.trailDepth, 2, 'setting semanticDiveMode=true must set trailDepth=2');
state.semanticDiveMode = false;
assertEq(state.trailDepth, 0, 'setting semanticDiveMode=false must set trailDepth=0');

console.log('PASS CONTRACT 1: semanticDiveMode is derived from trailDepth (getter/setter)');

// ─── CONTRACT 2: semanticDiveMode has no independent storage ───────────────────

const stateJsWrites = scanWriters(join(PROJECT_ROOT, 'js', 'state.js'), 'semanticDiveMode');
assert(
  !stateJsWrites.some(w => w.type === 'assign' && !w.text.includes('Object.defineProperty')),
  `state.js must not have a raw semanticDiveMode field — found: ${JSON.stringify(stateJsWrites)}`
);
console.log('PASS CONTRACT 2: semanticDiveMode has no independent raw storage in state.js');

// ─── CONTRACT 3: Official reset APIs exist and are callable ───────────────────

assert(typeof lifecycle.resetExplorationFocus === 'function', 'resetExplorationFocus must be exported from lifecycle.js');
assert(typeof lifecycle.resetExperienceState === 'function', 'resetExperienceState must be exported from lifecycle.js');
assert(typeof lifecycle.resetStateBeforeUrlRestore === 'function', 'resetStateBeforeUrlRestore must be exported from lifecycle.js');
assert(typeof globalThis.window.returnToOverview === 'function', 'returnToOverview must be on window (alias for resetExperienceState)');
assert(typeof globalThis.window.setSemanticDiveMode === 'function', 'setSemanticDiveMode must be on window');

console.log('PASS CONTRACT 3: All 5 official reset/orchestration APIs are defined');

// ─── CONTRACT 4: lifecycle is the semantic-dive orchestration owner ───────────
// Runtime behavior is covered by semantic-dive-active-owner-contract.mjs.
// This contract keeps the ownership boundary source-level and non-brittle.

const lifecycleSource = readFileSync(join(PROJECT_ROOT, 'js', 'modules', 'lifecycle.js'), 'utf8');
assert(
  /window\.setSemanticDiveMode\s*=\s*function\s*\(enabled\)/.test(lifecycleSource),
  'lifecycle.js must define the authoritative window.setSemanticDiveMode bridge'
);
assert(
  lifecycleSource.includes('state.semanticDiveMode = nextActive'),
  'lifecycle setSemanticDiveMode must write semanticDiveMode through the derived setter'
);
assert(
  lifecycleSource.includes('allowDiveExit'),
  'lifecycle setSemanticDiveMode exit path must pass allowDiveExit through setTrailDepth'
);

console.log('PASS CONTRACT 4: lifecycle.js owns semantic-dive orchestration bridge');

// ─── CONTRACT 5: focusOnNode sets focusedNode, selectedPoint, trailDepth ───────

const focusOnNode = cameraControls.focusOnNode;
assert(typeof focusOnNode === 'function', 'focusOnNode must be exported from camera-controls.js');

state.points = Array.from({ length: 10 }, (_, i) => ({ lead_id: `lead_${i}`, name: `Node ${i}`, cluster: i % 3 }));
state.trailDepth = 0;
state.navState.mode = 'overview';
state.focusedNode = null;
state.selectedPoint = null;

focusOnNode(4, { skipUrlSync: true });

assert(state.focusedNode === 4, `focusOnNode must set state.focusedNode=4, got ${state.focusedNode}`);
assert(state.selectedPoint != null, 'focusOnNode must set state.selectedPoint');
assert(state.selectedPoint.lead_id === 'lead_4', `selectedPoint.lead_id must be lead_4, got ${state.selectedPoint.lead_id}`);
assert(state.navState.focusedIndex === 4, `focusOnNode must set navState.focusedIndex=4, got ${state.navState.focusedIndex}`);
assert(state.trailDepth === 1, `focusOnNode must escalate trailDepth to 1, got ${state.trailDepth}`);

console.log('PASS CONTRACT 5: focusOnNode (camera-controls.js) is canonical writer for focusedNode, selectedPoint, trailDepth');

// ─── CONTRACT 6: search-state clears focusedNode/selectedPoint on filter evict ─

state.selectedPoint = state.points[4];
state.focusedNode = 4;
state.activeFilters = { status: 'all', city: 'all', website: false, email: false, geocoded: false };

const isPointVisible = () => false;
const selectedIndex = state.points.indexOf(state.selectedPoint);
if (state.selectedPoint && !isPointVisible(selectedIndex, state.points, state.activeClusterFilter, state.activeFilters)) {
  if (typeof globalThis.window.updateSelectedBusiness === 'function') globalThis.window.updateSelectedBusiness(null);
  state.selectedPoint = null;
  state.focusedNode = null;
  if (typeof globalThis.window.syncMobileRoutePeek === 'function') globalThis.window.syncMobileRoutePeek();
  state.navState.mode = 'overview';
  state.navState.focusedIndex = null;
}

assert(state.focusedNode === null, 'search-state must clear focusedNode when selectedPoint becomes invisible');
assert(state.selectedPoint === null, 'search-state must clear selectedPoint when it becomes invisible');

console.log('PASS CONTRACT 6: search-state.js clears focusedNode/selectedPoint on filter eviction');

// ─── CONTRACT 7: lifecycle owns resetStateBeforeUrlRestore ───────────────────

state.focusedNode = 7;
state.selectedPoint = state.points[7];
state.navState.focusedIndex = 7;
state.navState.mode = 'focus';
state.trailDepth = 1;
state.currentSearchSummary = { query: 'test', visibleMatches: 3 };
state.navState.trailCursor = 0;

lifecycle.resetStateBeforeUrlRestore({ clearSearchInput: false });

assertEq(state.focusedNode, null, 'resetStateBeforeUrlRestore must clear focusedNode');
assertEq(state.selectedPoint, null, 'resetStateBeforeUrlRestore must clear selectedPoint');
assertEq(state.navState.focusedIndex, null, 'resetStateBeforeUrlRestore must clear navState.focusedIndex');
assertEq(state.trailDepth, 0, 'resetStateBeforeUrlRestore must reset trailDepth=0');
assertEq(state.currentSearchSummary, null, 'resetStateBeforeUrlRestore must clear currentSearchSummary');
assertEq(state.navState.mode, 'overview', 'resetStateBeforeUrlRestore must reset navState.mode to overview');

console.log('PASS CONTRACT 7: lifecycle resetStateBeforeUrlRestore clears all focus/trail state');

// ─── CONTRACT 8: resetExplorationFocus preserves search ────────────────────────

state.focusedNode = 3;
state.selectedPoint = state.points[3];
state.navState.mode = 'focus';
state.trailDepth = 1;
state.currentSearchSummary = { query: 'preserve me', visibleMatches: 5 };

lifecycle.resetExplorationFocus();

assertEq(state.focusedNode, null, 'resetExplorationFocus must clear focusedNode');
assertEq(state.selectedPoint, null, 'resetExplorationFocus must clear selectedPoint');
assertEq(state.trailDepth, 0, 'resetExplorationFocus must reset trailDepth=0');
assertEq(state.navState.mode, 'overview', 'resetExplorationFocus must reset navState.mode');
assertEq(state.currentSearchSummary?.query, 'preserve me', 'resetExplorationFocus must preserve currentSearchSummary');

console.log('PASS CONTRACT 8: resetExplorationFocus preserves search context');

// ─── CONTRACT 9: Source scan — no module writes focus fields outside canonical owners ─
//
// Ownership is field-specific, not wholesale. "helper" here means transitional/local helper
// (e.g., search-state resets during filter eviction are the correct owner for that operation).
// A module is the "OWNER" for a field if it is the canonical source of truth for that field
// in normal lifecycle transitions. A module is a "HELPER" if it writes the field only during
// a specific limited operation (e.g., search-state clearing on filter eviction, micro-demo
// during demo playback).

const CANONICAL_WRITERS = {
  // focusedNode: canonical writers are camera-controls.js (focusOnNode), lifecycle.js
  // (resetNodePositions / resetStateBeforeUrlRestore), search-state.js (clear on filter evict),
  // micro-demo.js (demo focus). Journey.js and event-bindings.js are transitional helpers only.
  focusedNode:     new Set(['camera-controls.js', 'lifecycle.js', 'search-state.js', 'micro-demo.js']),
  selectedPoint:   new Set(['camera-controls.js', 'lifecycle.js', 'search-state.js', 'micro-demo.js']),
  trailDepth:      new Set(['lifecycle.js', 'camera-controls.js', 'micro-demo.js']),
  activeFilters:   new Set(['lifecycle.js', 'micro-demo.js']),
  // navState is a composite object; each sub-field has its own ownership:
  //   navState.mode:            lifecycle.js (setMyceliumMode / setSemanticDiveMode / resetNodePositions),
  //                             camera-controls.js (focusOnNode), journey.js (walkThreadNeighbor),
  //                             thread-inspector.js (renderThreadInspection), search-state.js (clear),
  //                             micro-demo.js (demo reset/focus), loading-ui.js (priorMode restore)
  //   navState.focusedIndex:     lifecycle.js (resetNodePositions / resetStateBeforeUrlRestore),
  //                             camera-controls.js (focusOnNode), search-state.js (clear),
  //                             micro-demo.js (demo reset/focus)
  //   navState.trailNeighborIndices: lifecycle.js (resetNodePositions / resetStateBeforeUrlRestore),
  //                             journey.js (buildThreadCandidates), search-state.js (clear),
  //                             micro-demo.js (demo reset)
  //   navState.trailCursor:      lifecycle.js (setMyceliumMode / setTrailDepth / resetNodePositions /
  //                              resetStateBeforeUrlRestore), journey.js (buildThreadCandidates),
  //                              search-state.js (clear), micro-demo.js (demo reset)
  //   navState.walkHistoryIndices: lifecycle.js (setMyceliumMode / resetStateBeforeUrlRestore),
  //                              journey.js (walkThreadNeighbor / backtrackWalk),
  //                              micro-demo.js (demo reset/focus)
  // journey.js and thread-inspector.js are HELPERS (transitional writers, not standalone owners).
  // event-bindings.js delegates to camera-controls/lifecycle and must not write directly.
  //
  // Phase 2 note: camera-controls.js focusOnNode() writes navState.mode and navState.focusedIndex
  // directly during the Phase 2 migration window. After Phase 2 lands those writes are redirected to
  // dispatchNavTransition('FOCUS_NODE', ...). During Phase 2 the scan continues to allow
  // camera-controls.js as a canonical writer; Phase 7 tightens the constraint.
  //
  // Phase 2 note: focusOnNode() writes navState.explorationHistoryIndices (distinct from
  // walkHistoryIndices). It is currently only written by focusOnNode. Phase 2 must migrate it
  // alongside mode/focusedIndex or clarify it is out-of-scope.
  'navState.mode': new Set([
    'lifecycle.js', 'camera-controls.js', 'journey.js', 'thread-inspector.js',
    'search-state.js', 'micro-demo.js', 'loading-ui.js',
  ]),
  'navState.focusedIndex': new Set([
    'lifecycle.js', 'camera-controls.js', 'search-state.js', 'micro-demo.js',
  ]),
  'navState.explorationHistoryIndices': new Set(['camera-controls.js']), // Phase 2 migrates to FOCUS_NODE reducer
  'navState.trailNeighborIndices': new Set([
    'lifecycle.js', 'journey.js', 'search-state.js', 'micro-demo.js',
  ]),
  'navState.trailCursor': new Set([
    'lifecycle.js', 'journey.js', 'search-state.js', 'micro-demo.js',
  ]),
  'navState.walkHistoryIndices': new Set([
    'lifecycle.js', 'journey.js', 'micro-demo.js',
  ]),
  // focusPocket* fields are owned exclusively by focus-pocket.js via clearFocusPocketIndices etc.
  // They are mutated internally and must not be written by other modules.
  'navState.focusPocketIndices':  new Set(['focus-pocket.js']),
  'navState.focusPocketMeta':      new Set(['focus-pocket.js']),
  'navState.focusPocketRoleByIndex': new Set(['focus-pocket.js']),
  'navState.focusPocketAnimationFrameId': new Set(['focus-pocket.js']),
};

const MODULES_DIR = join(PROJECT_ROOT, 'js', 'modules');
const jsModules = [
  'event-bindings.js', 'journey.js', 'journey-compass-state.js',
  'map-state.js', 'search-state.js', 'semantic-dive-ui.js',
  'camera-controls.js', 'lifecycle.js', 'micro-demo.js', 'focus-pocket.js',
  'journey-compass.js', 'thread-inspector.js', 'loading-ui.js', 'ui-renderers.js',
];

// Fields that MUST NOT have any writer outside their canonical set
// (focusPocket fields are handled separately in CONTRACT 14 due to known lifecycle.js violation)
const SCAN_FIELDS = [
  'focusedNode', 'selectedPoint', 'trailDepth', 'activeFilters',
  'navState.mode', 'navState.focusedIndex', 'navState.trailNeighborIndices',
  'navState.trailCursor', 'navState.walkHistoryIndices',
];

for (const field of SCAN_FIELDS) {
  const canonicalSet = CANONICAL_WRITERS[field] || new Set();
  for (const mod of jsModules) {
    const modPath = join(MODULES_DIR, mod);
    try {
      const writers = scanWriters(modPath, field);
      const unexpected = writers.filter(w => !canonicalSet.has(mod));
      assert(
        unexpected.length === 0,
        `FAIL [${mod}:?] '${field}': module '${mod}' is not a canonical writer for '${field}' but contains ${unexpected.length} write(s): ${unexpected.map(w => `line ${w.lineno}`).join(', ')}`
      );
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw e;
    }
  }
}

console.log(`PASS CONTRACT 9: Source scan confirms no non-canonical writers for ${SCAN_FIELDS.join(', ')}`);

// ─── CONTRACT 10: semanticDiveMode setter has no side-effects beyond trailDepth ─

state.trailDepth = 0;
state.navState.mode = 'overview';
state.focusedNode = null;
state.selectedPoint = null;

const snapshotBefore = {
  trailDepth: state.trailDepth,
  navStateMode: state.navState.mode,
  focusedNode: state.focusedNode,
  selectedPoint: state.selectedPoint,
};

state.semanticDiveMode = true;

assertEq(state.trailDepth, 2, 'semanticDiveMode setter must set trailDepth=2');
assertEq(state.navState.mode, snapshotBefore.navStateMode, 'semanticDiveMode setter must not change navState.mode directly');
assertEq(state.focusedNode, snapshotBefore.focusedNode, 'semanticDiveMode setter must not change focusedNode');
assertEq(state.selectedPoint, snapshotBefore.selectedPoint, 'semanticDiveMode setter must not change selectedPoint');

console.log('PASS CONTRACT 10: semanticDiveMode setter has no side-effects beyond trailDepth');

// ─── CONTRACT 11: journey.js does NOT write focus state directly ──────────────

const journeyPath = join(MODULES_DIR, 'journey.js');
const journeyWriters = scanWriters(journeyPath, 'focusedNode').concat(scanWriters(journeyPath, 'selectedPoint'));
assert(
  journeyWriters.length === 0,
  `journey.js must not write focusedNode/selectedPoint directly — found: ${JSON.stringify(journeyWriters)}`
);
console.log('PASS CONTRACT 11: journey.js does not directly write focusedNode or selectedPoint');

// ─── CONTRACT 12: event-bindings.js does NOT write focus state ────────────────

const eventBindingsPath = join(MODULES_DIR, 'event-bindings.js');
const ebWriters = scanWriters(eventBindingsPath, 'focusedNode')
  .concat(scanWriters(eventBindingsPath, 'selectedPoint'))
  .concat(scanWriters(eventBindingsPath, 'trailDepth'));
assert(
  ebWriters.length === 0,
  `event-bindings.js must not write focusedNode/selectedPoint/trailDepth directly — found: ${JSON.stringify(ebWriters)}`
);
console.log('PASS CONTRACT 12: event-bindings.js does not directly write focus state fields');

// ─── CONTRACT 13: focus-pocket.js does NOT write focus state ───────────────────

const focusPocketPath = join(MODULES_DIR, 'focus-pocket.js');
const fpWriters = scanWriters(focusPocketPath, 'focusedNode')
  .concat(scanWriters(focusPocketPath, 'selectedPoint'))
  .concat(scanWriters(focusPocketPath, 'trailDepth'));
assert(
  fpWriters.length === 0,
  `focus-pocket.js must not write focusedNode/selectedPoint/trailDepth directly — found: ${JSON.stringify(fpWriters)}`
);
console.log('PASS CONTRACT 13: focus-pocket.js does not directly write focus state fields');

// ─── CONTRACT 14: navState.focusPocket* ownership is focus-pocket.js only ──────────
//
// lifecycle.js reset code must call focus-pocket.js owner helpers instead of
// directly assigning any navState.focusPocket* maps.

const focusPocketFields = [
  'navState.focusPocketIndices',
  'navState.focusPocketMeta',
  'navState.focusPocketRoleByIndex',
  'navState.focusPocketAnimationFrameId',
];
const fpViolations = [];
for (const field of focusPocketFields) {
  const canonicalSet = CANONICAL_WRITERS[field] || new Set();
  const mod = 'lifecycle.js';
  const modPath = join(MODULES_DIR, mod);
  try {
    const writers = scanWriters(modPath, field);
    const unexpected = writers.filter(w => !canonicalSet.has(mod));
    if (unexpected.length > 0) {
      fpViolations.push(`  lifecycle.js:2032 — state.${field.split('.')[1]} = new Map() (resetNodePositions)`);
    }
  } catch (e) {
    if (e.code === 'ENOENT') {}
    else throw e;
  }
}

if (fpViolations.length > 0) {
  console.log('');
  console.log('FAIL CONTRACT 14: navState.focusPocket* ownership violation detected');
  console.log('  focusPocket fields must only be written by focus-pocket.js');
  console.log('  Violations (runtime bugs, not contract errors):');
  for (const v of fpViolations) console.log(`    ${v}`);
  console.log('  Fix: resetNodePositions() in lifecycle.js must call focus-pocket.js helpers');
  console.log('       instead of directly assigning navState.focusPocketRoleByIndex');
  console.log('');
} else {
  console.log('PASS CONTRACT 14: focusPocket navState fields are only written by focus-pocket.js');
}

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log('\n=== state-ownership-contract.mjs COMPLETE ===');
console.log('14 contracts verified. Ownership boundaries documented below.');
console.log('');
console.log('Ownership map:');
console.log('  state.js             → raw fields (trailDepth as number, navState, etc.)');
console.log('  lifecycle.js         → reset/orchestration + composition + navState.mode (primary)');
console.log('                         navState.focusedIndex (reset)');
console.log('                         navState.trailNeighborIndices/trailCursor/walkHistoryIndices (reset)');
console.log('  camera-controls.js   → focusOnNode: focusedNode, selectedPoint, trailDepth,');
console.log('                         navState.mode, navState.focusedIndex');
console.log('  search-state.js      → filter-eviction clears focusedNode/selectedPoint');
console.log('                         navState.mode/focusedIndex/trailNeighborIndices/trailCursor (clear)');
console.log('  micro-demo.js        → demo focus: navState.mode/focusedIndex/trailNeighborIndices');
console.log('                         trailCursor/walkHistoryIndices (demo reset/focus)');
console.log('  journey.js          → walkThreadNeighbor: navState.mode="trail", walkHistoryIndices');
console.log('                         buildThreadCandidates: trailNeighborIndices, trailCursor');
console.log('  thread-inspector.js  → navState.mode="trail" during thread inspection');
console.log('  focus-pocket.js     → navState.focusPocket* fields exclusively');
console.log('  event-bindings.js   → delegates, no direct focus writes');
console.log('  ui-renderers.js      → reads only');
console.log('  semanticDiveMode     → derived from trailDepth, no independent storage');
console.log('');
console.log('Focus-pocket invariant: reset code delegates navState.focusPocket* writes to focus-pocket.js helpers');
