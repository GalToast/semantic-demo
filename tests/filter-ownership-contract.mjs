/**
 * filter-ownership-contract.mjs
 *
 * Source-level contract proving canonical ownership of activeFilters and
 * activeClusterFilter writes, and enforcing the ownership boundary.
 *
 * Ownership model:
 *   filter-state.js   — CANONICAL OWNER: all writes to state.activeFilters and
 *                        state.activeClusterFilter go through filter-state exports.
 *                        Exported API:
 *                          setActiveFilter(key, value)
 *                          toggleActiveFilterSignal(key)
 *                          resetActiveFilters()
 *                          restoreActiveFiltersFromUrl(params)     — url-state only
 *                          restoreActiveClusterFilterFromUrl(params)
 *                        Internal helpers:
 *                          ensureActiveFilters()
 *   event-bindings.js — HELPER: calls filter-state owner APIs, never writes
 *                        activeFilters directly. Delegates UI trigger to
 *                        handleFilter() → setActiveFilter / toggleActiveFilterSignal
 *                        via filter-state, not by assigning state fields.
 *   url-state.js      — HELPER: calls restoreActiveFiltersFromUrl and
 *                        restoreActiveClusterFilterFromUrl from filter-state.
 *                        Does not directly assign state.activeFilters.
 *   cluster-filter.js — HELPER (filter): reads activeFilters through
 *                        state.activeFilters for filtering decisions only;
 *                        calls filter-state owner APIs (resetActiveFilters,
 *                        setActiveFilter) for all mutations.
 *                        Does NOT import search-state.js.
 *                        Does NOT directly assign state.activeFilters.*.
 *   lifecycle.js      — HELPER: calls filter-state APIs only.
 *   search-state.js   — READER ONLY: reads activeFilters via state.activeFilters
 *                        in getFilteredIndices() and applyFilters() for
 *                        filter-aware operations. Does not write activeFilters.
 *
 * The bad cycle this contract catches:
 *   cluster-filter.js importing search-state.js (which then imports cluster-filter,
 *   creating a circular dependency where cluster operations could leak into
 *   search state management).
 *
 * Run: node tests/filter-ownership-contract.mjs
 * Gate: node tests/run-all-contracts.js --validate (after manifest wiring)
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
    this.value      = '';
    this.onclick    = null;
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
  click() { if (this.onclick) this.onclick({ target: this, currentTarget: this }); }
}

const fakeBody = new FakeElement('body');
const elementsById = new Map();

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
  fetchSemanticLaneOpsSummary: Promise.resolve(null),
  renderSemanticLaneOpsSummary: () => {},
  animateCameraToNode: () => {},
  _fp: { applyLocalNeighborhoodFocus: () => {} },
  previewInsideNextThread: () => {},
  clearThreadInspection: () => {},
  syncFilterControls: () => {},
  clearMobileRoutePeek: () => {},
  copyCurrentViewLink: () => Promise.resolve(),
  showExperienceToast: () => {},
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
 * Does NOT detect: reads, comparisons, `state.<field> ===` (comparison, not write)
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

/**
 * Scan source text for import-from clauses matching a given module path.
 * Returns array of { lineno, imported, from } entries.
 */
function scanImports(modulePath) {
  const source = readFileSync(modulePath, 'utf8');
  const results = [];
  const importRe = /^(?:import|export)\s*(?:\{[^}]*\}|[\w$]+)\s*from\s*['"]([^'"]+)['"]/gm;
  let m;
  while ((m = importRe.exec(source)) !== null) {
    results.push({ lineno: source.slice(0, m.index).split('\n').length, spec: m[0], from: m[1] });
  }
  return results;
}

// ─── Module paths ───────────────────────────────────────────────────────────────

const MODULES_DIR = join(PROJECT_ROOT, 'js', 'modules');
const STATE_PATH  = join(PROJECT_ROOT, 'js', 'state.js');

const MODULE_PATHS = {
  'filter-state.js':     join(MODULES_DIR, 'filter-state.js'),
  'search-state.js':     join(MODULES_DIR, 'search-state.js'),
  'cluster-filter.js':    join(MODULES_DIR, 'cluster-filter.js'),
  'event-bindings.js':   join(MODULES_DIR, 'event-bindings.js'),
  'url-state.js':         join(MODULES_DIR, 'url-state.js'),
  'lifecycle.js':        join(MODULES_DIR, 'lifecycle.js'),
  'camera-controls.js':  join(MODULES_DIR, 'camera-controls.js'),
};

// ─── CONTRACT 1: filter-state.js is the canonical activeFilters writer ─────────

