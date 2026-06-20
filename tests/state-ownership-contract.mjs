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
 *   lifecycle.js       — owns reset/orchestration and nav transition reduction:
 *                        dispatchNavTransition('FOCUS_NODE') writes navState.mode,
 *                        navState.focusedIndex, and navState.explorationHistoryIndices;
 *                        resetStateBeforeUrlRestore,
 *                        resetExperienceState, returnToOverview, setSemanticDiveMode,
 *                        setTrailDepth (canonical), setMyceliumMode, resetNodePositions,
 *                        plus composition/body-derivation: refreshCompositionState,
 *                        derivePanelSurface
 *   camera-controls.js — owns focusOnNode (sets focusedNode/selectedPoint and delegates
 *                        navState/history writes to dispatchNavTransition('FOCUS_NODE'));
 *                        requests trailDepth/myceliumMode through lifecycle setters
 *   search-state.js    — clears focusedNode/selectedPoint on filter eviction;
 *                        routes nav reset/trail clear through lifecycle/navigation owner APIs
 *   micro-demo.js      — demo-mode focus writer; writes all navState trail fields
 *   journey.js         — owns trail walk sequencing: walkThreadNeighbor routes
 *                        WALK_TO through lifecycle dispatchNavTransition,
 *                        setTrailFromSeed computes candidates and calls setTrailNavState
 *   thread-inspector.js — routes thread-neighbor exploration through
 *                        lifecycle dispatchNavTransition('WALK_TO')
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
 *   navState.mode              — lifecycle.js (primary reset/setMyceliumMode/setSemanticDiveMode/
 *                                dispatchNavTransition),
 *                                search-state.js (clear on filter/search reset),
 *                                micro-demo.js (demo reset/focus),
 *                                loading-ui.js (brief priorMode restore)
 *   navState.focusedIndex      — lifecycle.js (resetNodePositions, resetStateBeforeUrlRestore,
 *                                dispatchNavTransition),
 *                                search-state.js (clear on search reset),
 *                                micro-demo.js (demo reset/focus)
 *   navState.trailSeedIndex    — navigation-state.js (setTrailNavState setter / clearTrailThreadState),
 *                                lifecycle.js (resetNodePositions), micro-demo.js (demo reset)
 *   navState.trailNeighborIndices — navigation-state.js (setTrailNavState setter / clearTrailThreadState),
 *                                   lifecycle.js (resetNodePositions, resetStateBeforeUrlRestore),
 *                                   journey.js (setTrailNavState setter call),
 *                                   micro-demo.js (demo reset)
 *   navState.trailCursor       — navigation-state.js (setTrailNavState setter / clearTrailThreadState),
 *                                lifecycle.js (resetNodePositions, setMyceliumMode,
 *                                setTrailDepth, resetStateBeforeUrlRestore),
 *                                journey.js (setTrailNavState setter call),
 *                                micro-demo.js (demo reset)
 *   navState.threadCandidates  — navigation-state.js (setTrailNavState setter / clearTrailThreadState),
 *                                journey.js (setTrailNavState setter call)
 *   navState.threadReasonByIndex — navigation-state.js (setTrailNavState setter / clearTrailThreadState),
 *                                  journey.js (setTrailNavState setter call)
 *   navState.threadSource      — navigation-state.js (setTrailNavState setter / clearTrailThreadState),
 *                                journey.js (setTrailNavState setter call)
 *   navState.walkHistoryIndices — lifecycle.js (setMyceliumMode, resetStateBeforeUrlRestore,
 *                                  dispatchNavTransition WALK_TO/BACKTRACK),
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
const STATE_SOURCE_PATH = join(PROJECT_ROOT, 'src', 'lib', 'state', 'app.svelte.ts');
const ORCHESTRATION_LIFECYCLE_PATH = join(PROJECT_ROOT, 'src', 'lib', 'orchestration', 'lifecycle.ts');
const JOURNEY_PATH = join(PROJECT_ROOT, 'src', 'lib', 'journey', 'journey.ts');
const EVENT_BINDINGS_PATH = join(PROJECT_ROOT, 'src', 'lib', 'ui', 'event-bindings.ts');
const FOCUS_POCKET_PATH = join(PROJECT_ROOT, 'src', 'lib', 'focus', 'pocket.ts');

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

const { state, withStateMutation } = await import('../src/lib/engine/state-bridge.ts');

const lifecycle = await import('../src/lib/orchestration/lifecycle.ts');

const cameraControls = await import('../src/lib/engine/camera-controls.ts');

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

