/**
 * Contract for semantic-lane cluster extraction.
 * Guards current behavior before extraction of js/modules/semantic-lane.js.
 *
 * Run: node tests/semantic-lane-contract.mjs
 * Gate:  npm run test:contract (after adding to package.json test:contract chain)
 *
 * Source-only / Fake-DOM - no browser or network required.
 */

class FakeClassList {
  constructor() { this._ = new Set(); }
  add(...n) { n.forEach(x => this._.add(x)); }
  remove(...n) { n.forEach(x => this._.delete(x)); }
  contains(n) { return this._.has(n); }
  toggle() {}
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.classList = new FakeClassList();
    this._attrs = new Map();
    this.style = {};
    this.hidden = false;
    this.textContent = '';
    this.title = '';
    this.children = [];
  }
  setAttribute(k, v) { this._attrs.set(k, String(v)); }
  getAttribute(k) { return this._attrs.get(k) ?? null; }
  removeAttribute(k) { this._attrs.delete(k); }
  getAttributeNames() { return [...this._attrs.keys()]; }
  appendChild(c) { this.children.push(c); return c; }
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

// Fake DOM bootstrap
// window must be defined BEFORE lifecycle.js is imported (it references window
// inside the module body at line 1897 during probeSemanticLane execution).

const elementsById = new Map();

const fakeBody = new FakeElement('body');
fakeBody.dataset = {};

const win = {
  setInterval: (fn, ms) => setInterval(fn, ms),  // real Node timer
  clearInterval: (id) => clearInterval(id),
  setTimeout,
  clearTimeout,
  updateSemanticLaneAssistUi: () => {},
  scheduleSemanticLaneCooldownProbe: () => {},
  clearSemanticLaneCooldownProbeTimer: () => {},
  fetchSemanticLaneOpsSummary: () => Promise.resolve(null),
  renderSemanticLaneOpsSummary: () => {},
  updateLegendGuideState: () => {},
};
Object.defineProperty(globalThis, 'window', {
  value: win,
  writable: true,
  configurable: true,
});

globalThis.document = {
  body: fakeBody,
  visibilityState: 'visible',
  getElementById: (id) => elementsById.get(id) || null,
  querySelector: (sel) => {
    if (sel === '.search-container') {
      return elementsById.get('search-container') || null;
    }
    return null;
  },
  querySelectorAll: () => [],
  createElement: (tag) => new FakeElement(tag),
};
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node' },
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, 'crypto', {
  value: { randomUUID: () => 'fake-uuid-' + Math.random().toString(36).slice(2) },
  writable: true,
  configurable: true,
});
// AbortController is native in Node 24; no override needed

// State & lifecycle imports

const { state } = await import('../js/state.js');

let lifecycleExports;
try {
  lifecycleExports = await import('../js/modules/lifecycle.js');
} catch (err) {
  console.error('Could not import lifecycle.js:', err.message);
  process.exit(1);
}

// Test helpers

function registerLaneElements() {
  const pill = new FakeElement('span');
  pill.id = 'semantic-lane-pill';
  elementsById.set('semantic-lane-pill', pill);

  const assist = new FakeElement('div');
  assist.id = 'semantic-lane-assist';
  elementsById.set('semantic-lane-assist', assist);
  elementsById.set('semantic-lane-assist-copy', new FakeElement('div'));
  elementsById.set('semantic-lane-assist-meta', new FakeElement('div'));

  const ops = new FakeElement('div');
  ops.id = 'semantic-lane-ops';
  elementsById.set('semantic-lane-ops', ops);

  const container = new FakeElement('div');
  container.classList.add('search-container');
  container.id = 'search-container';
  elementsById.set('search-container', container);

  const searchInput = new FakeElement('input');
  searchInput.id = 'search-input';
  searchInput.value = '';
  elementsById.set('search-input', searchInput);

  return { pill, assist, ops, container };
}

function resetState() {
  document.visibilityState = 'visible';
  state.semanticLaneMonitorTimer = null;
  state.semanticLaneProbePromise = null;
  state.semanticLaneOpsMode = false;
  state.semanticLaneOpsFetchPromise = null;
  state.semanticLaneOpsRefreshTimer = null;
  state.semanticLanePendingWarm = false;
  state.semanticLaneState = 'checking';
  state.semanticLaneSnapshot = null;
  state.selectedPoint = null;
  state.focusedNode = null;
  state.navState = { mode: 'idle', focusedIndex: null };
  state.currentSearchSummary = null;
}