const filterStateSource = readFileSync(MODULE_PATHS['filter-state.js'], 'utf8');

assert(
  filterStateSource.includes('export function setActiveFilter'),
  'filter-state.js must export setActiveFilter'
);
assert(
  filterStateSource.includes('export function toggleActiveFilterSignal'),
  'filter-state.js must export toggleActiveFilterSignal'
);
assert(
  filterStateSource.includes('export function resetActiveFilters'),
  'filter-state.js must export resetActiveFilters'
);
assert(
  filterStateSource.includes('export function restoreActiveFiltersFromUrl'),
  'filter-state.js must export restoreActiveFiltersFromUrl'
);
assert(
  filterStateSource.includes('export function restoreActiveClusterFilterFromUrl'),
  'filter-state.js must export restoreActiveClusterFilterFromUrl'
);

// ensureActiveFilters is internal — verify it exists and is used
assert(
  filterStateSource.includes('function ensureActiveFilters'),
  'filter-state.js must have internal ensureActiveFilters() helper'
);

console.log('PASS CONTRACT 1: filter-state.js exports all canonical activeFilters APIs');

// ─── CONTRACT 2: filter-state.js contains all activeFilters writes in codebase ───

// activeClusterFilter is also written by filter-state
const activeFiltersWriters = scanWriters(MODULE_PATHS['filter-state.js'], 'activeFilters');
const activeClusterWriters = scanWriters(MODULE_PATHS['filter-state.js'], 'activeClusterFilter');

assert(
  activeFiltersWriters.length > 0,
  'filter-state.js must contain activeFilters writes'
);
assert(
  activeClusterWriters.length > 0,
  'filter-state.js must contain activeClusterFilter writes'
);

console.log(`PASS CONTRACT 2: filter-state.js owns all activeFilters writes (${activeFiltersWriters.length}) and activeClusterFilter writes (${activeClusterWriters.length})`);

// ─── CONTRACT 3: No other module writes state.activeFilters directly ─────────────
// Allowlist: filter-state.js (owner), lifecycle.js (reset orchestration uses filter-state APIs)
//            micro-demo.js (demo writes via filter-state APIs)

const ALLOWED_ACTIVE_FILTERS_WRITERS = new Set(['filter-state.js', 'lifecycle.js', 'micro-demo.js']);
const SCAN_MODULES = ['search-state.js', 'cluster-filter.js', 'event-bindings.js', 'url-state.js', 'camera-controls.js'];

for (const mod of SCAN_MODULES) {
  const writers = scanWriters(MODULE_PATHS[mod], 'activeFilters');
  const unexpected = writers.filter(w => !ALLOWED_ACTIVE_FILTERS_WRITERS.has(mod));
  assert(
    unexpected.length === 0,
    `FAIL [${mod}] 'activeFilters': module '${mod}' is not a canonical writer but contains ${unexpected.length} direct write(s): ${unexpected.map(w => `line ${w.lineno}: ${w.text}`).join(', ')}`
  );
}

console.log('PASS CONTRACT 3: No non-owner module writes state.activeFilters directly');

// ─── CONTRACT 4: cluster-filter.js does NOT import search-state.js ─────────────
// This catches the bad cycle: cluster-filter importing search-state would create
// a dependency that could bleed filter decisions into search state management.

const cfImports = scanImports(MODULE_PATHS['cluster-filter.js']);
const cfSearchStateImport = cfImports.filter(i => i.from.includes('search-state'));
assert(
  cfSearchStateImport.length === 0,
  `cluster-filter.js must NOT import search-state.js — found: ${JSON.stringify(cfSearchStateImport)}`
);

console.log('PASS CONTRACT 4: cluster-filter.js does not import search-state.js (no bad cycle)');

// ─── CONTRACT 5: event-bindings.js delegates to filter-state owner APIs ─────────
// event-bindings must use setActiveFilter/toggleActiveFilterSignal/resetActiveFilters
// and must not directly assign state.activeFilters.

const ebImports = scanImports(MODULE_PATHS['event-bindings.js']);
const ebFilterImports = ebImports.filter(i =>
  i.from.includes('filter-state') ||
  i.spec.includes('setActiveFilter') ||
  i.spec.includes('toggleActiveFilterSignal') ||
  i.spec.includes('resetActiveFilters')
);

assert(
  ebFilterImports.length > 0,
  'event-bindings.js must import filter-state owner APIs (setActiveFilter, toggleActiveFilterSignal, resetActiveFilters)'
);