const stateSource = readFileSync(STATE_SOURCE_PATH, 'utf8');
const stateJsWrites = scanWriters(STATE_SOURCE_PATH, 'semanticDiveMode');
assert(
  !/\bsemanticDiveMode\s*=\s*\$state\b/.test(stateSource) &&
    /get\s+semanticDiveMode\s*\(\)\s*:\s*boolean/.test(stateSource) &&
    /set\s+semanticDiveMode\s*\(\s*active:\s*boolean\s*\)/.test(stateSource),
  `app.svelte.ts must expose semanticDiveMode as a compatibility getter/setter, not raw $state — found writes: ${JSON.stringify(stateJsWrites)}`
);
console.log('PASS CONTRACT 2: semanticDiveMode has no independent raw storage in app.svelte.ts');

// ─── CONTRACT 3: Official reset APIs exist and are callable ───────────────────

assert(typeof lifecycle.resetExplorationFocus === 'function', 'resetExplorationFocus must be exported from lifecycle.ts');
assert(typeof lifecycle.resetExperienceState === 'function', 'resetExperienceState must be exported from lifecycle.ts');
assert(typeof lifecycle.resetStateBeforeUrlRestore === 'function', 'resetStateBeforeUrlRestore must be exported from lifecycle.ts');
assert(typeof lifecycle.returnToOverview === 'function', 'returnToOverview must be exported from lifecycle.ts');
assert(typeof lifecycle.setSemanticDiveMode === 'function', 'setSemanticDiveMode must be exported from lifecycle.ts');

console.log('PASS CONTRACT 3: All 5 official reset/orchestration APIs are defined');

// ─── CONTRACT 4: lifecycle is the semantic-dive orchestration owner ───────────
// Runtime behavior is covered by semantic-dive-active-owner-contract.mjs.
// This contract keeps the ownership boundary source-level and non-brittle.