// CONTRACT 1: Exported API surface
// Verifies all 8 functions that will become semantic-lane.js exports are
// exported from lifecycle.js (the current location of the cluster).

const expectedExports = [
  'fetchSemanticLaneHealth',
  'applySemanticLaneHealthPayload',
  'shouldWarmSemanticLane',
  'probeSemanticLane',
  'scheduleSemanticLaneMonitor',
  'setSemanticLaneUiState',
  'recordSemanticLaneSnapshot',
  'setSemanticLaneOpsMode',
];

expectedExports.forEach((name) => {
  assert(
    typeof lifecycleExports[name] === 'function',
    `lifecycle.js must export '${name}'`
  );
});
console.log(`PASS CONTRACT 1: All ${expectedExports.length} lane functions exported from lifecycle.js`);

// CONTRACT 2: Sanitizer rejects internal labels
// The sanitizers prevent internal lane terminology from leaking into user-facing UI.
// Before extraction: private functions in lifecycle.js.
// After extraction: private to semantic-lane.js.

const laneExports = lifecycleExports;

// `sanitizeProvenanceLabel` is private but exercised via `applySemanticLaneHealthPayload`.
// Test via the public API: applySemanticLaneHealthPayload -> setSemanticLaneUiState.

const LABEL_REJECT = [
  'Lane: warm thread',
  'Ops: cold',
  'PROBING semantic lane',
  'semantic lane: degraded',
  'semanticlaneops active',
  'semantic_lane_ops mode',
  '  padded  ',
  'A'.repeat(61),          // > 60 chars
  'cold start',
  'warm thread ready',
  'embed thread analysis',
  'Static Dev Mode',
];

const LABEL_ALLOW = [
  'Community connections',
  'Regional search',
  'Business leads',
  'Market overview',
];

let { pill, container } = registerLaneElements();

LABEL_REJECT.forEach((label) => {
  resetState();
  state.currentSearchSummary = null;
  state.focusedNode = null;
  state.navState.focusedIndex = null;
  state.selectedPoint = null;
  document.body.dataset.graphContext = '';

  laneExports.applySemanticLaneHealthPayload(
    { ok: true, state: 'healthy', provenance: { label, detail: null } },
    {}
  );

  // A rejected label should result in fallback label 'Search ready'
  assert(
    pill.textContent === 'Search ready',
    `sanitizer must reject internal label '${label}' - got: '${pill.textContent}'`
  );
});

LABEL_ALLOW.forEach((label) => {
  resetState();
  state.currentSearchSummary = null;
  state.focusedNode = null;
  state.navState.focusedIndex = null;
  state.selectedPoint = null;
  document.body.dataset.graphContext = '';

  laneExports.applySemanticLaneHealthPayload(
    { ok: true, state: 'healthy', provenance: { label, detail: null } },
    {}
  );

  assert(
    pill.textContent === label,
    `sanitizer must allow clean label '${label}' - got: '${pill.textContent}'`
  );
});

console.log(`PASS CONTRACT 2: Provenance sanitizer rejects ${LABEL_REJECT.length} internal terms, allows ${LABEL_ALLOW.length} clean labels`);

// CONTRACT 3: recordSemanticLaneSnapshot merge behavior
// recordSemanticLaneSnapshot must merge into existing snapshot, not replace it.

resetState();
const snap1 = laneExports.recordSemanticLaneSnapshot({ retry_count: 3, retry_source: 'warmup' });
assert(snap1.retry_count === 3, 'first merge must set retry_count');
assert(snap1.retry_source === 'warmup', 'first merge must set retry_source');
assert(typeof snap1.checked_at === 'string', 'first merge must stamp checked_at');

const snap2 = laneExports.recordSemanticLaneSnapshot({ retry_source: null, retry_total: 99 });
assert(snap2.retry_count === 3, 'second merge must preserve existing retry_count');
assert(snap2.retry_source === null, 'second merge must clear retry_source');
assert(snap2.retry_total === 99, 'second merge must set new retry_total');
assert(typeof snap2.checked_at === 'string', 'second merge must update checked_at');

console.log('PASS CONTRACT 3: recordSemanticLaneSnapshot merges correctly');

// CONTRACT 4: probeSemanticLane deduplication
// While a probe is in-flight, calling probeSemanticLane again must not start a
// second fetch. Warm requests during an active probe must queue a follow-up warm.

resetState();
state.semanticLaneState = 'checking';
state.semanticLanePendingWarm = false;
state.semanticLaneProbePromise = null;

