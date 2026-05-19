/**
 * Fast contract tests for semantic-dive reverse transition behavior.
 * Verifies that galaxy-after-map does NOT auto-reactivate semantic dive
 * merely because trail depth remains high.
 * Runs in Node with minimal DOM/state shims — no browser needed.
 */

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.textContent = '';
    this.inert = false;
    this.title = '';
  }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  querySelector(selector) { return this.children.find((c) => c.selector === selector) || null; }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const elementsById = new Map();

globalThis.window = {};
globalThis.document = {
  body: new FakeElement('body'),
  getElementById: (id) => elementsById.get(id) || null,
};

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
const { state } = await import('../js/state.js');
const { syncSemanticDiveUi } = await import('../js/modules/semantic-dive-ui.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetDom() {
  elementsById.clear();
  document.body = new FakeElement('body');
  const make = (tag) => { const el = new FakeElement(tag); elementsById.set(el.tagName.toLowerCase(), el); return el; };
  // Required elements that syncSemanticDiveUi touches
  make('div'); // focus-stage-inside-controls
  const status = make('div'); // focus-stage-inside-status
  const statusCopy = make('span'); // focus-stage-inside-status-copy
  const insideNext = make('button'); // btn-inside-next
  make('button'); // btn-inside-county
  make('div'); // focus-stage-kicker
  make('div'); // journey-compass
  elementsById.set('focus-stage-inside-status', status);
  elementsById.set('focus-stage-inside-status-copy', statusCopy);
  elementsById.set('btn-inside-next', insideNext);
}

function resetState() {
  state.focusedNode = null;
  state.currentView = 'galaxy';
  state.trailDepth = 0;
  state.strandContinuityState = { phase: 'idle' };
  state.navState.focusedIndex = null;
  state.navState.explorationHistoryIndices = [];
  state.semanticDiveMode = false;
  document.body.dataset = {};
  window.getCurrentTrailFocusIndex = undefined;
  window.getNextExploreCandidateForIndex = undefined;
  window.getNextWalkCandidateForIndex = undefined;
}

// ---------------------------------------------------------------------------
// TEST: map -> galaxy (no focus) does NOT reactivate semantic dive
// even when trailDepth is high
// ---------------------------------------------------------------------------
resetDom();
resetState();

// Enter dive mode with focus first (trailDepth 2)
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.trailDepth = 2;
state.currentView = 'galaxy';
state.semanticDiveMode = true; // simulate user pressed "Step Inside"
window.getCurrentTrailFocusIndex = () => 4;
window.getNextExploreCandidateForIndex = () => ({ index: 8 });
resetDom();
syncSemanticDiveUi();

assert(state.semanticDiveMode === true, 'dive active with focus and trailDepth 2');
assert(document.body.dataset.semanticDive === 'active', 'body.dataset.semanticDive is active');

// Now simulate user navigates to map (e.g. via btn-inside-county equivalent)
state.currentView = 'map';
resetDom();
syncSemanticDiveUi();

assert(state.currentView === 'map', 'view is now map');
assert(state.semanticDiveMode === false, 'map view clears semanticDiveMode');
assert(document.body.dataset.semanticDive === 'inactive', 'map forces dive inactive');

// Preserve trailDepth but clear focus (user went back to county view)
state.trailDepth = 2; // stays high
state.focusedNode = null;
state.navState.focusedIndex = null;
state.semanticDiveMode = false;
state.currentView = 'galaxy';
resetDom();
syncSemanticDiveUi();

assert(document.body.dataset.semanticDive === 'inactive', 'galaxy-without-focus is inactive even with trailDepth 2');
assert(state.semanticDiveMode === false, 'semanticDiveMode stays false — no auto-reactivation');

// ---------------------------------------------------------------------------
// TEST: galaxy-without-focus is always inactive regardless of trailDepth
// ---------------------------------------------------------------------------
resetDom();
resetState();

state.trailDepth = 10; // artificially high trail depth
state.focusedNode = null;
state.currentView = 'galaxy';
syncSemanticDiveUi();

assert(document.body.dataset.semanticDive === 'inactive', 'high trailDepth without focus is inactive');
assert(state.semanticDiveMode === false, 'semanticDiveMode stays false without focus');

// ---------------------------------------------------------------------------
// TEST: map view always forces inactive — explicit guard in syncSemanticDiveUi
// ---------------------------------------------------------------------------
resetDom();
resetState();

state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.trailDepth = 2;
state.currentView = 'galaxy';
state.semanticDiveMode = true;

// Switch to map while dive is active
state.currentView = 'map';
resetDom();
syncSemanticDiveUi();

assert(state.currentView === 'map', 'currentView is map');
assert(state.semanticDiveMode === false, 'map view guards semanticDiveMode off');
assert(document.body.dataset.semanticDive === 'inactive', 'map forces dataset dive inactive');

// ---------------------------------------------------------------------------
// TEST: syncSemanticDiveUi enforces canDive = galaxy && hasFocus
// ---------------------------------------------------------------------------
resetDom();
resetState();

state.currentView = 'galaxy';
state.focusedNode = null; // no focus
state.semanticDiveMode = true; // stale mode
syncSemanticDiveUi();

assert(state.semanticDiveMode === false, 'no-focus galaxy clears stale semanticDiveMode');
assert(document.body.dataset.semanticDive === 'inactive', 'no-focus galaxy dataset is inactive');

// ---------------------------------------------------------------------------
// TEST: currentView=map guard is explicit — no reactivation on galaxy without focus
// ---------------------------------------------------------------------------
resetDom();
resetState();

state.currentView = 'map';
state.focusedNode = null;
state.trailDepth = 5;
state.semanticDiveMode = false;

// Transition map -> galaxy without focus
state.currentView = 'galaxy';
syncSemanticDiveUi();

assert(document.body.dataset.semanticDive === 'inactive', 'map->galaxy without focus stays inactive');
assert(state.semanticDiveMode === false, 'map->galaxy without focus does not re-enable semanticDiveMode');

// ---------------------------------------------------------------------------
// Done
// ---------------------------------------------------------------------------
console.log('semantic-dive-reverse-contract passed');