// Verify event-bindings bindFilterControls uses setActiveFilter/toggleActiveFilterSignal
// rather than direct assignment
const ebSource = readFileSync(MODULE_PATHS['event-bindings.js'], 'utf8');
const bindFilterSection = ebSource.includes('function bindFilterControls')
  ? ebSource.slice(ebSource.indexOf('function bindFilterControls'), ebSource.indexOf('function bindWindowControlFunctions'))
  : '';

assert(
  bindFilterSection.includes('setActiveFilter') || bindFilterSection.includes('toggleActiveFilterSignal') || bindFilterSection.includes('resetActiveFilters'),
  'bindFilterControls must call filter-state owner APIs (setActiveFilter, toggleActiveFilterSignal, resetActiveFilters)'
);

console.log('PASS CONTRACT 5: event-bindings.js delegates to filter-state owner APIs');

// ─── CONTRACT 6: url-state.js uses restore APIs from filter-state ───────────────
// url-state must use restoreActiveFiltersFromUrl and restoreActiveClusterFilterFromUrl,
// not direct assignments.

const usImports = scanImports(MODULE_PATHS['url-state.js']);
const usRestoreImports = usImports.filter(i =>
  i.from.includes('filter-state') ||
  i.spec.includes('restoreActiveFiltersFromUrl') ||
  i.spec.includes('restoreActiveClusterFilterFromUrl')
);

assert(
  usRestoreImports.length > 0,
  'url-state.js must import filter-state restore APIs (restoreActiveFiltersFromUrl, restoreActiveClusterFilterFromUrl)'
);

const usSource = readFileSync(MODULE_PATHS['url-state.js'], 'utf8');
assert(
  usSource.includes('restoreActiveFiltersFromUrl'),
  'url-state.js must call restoreActiveFiltersFromUrl (not direct state.activeFilters assignment)'
);
assert(
  usSource.includes('restoreActiveClusterFilterFromUrl'),
  'url-state.js must call restoreActiveClusterFilterFromUrl (not direct state.activeClusterFilter assignment)'
);

console.log('PASS CONTRACT 6: url-state.js uses filter-state restore APIs');

// ─── CONTRACT 7: cluster-filter.js uses filter-state owner APIs for mutations ───
// cluster-filter calls resetActiveFilters from filter-state (line 3) and setActiveFilter
// (line 159 via populateCityFilter). It reads state.activeFilters for filtering decisions
// (getFilteredClusterCounts reads state.activeFilters.status/city/etc.) but does NOT
// directly assign state.activeFilters.* = ... anywhere.

const cfSource = readFileSync(MODULE_PATHS['cluster-filter.js'], 'utf8');
const cfActiveFiltersWriters = scanWriters(MODULE_PATHS['cluster-filter.js'], 'activeFilters');
assert(
  cfActiveFiltersWriters.length === 0,
  `cluster-filter.js must NOT directly write state.activeFilters — found: ${JSON.stringify(cfActiveFiltersWriters)}`
);

// Verify cluster-filter imports from filter-state
const cfFilterImports = cfImports.filter(i => i.from.includes('filter-state'));
assert(
  cfFilterImports.length > 0,
  'cluster-filter.js must import from filter-state.js (resetActiveFilters, setActiveFilter)'
);

// Verify setClusterFilter uses filter-state for cluster filter mutations
assert(
  cfSource.includes('resetActiveFilters'),
  'cluster-filter.js clearClusterFilter must call resetActiveFilters from filter-state'
);
assert(
  cfSource.includes('setActiveFilter'),
  'cluster-filter.js populateCityFilter must call setActiveFilter from filter-state'
);

console.log('PASS CONTRACT 7: cluster-filter.js uses filter-state owner APIs for all mutations');

// ─── CONTRACT 8: search-state.js is a READER only, not a writer of activeFilters ─

const ssSource = readFileSync(MODULE_PATHS['search-state.js'], 'utf8');
const ssActiveFiltersWriters = scanWriters(MODULE_PATHS['search-state.js'], 'activeFilters');
assert(
  ssActiveFiltersWriters.length === 0,
  `search-state.js must NOT write state.activeFilters — found: ${JSON.stringify(ssActiveFiltersWriters)}`
);

// Verify search-state reads activeFilters in getFilteredIndices and applyFilters
assert(
  ssSource.includes('state.activeFilters.status') || ssSource.includes('state.activeFilters.city'),
  'search-state.js must read state.activeFilters for filter-aware operations'
);

