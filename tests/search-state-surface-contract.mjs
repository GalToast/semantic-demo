/**
 * Fast surface contract checks for search-state result rendering and degraded
 * search UI. Runs in Node with a tiny DOM shim so this can gate one surface
 * without browser E2E.
 */

class FakeClassList {
  constructor() {
    this.items = new Set();
  }

  add(...names) {
    names.forEach((name) => this.items.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.items.delete(name));
  }

  contains(name) {
    return this.items.has(name);
  }

  toggle(name, force) {
    const shouldAdd = typeof force === 'boolean' ? force : !this.items.has(name);
    if (shouldAdd) this.items.add(name);
    else this.items.delete(name);
    return shouldAdd;
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.textContent = '';
    this.scrollTop = -1;
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const elementsById = new Map();
const searchContainer = new FakeElement('div');
globalThis.window = {
  location: { search: '' },
  history: { replaceState: () => {} },
  updateUrlStateCalls: [],
  recordSemanticLaneSnapshotCalls: [],
  semanticLaneStates: [],
  setSearchPanelStateCalls: [],
  updateUrlState(...args) {
    this.updateUrlStateCalls.push(args);
  },
  recordSemanticLaneSnapshot(payload) {
    this.recordSemanticLaneSnapshotCalls.push(payload);
  },
  setSemanticLaneUiState(...args) {
    this.semanticLaneStates.push(args);
  },
  setSearchPanelState(payload) {
    this.setSearchPanelStateCalls.push(payload);
  },
  refreshCompositionStateCalls: 0,
  refreshCompositionState() {
    this.refreshCompositionStateCalls += 1;
  },
};
globalThis.document = {
  body: new FakeElement('body'),
  createElement: (tagName) => new FakeElement(tagName),
  getElementById: (id) => elementsById.get(id) || null,
  querySelector: (selector) => (selector === '.search-container' ? searchContainer : null),
};
globalThis.sessionStorage = {
  values: new Map(),
  getItem(key) {
    return this.values.get(key) ?? null;
  },
  setItem(key, value) {
    this.values.set(key, String(value));
  },
  removeItem(key) {
    this.values.delete(key);
  },
};
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node' },
  configurable: true,
});

elementsById.set('search-spinner', new FakeElement('div'));

const { state } = await import('../js/state.js');
const {
  buildSearchResultItemHtml,
  getSearchResultStrength,
  getSearchResultStrengthLabel,
  renderSearchResultItems,
  applySemanticSearchDegradedState,
} = await import('../js/modules/search-state.js');

window.recordSemanticLaneSnapshotCalls = [];
window.semanticLaneStates = [];
window.recordSemanticLaneSnapshot = function(payload) {
  window.recordSemanticLaneSnapshotCalls.push(payload);
};
window.setSemanticLaneUiState = function(...args) {
  window.semanticLaneStates.push(args);
};

window.refreshCompositionStateCalls = 0;
window.refreshCompositionState = function() {
  window.refreshCompositionStateCalls += 1;
};

state.points = [
  { cluster: 2 },
  { cluster: 2 },
  { cluster: 7 },
  { cluster: 8 },
  { cluster: 9 },
  { cluster: 10 },
];
state.currentSearchSummary = null;

assert(getSearchResultStrength({ score: 0.74 }, 1) === 74, 'strength scales against top score');
assert(getSearchResultStrength({}, 1) === 14, 'missing score has a 14% floor');
assert(getSearchResultStrengthLabel(0, 100) === 'Search Anchor', 'top result label is anchored');
assert(getSearchResultStrengthLabel(2, 80) === 'Strong Signal', 'mid-high result label is stable');

const result = {
  index: 1,
  score: 0.84,
  publicNote: '<script>alert("bad")</script> public record',
  point: {
    name: 'alpha coffee llc',
    what: 'Coffee shop',
    city: 'Conroe',
    cluster: 2,
    website: 'https://example.com',
    email: 'hello@example.com',
    phone: '555-0100',
  },
};
const html = buildSearchResultItemHtml(result, 0, {
  trimmedQuery: 'coffee',
  topIndex: 1,
  anchorIndex: 1,
  topScore: 0.84,
});

assert(html.includes('role="button"'), 'search result keeps button-like role');
assert(html.includes('tabindex="0"'), 'search result remains keyboard focusable');
assert(html.includes('Anchor'), 'anchor label renders for anchored result');
assert(html.includes('Search Anchor'), 'strength label renders for top result');
assert(html.includes('Website available'), 'website badge title renders');
assert(html.includes('&lt;script&gt;'), 'public note is escaped');
assert(!html.includes('<script>alert'), 'raw script markup is not injected');
assert(html.includes('width:100%'), 'top strength renders a full result bar');

const resultsEl = new FakeElement('section');
const statusEl = new FakeElement('div');
const results = Array.from({ length: 7 }, (_, index) => ({
  ...result,
  index,
  score: 1 - index * 0.05,
  point: { ...result.point, name: `Result ${index}`, cluster: index % 3 },
}));
renderSearchResultItems(resultsEl, results, {
  trimmedQuery: 'coffee',
  topIndex: 0,
  anchorIndex: 0,
  topScore: 1,
}, statusEl);

assert(resultsEl.innerHTML.match(/search-result-item/g)?.length === 5, 'initial render shows five results');
assert(resultsEl.children.length === 1, 'show-more button is appended when results are hidden');
assert(resultsEl.children[0].textContent === 'Show 2 more results', 'show-more count is exact');
assert(resultsEl.scrollTop === 0, 'render resets results scroll');

const degradedResults = new FakeElement('section');
const degradedStatus = new FakeElement('div');
applySemanticSearchDegradedState(
  degradedResults,
  degradedStatus,
  'coffee',
  new Error('Backend not ready')
);

assert(degradedResults.classList.contains('active'), 'degraded empty rail becomes active');
assert(degradedResults.innerHTML.includes('Retry needed'), 'degraded state uses retry-needed label');
assert(degradedResults.innerHTML.includes('search-error-retry-btn'), 'degraded state offers retry action');
assert(degradedResults.innerHTML.includes('search-error-dismiss-btn'), 'degraded state offers dismiss action');
assert(degradedStatus.textContent === 'Search paused for "coffee". Try again in a moment.', 'degraded status copy is stable');
assert(degradedStatus.hidden === false, 'degraded status is exposed for compact status display');
assert(degradedStatus.classList.contains('search-status-compact'), 'degraded status uses compact status class');
assert(searchContainer.classList.contains('search-degraded'), 'degraded search panel state is explicit');
assert(window.refreshCompositionStateCalls > 0, 'degraded state refreshes composition context');
assert(window.recordSemanticLaneSnapshotCalls.at(-1)?.state === 'degraded', 'lane snapshot records degraded state');
assert(window.semanticLaneStates.at(-1)?.[0] === 'degraded', 'lane UI is marked degraded');

state.currentSearchSummary = { query: 'coffee', visibleMatches: 5 };
const staleResults = new FakeElement('section');
staleResults.innerHTML = '<div>existing result</div>';
const staleStatus = new FakeElement('div');
applySemanticSearchDegradedState(staleResults, staleStatus, 'coffee', new Error('Backend not ready'));

assert(staleResults.innerHTML === '<div>existing result</div>', 'same-query degraded state preserves stale results');
assert(staleStatus.textContent.includes('Keeping the last 5 matches visible'), 'same-query degraded copy preserves context');

console.log('search-state surface contract passed');