const origFetch = globalThis.fetch;
let fetchCalls = 0;
let resolveFetch;
globalThis.fetch = async (url, opts) => {
  fetchCalls += 1;
  return new Promise((resolve) => {
    resolveFetch = resolve;
  });
};

// Start first probe (dedup slot is null so it proceeds)
const p1 = laneExports.probeSemanticLane({ warm: false, reason: 'interval' });
assert(p1 instanceof Promise, 'probeSemanticLane must return a Promise');

// Start second probe while first is in-flight. The async export may return a
// wrapper Promise, so the contract is the observable request behavior.
const p2 = laneExports.probeSemanticLane({ warm: true, reason: 'focus' });
assert(fetchCalls === 1, 'concurrent probe must not start a second fetch');
assert(state.semanticLanePendingWarm === true, 'warm request during active probe must queue pending warm');

// Third probe also deduped
const p3 = laneExports.probeSemanticLane({ warm: false, reason: 'visibility' });
assert(fetchCalls === 1, 'third probe must also reuse the active fetch');

resolveFetch({
  ok: true,
  json: async () => ({ ok: true, state: 'healthy', provenance: { label: 'Community connections', detail: 'Semantic search is ready.' } })
});
await Promise.all([p1, p2, p3]);

globalThis.fetch = origFetch;
state.semanticLaneProbePromise = null;
state.semanticLanePendingWarm = false;

console.log('PASS CONTRACT 4: probeSemanticLane deduplicates in-flight probes');

// CONTRACT 5: setSemanticLaneUiState DOM propagation
// setSemanticLaneUiState must update pill text, aria-label, dataset.state,
// and .search-container dataset.laneState. Assist panel must be hidden on healthy
// when no focus record is selected.

const TEST_CASES = [
  {
    laneState: 'healthy',
    pillExpected: 'Search: ready',
    ariaExpected: 'Search is ready.',
    pillDatasetState: 'healthy',
    containerDatasetLaneState: 'healthy',
    assistHidden: true,
  },
  {
    laneState: 'reconnecting',
    pillExpected: 'Search: reconnecting',
    ariaExpected: 'Search is refreshing in the background.',
    pillDatasetState: 'reconnecting',
    containerDatasetLaneState: 'reconnecting',
    assistHidden: false,  // not healthy so assist not hidden
  },
  {
    laneState: 'degraded',
    pillExpected: 'Search: warming up',
    ariaExpected: 'Search is still getting ready.',
    pillDatasetState: 'degraded',
    containerDatasetLaneState: 'degraded',
    assistHidden: false,
  },
];

for (const tc of TEST_CASES) {
  resetState();
  state.selectedPoint = null;
  state.focusedNode = null;
  state.navState.focusedIndex = null;
  document.body.dataset.graphContext = '';

  const { pill: p, container: c, assist } = registerLaneElements();

  laneExports.setSemanticLaneUiState(tc.laneState, {});

  assert(p.textContent === tc.pillExpected, `healthy pill text - got: '${p.textContent}', want: '${tc.pillExpected}'`);
  assert(p.getAttribute('aria-label') === tc.ariaExpected, `aria-label - got: '${p.getAttribute('aria-label')}', want: '${tc.ariaExpected}'`);
  assert(p.dataset.state === tc.pillDatasetState, `pill dataset.state - got: '${p.dataset.state}', want: '${tc.pillDatasetState}'`);
  assert(c.dataset.laneState === tc.containerDatasetLaneState, `container dataset.laneState - got: '${c.dataset.laneState}', want: '${tc.containerDatasetLaneState}'`);
  assert(assist.hidden === tc.assistHidden, `assist hidden=${tc.assistHidden} for laneState=${tc.laneState} - got: ${assist.hidden}`);
}

console.log('PASS CONTRACT 5: setSemanticLaneUiState DOM propagation across all lane states');

// CONTRACT 6: window bridges are assigned
// The install block must assign these functions to window so external callers
// (semantic-dive-ui.js, browser console, etc.) can reach them.

const requiredBridges = [
  'setSemanticLaneUiState',
  'probeSemanticLane',
  'scheduleSemanticLaneMonitor',
  'setSemanticLaneOpsMode',
  'recordSemanticLaneSnapshot',
];

for (const bridge of requiredBridges) {
  assert(
    typeof globalThis.window[bridge] === 'function',
    `window.${bridge} must be assigned a function`
  );
}