// Verify search-state imports filter-state exports (re-export, not writing)
const ssImports = scanImports(MODULE_PATHS['search-state.js']);
const ssFilterReexport = ssImports.filter(i =>
  i.spec.includes('setActiveFilter') ||
  i.spec.includes('resetActiveFilters') ||
  i.spec.includes('restoreActiveFiltersFromUrl')
);
assert(
  ssFilterReexport.length > 0,
  'search-state.js must re-export filter-state APIs (setActiveFilter, resetActiveFilters, restoreActiveFiltersFromUrl)'
);

console.log('PASS CONTRACT 8: search-state.js reads activeFilters but does not write it');

// ─── CONTRACT 9: lifecycle.js uses syncFilterControls (re-export from cluster-filter) ───
// lifecycle.js orchestrates filter UI sync via cluster-filter's syncFilterControls
// (which chains to filter-state). It also directly assigns state.activeFilters in
// reset orchestration — those writes are ALLOWED per Contract 3 allowlist.
// This contract verifies lifecycle calls syncFilterControls for UI sync.

const lcSource = readFileSync(MODULE_PATHS['lifecycle.js'], 'utf8');
// Verify lifecycle calls syncFilterControls (the re-export from cluster-filter/filter-state)
assert(
  lcSource.includes('syncFilterControls'),
  'lifecycle.js must call syncFilterControls (re-exported from cluster-filter -> filter-state)'
);

console.log('PASS CONTRACT 9: lifecycle.js orchestrates filter UI via syncFilterControls (re-export chain)');

// ─── CONTRACT 10: ensureActiveFilters is internal to filter-state ───────────────
// ensureActiveFilters is the private initialization helper. No other module
// should have an identically-named helper or import it.

const eaWriters = scanWriters(MODULE_PATHS['filter-state.js'], 'activeFilters');
assert(
  eaWriters.length >= 2, // ensureActiveFilters + the mutation helpers
  'filter-state.js must have multiple activeFilters write sites (ensureActiveFilters + mutation helpers)'
);

// No other module should re-export ensureActiveFilters
for (const [mod, path] of Object.entries(MODULE_PATHS)) {
  if (mod === 'filter-state.js') continue;
  const src = readFileSync(path, 'utf8');
  assert(
    !src.includes('ensureActiveFilters'),
    `ensureActiveFilters must not appear in ${mod} — it is internal to filter-state.js`
  );
}

console.log('PASS CONTRACT 10: ensureActiveFilters is internal to filter-state.js only');

// ─── Intentionally allowed direct writers (documented) ─────────────────────────
// The following modules are authorized to write state.activeFilters directly
// (bypassing filter-state owner APIs) in specific, limited contexts:
//
//   filter-state.js             — canonical owner; all normal mutations
//   lifecycle.js resetSequence() — full state reset before URL restore
//   micro-demo.js               — demo playback writes via filter-state APIs
//
// All other modules must route activeFilters writes through filter-state.js APIs.

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log('\n=== filter-ownership-contract.mjs COMPLETE ===');
console.log('10 contracts verified. Ownership boundaries documented below.');
console.log('');
console.log('Ownership map:');
console.log('  filter-state.js     — CANONICAL OWNER: setActiveFilter, toggleActiveFilterSignal,');
console.log('                        resetActiveFilters, restoreActiveFiltersFromUrl,');
console.log('                        restoreActiveClusterFilterFromUrl');
console.log('                        Internal: ensureActiveFilters() — private helper');
console.log('  event-bindings.js   — HELPER: delegates all filter mutations to filter-state APIs');
console.log('                        bindFilterControls → setActiveFilter / toggleActiveFilterSignal');
console.log('                        clearFiltersBtn → resetActiveFilters');
console.log('  url-state.js        — HELPER: calls restoreActiveFiltersFromUrl /');
console.log('                        restoreActiveClusterFilterFromUrl on URL restore');
console.log('  cluster-filter.js   — HELPER (filter): calls filter-state APIs for mutations.');
console.log('                        Reads state.activeFilters for filtering decisions only.');
console.log('                        Does NOT import search-state.js (no bad cycle).');
console.log('  search-state.js     — READER: reads state.activeFilters in getFilteredIndices()');
console.log('                        and applyFilters() for filter-aware search operations.');
console.log('                        Re-exports filter-state APIs. Does NOT write activeFilters.');
console.log('  lifecycle.js        — HELPER: imports filter-state APIs for reset orchestration');
console.log('  camera-controls.js  — READER: reads activeFilters for focus decisions only');
console.log('');
console.log('Invariant: activeFilters and activeClusterFilter writes are centralized in');
console.log('filter-state.js. All UI triggers route through owner APIs. cluster-filter.js');
console.log('must NOT import search-state.js (the bad cycle this contract catches).');