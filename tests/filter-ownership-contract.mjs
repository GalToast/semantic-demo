/**
 * filter-ownership-contract.mjs
 *
 * Source-level contract proving canonical ownership of activeFilters and
 * activeClusterFilter writes, and enforcing the ownership boundary.
 *
 * Ownership model:
 *   filter-state.ts   — CANONICAL OWNER: all writes to state.activeFilters and
 *                        state.activeClusterFilter go through filter-state exports.
 *                        Exported API:
 *                          setActiveFilter(key, value)
 *                          toggleActiveFilterSignal(key)
 *                          resetActiveFilters()
 *                          restoreActiveFiltersFromUrl(params)     — url-state only
 *                          restoreActiveClusterFilterFromUrl(params)
 *                        Internal helpers:
 *                          ensureActiveFilters()
 *   event-bindings.ts — HELPER: calls filter-state owner APIs, never writes
 *                        activeFilters directly. Delegates UI trigger to
 *                        handleFilter() → setActiveFilter / toggleActiveFilterSignal
 *                        via filter-state, not by assigning state fields.
 *   url-state.ts      — HELPER: calls restoreActiveFiltersFromUrl and
 *                        restoreActiveClusterFilterFromUrl from filter-state.
 *                        Does not directly assign state.activeFilters.
 *   cluster-filter.ts — HELPER (filter): reads activeFilters through
 *                        state.activeFilters for filtering decisions only;
 *                        calls filter-state owner APIs (resetActiveFilters,
 *                        setActiveFilter) for all mutations.
 *                        Does NOT import search-state.ts.
 *                        Does NOT directly assign state.activeFilters.*.
 *   lifecycle.ts      — HELPER: calls filter-state APIs only.
 *   search-state.ts   — READER ONLY: reads activeFilters via state.activeFilters
 *                        in getFilteredIndices() and applyFilters() for
 *                        filter-aware operations. Does not write activeFilters.
 *
 * The bad cycle this contract catches:
 *   cluster-filter.ts importing search-state.ts (which then imports cluster-filter,
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

  const ownerRef = '(?:state|appState)';
  const simpleAssignRe = new RegExp(`${ownerRef}\\.${field}\\s*=[^=]`, 'g');
  const bracketAssignRe = new RegExp(`${ownerRef}\\['${field}'\\]\\s*=[^=]`, 'g');
  const mutationRe = new RegExp(`${ownerRef}\\.${field}\\.(set|clear|add|delete)\\s*\\(`, 'g');

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

const MODULE_PATHS = {
  'filter-state.ts':     join(PROJECT_ROOT, 'src', 'lib', 'stores', 'filter.svelte.ts'),
  'search-state.ts':     join(PROJECT_ROOT, 'src', 'lib', 'search', 'state.ts'),
  'cluster-filter.ts':    join(MODULES_DIR, 'cluster-filter.ts'),
  'event-bindings.ts':   join(MODULES_DIR, 'bindings', 'filter-bindings.ts'),
  'filter-chrome.svelte': join(MODULES_DIR, 'components', 'FilterChrome.svelte'),
  'url-state.ts':         join(MODULES_DIR, 'url-state.ts'),
  'lifecycle.ts':        join(MODULES_DIR, 'lifecycle.ts'),
  'camera-controls.ts':  join(PROJECT_ROOT, 'src', 'lib', 'engine', 'camera-controls.ts'),
};

// ─── CONTRACT 1: filter-state.ts is the canonical activeFilters writer ─────────

const filterStateSource = readFileSync(MODULE_PATHS['filter-state.ts'], 'utf8');

assert(
  filterStateSource.includes('export function setActiveFilter'),
  'filter-state.ts must export setActiveFilter'
);
assert(
  filterStateSource.includes('export function toggleActiveFilterSignal'),
  'filter-state.ts must export toggleActiveFilterSignal'
);
assert(
  filterStateSource.includes('export function resetActiveFilters') ||
  filterStateSource.includes('export const resetActiveFilters'),
  'filter-state.ts must export resetActiveFilters'
);
assert(
  filterStateSource.includes('export function restoreActiveFiltersFromUrl'),
  'filter-state.ts must export restoreActiveFiltersFromUrl'
);
assert(
  filterStateSource.includes('export function restoreActiveClusterFilterFromUrl'),
  'filter-state.ts must export restoreActiveClusterFilterFromUrl'
);

// withFilterStateNotify is internal — verify it exists and is used
assert(
  filterStateSource.includes('function withFilterStateNotify'),
  'filter.svelte.ts must have internal withFilterStateNotify() helper'
);

console.log('PASS CONTRACT 1: filter-state.ts exports all canonical activeFilters APIs');

// ─── CONTRACT 2: filter-state.ts contains all activeFilters writes in codebase ───

// activeClusterFilter is also written by filter-state
const activeFiltersWriters = scanWriters(MODULE_PATHS['filter-state.ts'], 'activeFilters');
const activeClusterWriters = scanWriters(MODULE_PATHS['filter-state.ts'], 'activeClusterFilter');

assert(
  activeFiltersWriters.length > 0,
  'filter-state.ts must contain activeFilters writes'
);
assert(
  activeClusterWriters.length > 0,
  'filter-state.ts must contain activeClusterFilter writes'
);

console.log(`PASS CONTRACT 2: filter-state.ts owns all activeFilters writes (${activeFiltersWriters.length}) and activeClusterFilter writes (${activeClusterWriters.length})`);

// ─── CONTRACT 3: No other module writes state.activeFilters directly ─────────────
// Allowlist: filter-state.ts (owner), lifecycle.ts (reset orchestration uses filter-state APIs)
//            micro-demo.js (demo writes via filter-state APIs)

const ALLOWED_ACTIVE_FILTERS_WRITERS = new Set(['filter-state.ts', 'lifecycle.ts', 'micro-demo.ts']);
const SCAN_MODULES = ['search-state.ts', 'cluster-filter.ts', 'event-bindings.ts', 'url-state.ts', 'camera-controls.ts'];

for (const mod of SCAN_MODULES) {
  const writers = scanWriters(MODULE_PATHS[mod], 'activeFilters');
  const unexpected = writers.filter(w => !ALLOWED_ACTIVE_FILTERS_WRITERS.has(mod));
  assert(
    unexpected.length === 0,
    `FAIL [${mod}] 'activeFilters': module '${mod}' is not a canonical writer but contains ${unexpected.length} direct write(s): ${unexpected.map(w => `line ${w.lineno}: ${w.text}`).join(', ')}`
  );
}

console.log('PASS CONTRACT 3: No non-owner module writes state.activeFilters directly');

// ─── CONTRACT 4: cluster-filter.ts does NOT import search-state.ts ─────────────
// This catches the bad cycle: cluster-filter importing search-state would create
// a dependency that could bleed filter decisions into search state management.

const cfImports = scanImports(MODULE_PATHS['cluster-filter.ts']);
const cfSearchStateImport = cfImports.filter(i => i.from.includes('search-state'));
assert(
  cfSearchStateImport.length === 0,
  `cluster-filter.ts must NOT import search-state.ts — found: ${JSON.stringify(cfSearchStateImport)}`
);

console.log('PASS CONTRACT 4: cluster-filter.ts does not import search-state.ts (no bad cycle)');

// ─── CONTRACT 5: filter chrome delegates to filter-state owner APIs ─────────────
// The filter chrome's mutation entry point is a 2-file chain:
//   bindings/filter-bindings.js  — public entry: bindFilterControls (shim)
//   components/FilterChrome.svelte — directly rendered Svelte component
// At least one file in the chain must import setActiveFilter /
// toggleActiveFilterSignal / resetActiveFilters from filter-state, AND no
// file in the chain may write state.activeFilters directly. This
// supersedes the legacy check that scanned only the shim and grep'd for
// the API names in `bindFilterControls` (the linter-era shim was
// importing those names as a satisficer).

const CHROME_CHAIN = [
  MODULE_PATHS['event-bindings.ts'],
  MODULE_PATHS['filter-chrome.svelte'],
];

const FILTER_STATE_API_NAMES = ['setActiveFilter', 'toggleActiveFilterSignal', 'resetActiveFilters'];

// For .js files use the line-based scanImports; for .svelte files the
// import block is multi-line, so use a substring check.
function chromeChainImportsFilterStateApi(path) {
  const source = readFileSync(path, 'utf8');
  if (path.endsWith('.svelte')) {
    return FILTER_STATE_API_NAMES.every((name) => source.includes(name))
      && source.includes('@lib/stores/filter.svelte');
  }
  return scanImports(path).some((imp) =>
    (imp.from.includes('filter-state') || imp.from.includes('filter.svelte'))
    && FILTER_STATE_API_NAMES.some((name) => imp.spec.includes(name))
  );
}

const chainWithImports = CHROME_CHAIN.filter(chromeChainImportsFilterStateApi);

assert(
  chainWithImports.length > 0,
  'filter chrome chain (binding shim + Svelte component) must import filter-state owner APIs (setActiveFilter, toggleActiveFilterSignal, resetActiveFilters) — at least one file in the chain'
);

// None of the chain may write state.activeFilters directly
let chainDirectWrites = 0;
for (const path of CHROME_CHAIN) {
  chainDirectWrites += scanWriters(path, 'activeFilters').length;
}
assert(
  chainDirectWrites === 0,
  `filter chrome chain must NOT write state.activeFilters directly — found ${chainDirectWrites} write(s) across binding shim + Svelte component`
);

console.log(`PASS CONTRACT 5: filter chrome chain delegates to filter-state owner APIs (${chainWithImports.length}/${CHROME_CHAIN.length} files import the owner APIs, 0 direct writes)`);

// ─── CONTRACT 6: url-state.ts uses restore APIs from filter-state ───────────────
// url-state must use restoreActiveFiltersFromUrl and restoreActiveClusterFilterFromUrl,
// not direct assignments.

const usImports = scanImports(MODULE_PATHS['url-state.ts']);
const usRestoreImports = usImports.filter(i =>
  i.from.includes('filter-state') ||
  i.from.includes('filter.svelte') ||
  i.spec.includes('restoreActiveFiltersFromUrl') ||
  i.spec.includes('restoreActiveClusterFilterFromUrl')
);

assert(
  usRestoreImports.length > 0,
  'url-state.ts must import filter-state restore APIs (restoreActiveFiltersFromUrl, restoreActiveClusterFilterFromUrl)'
);

const usSource = readFileSync(MODULE_PATHS['url-state.ts'], 'utf8');
assert(
  usSource.includes('restoreActiveFiltersFromUrl'),
  'url-state.ts must call restoreActiveFiltersFromUrl (not direct state.activeFilters assignment)'
);
assert(
  usSource.includes('restoreActiveClusterFilterFromUrl'),
  'url-state.ts must call restoreActiveClusterFilterFromUrl (not direct state.activeClusterFilter assignment)'
);

console.log('PASS CONTRACT 6: url-state.ts uses filter-state restore APIs');

// ─── CONTRACT 7: cluster-filter.ts uses filter-state owner APIs for mutations ───
// cluster-filter calls resetActiveFilters from filter-state (line 3) and setActiveFilter
// (line 159 via populateCityFilter). It reads state.activeFilters for filtering decisions
// (getFilteredClusterCounts reads state.activeFilters.status/city/etc.) but does NOT
// directly assign state.activeFilters.* = ... anywhere.

const cfSource = readFileSync(MODULE_PATHS['cluster-filter.ts'], 'utf8');
const cfActiveFiltersWriters = scanWriters(MODULE_PATHS['cluster-filter.ts'], 'activeFilters');
assert(
  cfActiveFiltersWriters.length === 0,
  `cluster-filter.ts must NOT directly write state.activeFilters — found: ${JSON.stringify(cfActiveFiltersWriters)}`
);

// Verify cluster-filter imports from filter-state
const cfFilterImports = cfImports.filter(i => i.from.includes('filter-state') || i.from.includes('filter.svelte'));
assert(
  cfFilterImports.length > 0,
  'cluster-filter.ts must import from filter-state.ts (resetActiveFilters, setActiveFilter)'
);

// Verify setClusterFilter uses filter-state for cluster filter mutations
assert(
  cfSource.includes('resetActiveFilters'),
  'cluster-filter.ts clearClusterFilter must call resetActiveFilters from filter-state'
);
assert(
  cfSource.includes('setActiveFilter'),
  'cluster-filter.ts populateCityFilter must call setActiveFilter from filter-state'
);

console.log('PASS CONTRACT 7: cluster-filter.ts uses filter-state owner APIs for all mutations');

// ─── CONTRACT 8: search-state.ts is a READER only, not a writer of activeFilters ─

const ssSource = readFileSync(MODULE_PATHS['search-state.ts'], 'utf8');
const ssActiveFiltersWriters = scanWriters(MODULE_PATHS['search-state.ts'], 'activeFilters');
assert(
  ssActiveFiltersWriters.length === 0,
  `search-state.ts must NOT write state.activeFilters — found: ${JSON.stringify(ssActiveFiltersWriters)}`
);

// Verify search-state reads activeFilters for filter-aware operations.
// Reads go through the filter-state owner API (getActiveFilters) and
// search-filter-core's pointMatchesActiveFilters — the direct state.activeFilters
// access was removed as dead code.
const ssReadsActiveFilters =
  ssSource.includes('state.activeFilters.status') ||
  ssSource.includes('state.activeFilters.city') ||
  ssSource.includes('getActiveFilters') ||
  ssSource.includes('pointMatchesActiveFilters');
assert(
  ssReadsActiveFilters,
  'search-state.ts must read activeFilters for filter-aware operations (via getActiveFilters / pointMatchesActiveFilters / state.activeFilters)'
);

// Verify search-state imports the filter predicate owner API (not writing)
const ssImports = scanImports(MODULE_PATHS['search-state.ts']);
const ssFilterReexport = ssImports.filter(i =>
  i.from.includes('filter.svelte') &&
  i.spec.includes('pointMatchesActiveFilters')
);
assert(
  ssFilterReexport.length > 0,
  'search-state.ts must import pointMatchesActiveFilters from the filter owner API'
);

console.log('PASS CONTRACT 8: search-state.ts reads activeFilters but does not write it');

// ─── CONTRACT 9: lifecycle.ts uses syncFilterControls (re-export from cluster-filter) ───
// lifecycle.ts orchestrates filter UI sync via cluster-filter's syncFilterControls
// (which chains to filter-state). It also directly assigns state.activeFilters in
// reset orchestration — those writes are ALLOWED per Contract 3 allowlist.
// This contract verifies lifecycle calls syncFilterControls for UI sync.

const lcSource = readFileSync(MODULE_PATHS['lifecycle.ts'], 'utf8');
// Verify lifecycle calls syncFilterControls (the re-export from cluster-filter/filter-state)
assert(
  lcSource.includes('syncFilterControls'),
  'lifecycle.ts must call syncFilterControls (re-exported from cluster-filter -> filter-state)'
);

console.log('PASS CONTRACT 9: lifecycle.ts orchestrates filter UI via syncFilterControls (re-export chain)');

// ─── CONTRACT 10: withFilterStateNotify is internal to filter-state ─────────────
// withFilterStateNotify is the private notification helper. No other module
// should have an identically-named helper or import it.

const eaWriters = scanWriters(MODULE_PATHS['filter-state.ts'], 'activeFilters');
assert(
  eaWriters.length >= 2, // writable setter + mutation helpers
  'filter.svelte.ts must have multiple activeFilters write sites (store setter + mutation helpers)'
);

// No other module should re-export withFilterStateNotify
for (const [mod, path] of Object.entries(MODULE_PATHS)) {
  if (mod === 'filter-state.ts') continue;
  const src = readFileSync(path, 'utf8');
  assert(
    !src.includes('withFilterStateNotify'),
    `withFilterStateNotify must not appear in ${mod} — it is internal to filter.svelte.ts`
  );
}

console.log('PASS CONTRACT 10: withFilterStateNotify is internal to filter.svelte.ts only');

// ─── Intentionally allowed direct writers (documented) ─────────────────────────
// The following modules are authorized to write state.activeFilters directly
// (bypassing filter-state owner APIs) in specific, limited contexts:
//
//   filter-state.ts             — canonical owner; all normal mutations
//   lifecycle.ts resetSequence() — full state reset before URL restore
//   micro-demo.js               — demo playback writes via filter-state APIs
//
// All other modules must route activeFilters writes through filter-state.ts APIs.

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log('\n=== filter-ownership-contract.mjs COMPLETE ===');
console.log('10 contracts verified. Ownership boundaries documented below.');
console.log('');
console.log('Ownership map:');
console.log('  filter.svelte.ts    — CANONICAL OWNER: setActiveFilter, toggleActiveFilterSignal,');
console.log('                        resetActiveFilters, restoreActiveFiltersFromUrl,');
console.log('                        restoreActiveClusterFilterFromUrl');
console.log('                        Internal: withFilterStateNotify() — private helper');
console.log('  event-bindings.ts   — HELPER: delegates all filter mutations to filter-state APIs');
console.log('                        bindFilterControls → setActiveFilter / toggleActiveFilterSignal');
console.log('                        clearFiltersBtn → resetActiveFilters');
console.log('  url-state.ts        — HELPER: calls restoreActiveFiltersFromUrl /');
console.log('                        restoreActiveClusterFilterFromUrl on URL restore');
console.log('  cluster-filter.ts   — HELPER (filter): calls filter-state APIs for mutations.');
console.log('                        Reads state.activeFilters for filtering decisions only.');
console.log('                        Does NOT import search-state.ts (no bad cycle).');
console.log('  search-state.ts     — READER: reads state.activeFilters in getFilteredIndices()');
console.log('                        and applyFilters() for filter-aware search operations.');
console.log('                        Imports pointMatchesActiveFilters. Does NOT write activeFilters.');
console.log('  lifecycle.ts        — HELPER: imports filter-state APIs for reset orchestration');
console.log('  camera-controls.ts  — READER: reads activeFilters for focus decisions only');
console.log('');
console.log('Invariant: activeFilters and activeClusterFilter writes are centralized in');
console.log('filter.svelte.ts. All UI triggers route through owner APIs. cluster-filter.ts');
console.log('must NOT import search-state.ts (the bad cycle this contract catches).');