const lifecycleSource = readFileSync(ORCHESTRATION_LIFECYCLE_PATH, 'utf8');
assert(
  !/window\.setSemanticDiveMode\s*=/.test(lifecycleSource),
  'orchestration lifecycle must not expose setSemanticDiveMode through a window bridge'
);
assert(
  lifecycleSource.includes('setFocusDiveMode(nextActive)'),
  'lifecycle semantic dive proxy must route focus-store semanticDiveMode state through the focus owner'
);
const semanticDiveBody = lifecycleSource.slice(
  lifecycleSource.indexOf('export function setSemanticDiveModeProxy'),
  lifecycleSource.indexOf('\n// ── Hydrate Lead Context')
);
assert(
  /(?<!window\.)setTrailDepth\s*\(/.test(semanticDiveBody),
  'lifecycle setSemanticDiveMode must call setTrailDepth directly'
);
assert(
  !/window\.setTrailDepth\s*\(/.test(semanticDiveBody),
  'lifecycle setSemanticDiveMode must not call setTrailDepth through window'
);

console.log('PASS CONTRACT 4: orchestration lifecycle owns semantic-dive orchestration bridge');

// ─── CONTRACT 5: focusOnNode sets focusedNode, selectedPoint, trailDepth ───────

const focusOnNode = cameraControls.focusOnNode;
assert(typeof focusOnNode === 'function', 'focusOnNode must be exported from camera-controls.ts');

const focusOnNodeSource = readFileSync(join(PROJECT_ROOT, 'src', 'lib', 'engine', 'camera-choreography', 'cursor.ts'), 'utf8');
assert(
  /export function focusOnNode/.test(focusOnNodeSource),
  'focusOnNode must be owned by camera-choreography/cursor.ts'
);
assert(
  /appState\.selectedPoint\s*=\s*point/.test(focusOnNodeSource),
  'focusOnNode must set selectedPoint through appState'
);
assert(
  /dispatchNavTransition\s*\(\s*NAV_TRANSITION_ACTIONS\.FOCUS_NODE/.test(focusOnNodeSource),
  'focusOnNode must delegate focused index/mode through FOCUS_NODE nav transition'
);
assert(
  /setTrailDepth\s*\(\s*1,\s*\{\s*skipUrlSync:\s*true\s*\}/.test(focusOnNodeSource),
  'focusOnNode must escalate trailDepth to 1 through lifecycle setter'
);

console.log('PASS CONTRACT 5: focusOnNode is canonical writer for selectedPoint and delegates focus index through navState');

// ─── CONTRACT 6: search-state clears focusedNode/selectedPoint on filter evict ─

const urlStateSource = readFileSync(join(PROJECT_ROOT, 'src', 'lib', 'orchestration', 'url-state.ts'), 'utf8');
const searchLegacySource = readFileSync(join(PROJECT_ROOT, 'src', 'lib', 'search', 'legacy-exports.ts'), 'utf8');
assert(
  /export function clearExplorationFocusSelection/.test(urlStateSource) &&
    /appState\.focusedNode\s*=\s*null/.test(urlStateSource) &&
    /appState\.selectedPoint\s*=\s*null/.test(urlStateSource),
  'clearExplorationFocusSelection must clear focusedNode and selectedPoint through the current focus-clear owner'
);
assert(
  /_legacyState\.selectedPoint\s*=\s*null/.test(searchLegacySource),
  'search legacy exports must clear selectedPoint when filter/search invalidates current focus'
);

console.log('PASS CONTRACT 6: search-state.js clears focusedNode/selectedPoint on filter eviction');

// ─── CONTRACT 7: lifecycle owns resetStateBeforeUrlRestore ───────────────────

state.focusedNode = 7;
state.selectedPoint = state.points[7];
withStateMutation(() => { state.navState.focusedIndex = 7; state.navState.mode = 'focus'; });
state.trailDepth = 1;
state.currentSearchSummary = { query: 'test', visibleMatches: 3 };
withStateMutation(() => { state.navState.trailCursor = 0; });

lifecycle.resetStateBeforeUrlRestore({ clearSearchInput: false });

assertEq(state.focusedNode, null, 'resetStateBeforeUrlRestore must clear focusedNode');
assertEq(state.selectedPoint, null, 'resetStateBeforeUrlRestore must clear selectedPoint');
assertEq(state.navState.focusedIndex, null, 'resetStateBeforeUrlRestore must clear navState.focusedIndex');
assertEq(state.trailDepth, 0, 'resetStateBeforeUrlRestore must reset trailDepth=0');
assertEq(state.currentSearchSummary, null, 'resetStateBeforeUrlRestore must clear currentSearchSummary');
assertEq(state.navState.mode, 'overview', 'resetStateBeforeUrlRestore must reset navState.mode to overview');

console.log('PASS CONTRACT 7: lifecycle resetStateBeforeUrlRestore clears all focus/trail state');

// ─── CONTRACT 8: resetExplorationFocus preserves search ────────────────────────

state.selectedPoint = state.points[3];
withStateMutation(() => { state.navState.focusedIndex = 3; state.navState.mode = 'focus'; });
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
  focusedNode:     new Set(['camera-controls.ts', 'lifecycle.ts', 'search-state.ts', 'micro-demo.ts']),
  selectedPoint:   new Set(['camera-controls.ts', 'lifecycle.ts', 'search-state.ts', 'micro-demo.ts']),
  trailDepth:      new Set(['lifecycle.ts', 'camera-controls.ts', 'micro-demo.ts']),
  activeFilters:   new Set(['filter-state.ts', 'lifecycle.ts', 'micro-demo.ts']),
  // navState is a composite object; each sub-field has its own ownership:
  //   navState.mode:            lifecycle.js (setMyceliumMode / setSemanticDiveMode / resetNodePositions /
  //                             dispatchNavTransition), search-state.js (clear),
  //                             micro-demo.js (demo reset/focus), loading-ui.js (priorMode restore)
  //   navState.focusedIndex:     lifecycle.js (resetNodePositions / resetStateBeforeUrlRestore /
  //                             dispatchNavTransition), search-state.js (clear),
  //                             micro-demo.js (demo reset/focus)
  //   navState.trailNeighborIndices: lifecycle.js (resetNodePositions / resetStateBeforeUrlRestore),
  //                             journey.js (setTrailNavState call),
  //                             micro-demo.js (demo reset)
  //   navState.trailCursor:      lifecycle.js (setMyceliumMode / setTrailDepth / resetNodePositions /
  //                              resetStateBeforeUrlRestore), journey.js (setTrailNavState call),
  //                              micro-demo.js (demo reset)
  //   navState.walkHistoryIndices: lifecycle.js (setMyceliumMode / resetStateBeforeUrlRestore /
  //                              dispatchNavTransition WALK_TO/BACKTRACK),
  //                              micro-demo.js (demo reset/focus)
  // journey.js and thread-inspector.js delegate WALK_TO mode changes through lifecycle.
  // event-bindings.js delegates to camera-controls/lifecycle and must not write directly.
  //
  // Phase 2: focusOnNode() delegates navState.mode, navState.focusedIndex, and
  // navState.explorationHistoryIndices to dispatchNavTransition('FOCUS_NODE', ...) which
  // routes to the navigation-state.js reducer.
  'navState.mode': new Set([
    'navigation-state.ts', 'lifecycle.ts', 'search-state.ts', 'micro-demo.ts', 'loading-ui.ts',
  ]),
  'navState.focusedIndex': new Set([
    'navigation-state.ts', 'lifecycle.ts', 'search-state.ts', 'micro-demo.ts',
  ]),
  // navState.explorationHistoryIndices — navigation-state.js reducer/helper is canonical
  // owner for FOCUS_NODE / RESET_FOCUS / RESTORE_EXPLORATION_HISTORY writes.
  // lifecycle.js clearExplorationFocusSelection() must call clearNavigationFocusState()
  // instead of directly assigning this field, because dispatching RESET_FOCUS there
  // would recurse through resetExplorationFocus().
  'navState.explorationHistoryIndices': new Set(['navigation-state.ts']),
  // navState.trailNeighborIndices: navigation-state.js owns the canonical setter/clearer.
  // journey.js calls setTrailNavState(); lifecycle.js and search-state.js clear via
  // clearTrailThreadState(). micro-demo.js is a demo helper.
  'navState.trailNeighborIndices': new Set([
    'navigation-state.ts', 'lifecycle.ts', 'journey.ts', 'micro-demo.ts',
  ]),
  'navState.trailCursor': new Set([
    'navigation-state.ts', 'lifecycle.ts', 'journey.ts', 'micro-demo.ts',
  ]),
  // threadCandidates, threadReasonByIndex, threadSource, trailSeedIndex are canonical
  // owned by navigation-state.js. journey.js calls setTrailNavState().
  'navState.trailSeedIndex': new Set([
    'navigation-state.ts', 'lifecycle.ts', 'journey.ts', 'micro-demo.ts',
  ]),
  'navState.threadCandidates': new Set([
    'navigation-state.ts', 'journey.ts',
  ]),
  'navState.threadReasonByIndex': new Set([
    'navigation-state.ts', 'journey.ts',
  ]),
  'navState.threadSource': new Set([
    'navigation-state.ts', 'journey.ts',
  ]),
  'navState.walkHistoryIndices': new Set([
    'navigation-state.ts', 'lifecycle.ts', 'micro-demo.ts',
  ]),
  // focusPocket* fields are owned exclusively by focus-pocket.js via clearFocusPocketIndices etc.
  // They are mutated internally and must not be written by other modules.
  'navState.focusPocketIndices':  new Set(['focus-pocket.ts']),
  'navState.focusPocketMeta':      new Set(['focus-pocket.ts']),
  'navState.focusPocketRoleByIndex': new Set(['focus-pocket.ts']),
  'navState.focusPocketAnimationFrameId': new Set(['focus-pocket.ts']),
};

const MODULES_DIR = join(PROJECT_ROOT, 'js', 'modules');
const jsModules = [
  'event-bindings.ts', 'journey.ts', 'journey-compass-state.ts',
  'map-state.ts', 'filter-state.ts', 'search-state.ts', 'semantic-dive-ui.ts',
  'camera-controls.ts', 'lifecycle.ts', 'micro-demo.ts', 'focus-pocket.ts',
  'journey-compass.ts', 'thread-inspector.ts', 'loading-ui.ts', 'ui-renderers.ts',
  'navigation-state.ts',
];

// Fields that MUST NOT have any writer outside their canonical set
// (focusPocket fields are handled separately in CONTRACT 14 due to known lifecycle.js violation)
const SCAN_FIELDS = [
  'focusedNode', 'selectedPoint', 'trailDepth', 'activeFilters',
  'navState.mode', 'navState.focusedIndex', 'navState.explorationHistoryIndices',
  'navState.trailNeighborIndices', 'navState.trailCursor', 'navState.walkHistoryIndices',
  'navState.trailSeedIndex', 'navState.threadCandidates', 'navState.threadReasonByIndex',
  'navState.threadSource',
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
withStateMutation(() => { state.navState.mode = 'overview'; });
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

const journeyPath = JOURNEY_PATH;
const journeyWriters = scanWriters(journeyPath, 'focusedNode').concat(scanWriters(journeyPath, 'selectedPoint'));
assert(
  journeyWriters.length === 0,
  `journey.js must not write focusedNode/selectedPoint directly — found: ${JSON.stringify(journeyWriters)}`
);
console.log('PASS CONTRACT 11: journey.js does not directly write focusedNode or selectedPoint');

// ─── CONTRACT 12: event-bindings.js does NOT write focus state ────────────────

const eventBindingsPath = EVENT_BINDINGS_PATH;
const ebWriters = scanWriters(eventBindingsPath, 'focusedNode')
  .concat(scanWriters(eventBindingsPath, 'selectedPoint'))
  .concat(scanWriters(eventBindingsPath, 'trailDepth'));
assert(
  ebWriters.length === 0,
  `event-bindings.js must not write focusedNode/selectedPoint/trailDepth directly — found: ${JSON.stringify(ebWriters)}`
);
console.log('PASS CONTRACT 12: event-bindings.js does not directly write focus state fields');

// ─── CONTRACT 13: focus-pocket.js does NOT write focus state ───────────────────

const focusPocketPath = FOCUS_POCKET_PATH;
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
let fpViolations = [];
for (const field of focusPocketFields) {
  const canonicalSet = CANONICAL_WRITERS[field] || new Set();
  const mod = 'lifecycle.ts';
  const modPath = join(MODULES_DIR, mod);
  try {
    const writers = scanWriters(modPath, field);
    const unexpected = writers.filter(w => !canonicalSet.has(mod));
    fpViolations = fpViolations.concat(unexpected.map(w =>
      `lifecycle.js:${w.lineno} — '${field}': ${w.text} (type:${w.type})`
    ));
  } catch (e) {
    if (e.code === 'ENOENT') {
      // Missing optional module in this ownership scan is non-fatal.
    }
    else throw e;
  }
}

assert(fpViolations.length === 0,
  `FAIL CONTRACT 14: navState.focusPocket* ownership violation — lifecycle.js writes focus-pocket fields outside the owner API.\n` +
  `  focusPocket fields must only be written by focus-pocket.js via its owner helpers.\n` +
  `  Violations:\n    ${fpViolations.join('\n    ')}\n` +
  `  Fix: resetNodePositions() in lifecycle.js must call focus-pocket.js helpers\n` +
  `       (clearFocusPocketIndices, clearFocusPocketMeta, clearFocusPocketRoleByIndex, clearFocusPocketMotionByIndex)\n` +
  `       instead of directly assigning navState.focusPocketRoleByIndex or other focus-pocket state.`
);

console.log('PASS CONTRACT 14: focusPocket navState fields are only written by focus-pocket.ts');

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log('\n=== state-ownership-contract.mjs COMPLETE ===');
console.log('14 contracts verified. Ownership boundaries documented below.');
console.log('');
console.log('Ownership map:');
console.log('  state.js             → raw fields (trailDepth as number, navState, etc.)');
console.log('  lifecycle.js         → reset/orchestration + composition + navState.mode (primary)');
console.log('                         dispatchNavTransition: routes actions to navigation-state.js reducer');
console.log('                         navState.trailNeighborIndices/trailCursor/walkHistoryIndices (reset)');
console.log('  navigation-state.js  → canonical owner: navState.explorationHistoryIndices (FOCUS_NODE/');
console.log('                         RESET_FOCUS/RESTORE_EXPLORATION_HISTORY reducer cases),');
console.log('                         navState.mode, navState.focusedIndex, navState.walkHistoryIndices');
console.log('                         setTrailNavState() / clearTrailThreadState() own:');
console.log('                         navState.trailSeedIndex, threadCandidates, threadReasonByIndex,');
console.log('                         threadSource, trailNeighborIndices, trailCursor');
console.log('  camera-controls.js   → focusOnNode: focusedNode, selectedPoint, trailDepth via lifecycle setter,');
console.log('                         delegates navState/history to dispatchNavTransition(FOCUS_NODE)');
console.log('  search-state.js      → filter-eviction clears focusedNode/selectedPoint');
console.log('                         routes nav reset/trail clear through lifecycle/navigation owner APIs');
console.log('  micro-demo.js        → demo focus: navState.mode/focusedIndex/trailNeighborIndices');
console.log('                         trailCursor/walkHistoryIndices (demo reset/focus)');
console.log('  journey.js           → walkThreadNeighbor: WALK_TO via dispatchNavTransition');
console.log('                         restoreFocusTrailState: RESTORE_EXPLORATION_HISTORY via dispatchNavTransition');
console.log('                         setTrailFromSeed: calls navigation-state.js setTrailNavState()');
console.log('  thread-inspector.js  → thread-neighbor exploration: WALK_TO via dispatchNavTransition');
console.log('  focus-pocket.js     → navState.focusPocket* fields exclusively');
console.log('  event-bindings.js   → delegates, no direct focus writes');
console.log('  ui-renderers.js     → reads only');
console.log('  semanticDiveMode     → derived from trailDepth, no independent storage');
console.log('');
console.log('Focus-pocket invariant: reset code delegates navState.focusPocket* writes to focus-pocket.js helpers');
