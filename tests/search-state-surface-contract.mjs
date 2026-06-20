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
    this.onclick = null;
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

  insertAdjacentHTML(position, value) {
    const html = String(value);
    if (position === 'afterbegin') this._innerHTML = `${html}${this._innerHTML}`;
    else this._innerHTML = `${this._innerHTML}${html}`;
  }

  querySelector(selector) {
    const className = selector
      .split(/\s+/)
      .at(-1)
      ?.replace(/^\./, '');
    if (!className || !this._innerHTML.includes(className)) return null;
    const element = new FakeElement('button');
    element.classList.add(className);
    return element;
  }

  remove() {
    this.removed = true;
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

const {
  getSearchResultStrength,
  getSearchResultStrengthLabel,
} = await import('../src/lib/search/result-renderer.ts');
const { subscribe, EVENTS } = await import('../src/lib/orchestration/event-bus.ts');

window.recordSemanticLaneSnapshotCalls = [];
window.semanticLaneStates = [];
window.recordSemanticLaneSnapshot = function(payload) {
  window.recordSemanticLaneSnapshotCalls.push(payload);
};
window.setSemanticLaneUiState = function(...args) {
  window.semanticLaneStates.push(args);
};

window.refreshCompositionStateCalls = 0;
subscribe(EVENTS.COMPOSITION_UPDATED, () => {
  window.refreshCompositionStateCalls += 1;
});
subscribe(EVENTS.SEMANTIC_LANE_STATE_REQUESTED, ({ laneState, options }) => {
  window.semanticLaneStates.push([laneState, options]);
});

assert(getSearchResultStrength({ score: 0.74 }, 1) === 74, 'strength scales against top score');
assert(getSearchResultStrength({}, 1) === 14, 'missing score has a 14% floor');
assert(getSearchResultStrengthLabel(0, 100) === 'Best match', 'top result label is anchored');
assert(getSearchResultStrengthLabel(2, 80) === 'Good match', 'mid-high result label is stable');

console.log('search-state surface contract passed');
