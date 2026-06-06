/**
 * Fast contract for graph composition ownership. This guards the UI seam where
 * a degraded search and a focused business can otherwise leave stale search
 * chrome competing with the focus rail.
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
    const next = force === undefined ? !this.items.has(name) : !!force;
    if (next) this.items.add(name);
    else this.items.delete(name);
    return next;
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.dataset = {};
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.style = {};
    this.hidden = false;
    this.textContent = '';
    this.title = '';
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const elementsById = new Map();
const searchIntentEl = new FakeElement('section');
searchIntentEl.classList.add('search-results', 'active');

globalThis.window = {
    location: { hostname: '' },
    setTimeout: typeof setTimeout !== 'undefined' ? setTimeout : () => 0,
    clearTimeout: typeof clearTimeout !== 'undefined' ? clearTimeout : () => {},
};

globalThis.document = {
  body: new FakeElement('body'),
  getElementById: (id) => elementsById.get(id) || null,
  querySelector(selector) {
    if (selector === '.search-container.has-query .search-results.active') return searchIntentEl;
    return null;
  },
  querySelectorAll() {
    return [];
  },
};
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node' },
  configurable: true,
});

const searchInput = new FakeElement('input');
searchInput.value = 'roof repair';
elementsById.set('search-input', searchInput);

const lanePill = new FakeElement('span');
elementsById.set('semantic-lane-pill', lanePill);
const laneAssist = new FakeElement('div');
elementsById.set('semantic-lane-assist', laneAssist);
elementsById.set('semantic-lane-assist-copy', new FakeElement('div'));
elementsById.set('semantic-lane-assist-meta', new FakeElement('div'));

const { state, withStateMutation } = await import('../js/state.js');

const {
  refreshCompositionState,
  setSemanticLaneUiState,
} = await import('../js/modules/lifecycle.js');

withStateMutation(() => {
  state.currentView = 'galaxy';
  state.currentSearchSummary = null;
  state.selectedPoint = { name: '1475 LAS Cuevas, LLC' };
  state.focusedNode = null;
  state.navState.mode = 'trail';
  state.navState.focusedIndex = 12;
  state.semanticDiveMode = false;
});
document.body.dataset.mobileRoutePeek = 'active';
document.body.dataset.mobileRoutePeekReason = 'contract';

refreshCompositionState();

assert(document.body.dataset.activeView === 'galaxy', 'active view is synchronized');
assert(document.body.dataset.graphContext === 'focus-search', 'focused record plus degraded search intent owns focus-search context');
assert(document.body.dataset.panelSurface === 'focus-search', 'focused record plus search intent owns the focus-search panel surface');
assert(document.body.dataset.trailState === 'active', 'focused record plus search intent marks trail active');
assert(document.body.dataset.semanticDive === 'inactive', 'semantic dive stays inactive before Step Inside');
assert(document.body.dataset.mobileRoutePeek === undefined, 'non-idle graph context clears mobile route peek');
assert(document.body.dataset.mobileRoutePeekReason === undefined, 'non-idle graph context clears mobile route peek reason');


setSemanticLaneUiState('degraded', {
  label: 'Search paused',
  title: 'Search is recovering in the background.',
});

assert(laneAssist.hidden === true, 'focus-owned rail hides degraded assist panel');
assert(laneAssist.style.display === 'none', 'focus-owned rail removes assist panel from layout');
assert(laneAssist.dataset.state === 'idle', 'hidden assist panel returns to idle state');
assert(lanePill.textContent === 'Search paused', 'lane pill can still carry compact status');
assert(lanePill.getAttribute('aria-label') === 'Search is recovering in the background.', 'lane pill keeps accessible compact status');

console.log('lifecycle composition contract passed');