console.log(`PASS CONTRACT 6: All ${requiredBridges.length} window bridges assigned`);

// CONTRACT 7: shouldWarmSemanticLane logic
// Returns true for focus/visibility reasons and when search is active.

resetState();
assert(laneExports.shouldWarmSemanticLane('focus') === true, 'focus reason triggers warm');
assert(laneExports.shouldWarmSemanticLane('visibility') === true, 'visibility reason triggers warm');

state.currentSearchSummary = null;
const searchInput = elementsById.get('search-input');
if (searchInput) searchInput.value = '';

resetState();
state.currentSearchSummary = { resultIndices: [0, 1] };
assert(laneExports.shouldWarmSemanticLane('interval') === true, 'active search triggers warm');

resetState();
state.currentSearchSummary = null;
if (searchInput) searchInput.value = 'ab';  // >= 2 chars
assert(laneExports.shouldWarmSemanticLane('interval') === true, 'search input >= 2 chars triggers warm');

resetState();
state.currentSearchSummary = null;
if (searchInput) searchInput.value = 'a';   // < 2 chars
assert(laneExports.shouldWarmSemanticLane('interval') === false, 'search input < 2 chars does not trigger warm');

resetState();
document.visibilityState = 'hidden';
state.currentSearchSummary = { resultIndices: [0, 1] };
assert(laneExports.shouldWarmSemanticLane('interval') === false, 'hidden document suppresses warm even with search');

console.log('PASS CONTRACT 7: shouldWarmSemanticLane logic guards are correct');

// CONTRACT 8: Ops mode toggle assigns window.setSemanticLaneOpsMode
// setSemanticLaneOpsMode must wire to window for external callers.

resetState();
const { ops } = registerLaneElements();
assert(typeof globalThis.window.setSemanticLaneOpsMode === 'function', 'window.setSemanticLaneOpsMode must exist before toggle');

laneExports.setSemanticLaneOpsMode(true);
assert(state.semanticLaneOpsMode === true, 'ops mode must be enabled');
assert(ops.hidden === false, 'ops panel must be visible when ops mode on');

laneExports.setSemanticLaneOpsMode(false);
assert(state.semanticLaneOpsMode === false, 'ops mode must be disabled');
assert(ops.hidden === true, 'ops panel must be hidden when ops mode off');

console.log('PASS CONTRACT 8: setSemanticLaneOpsMode toggle works, panel toggles correctly');

// CONTRACT 9: Lifecycle install block lane bridge line count
// Verify the window bridges are still present in lifecycle.js install block.
// This is a structural check that the bridges exist at known line numbers.

const fs = await import('fs');
const lifecycleSource = fs.readFileSync('./js/modules/lifecycle.js', 'utf8');

const bridgeLines = [
  'window.setSemanticLaneUiState = setSemanticLaneUiState;',
  'window.probeSemanticLane = probeSemanticLane;',
  'window.scheduleSemanticLaneMonitor = scheduleSemanticLaneMonitor;',
  'window.setSemanticLaneOpsMode = setSemanticLaneOpsMode;',
  'window.recordSemanticLaneSnapshot = recordSemanticLaneSnapshot;',
  'window.refreshSemanticLaneOpsSummary = refreshSemanticLaneOpsSummary;',
];

bridgeLines.forEach((line) => {
  assert(
    lifecycleSource.includes(line),
    `lifecycle.js install block must contain: ${line}`
  );
});

console.log(`PASS CONTRACT 9: All ${bridgeLines.length} lane window bridges present in lifecycle.js install block`);

// CONTRACT 10: applySemanticLaneHealthPayload structure
// applySemanticLaneHealthPayload must call recordSemanticLaneSnapshot and setSemanticLaneUiState.

resetState();
registerLaneElements();

const payload = { ok: true, state: 'healthy', provenance: { label: 'Community connections', detail: 'Semantic search is ready.' } };
laneExports.applySemanticLaneHealthPayload(payload, {});

assert(state.semanticLaneSnapshot !== null, 'applySemanticLaneHealthPayload must call recordSemanticLaneSnapshot');
assert(state.semanticLaneState === 'healthy', 'applySemanticLaneHealthPayload must set state.semanticLaneState');

console.log('PASS CONTRACT 10: applySemanticLaneHealthPayload calls snapshot and UI state');

// Summary

console.log('\n=== semantic-lane-contract.mjs PASSED ===');
console.log('All 10 contracts verified. Lifecycle.js is safe to extract semantic-lane.js from.');
