/**
 * Fast surface contract checks for Step Inside UI state. Runs in Node with a
 * tiny DOM shim so semantic-dive-ui can be tested without browser E2E.
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

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'title') this.title = '';
  }

  querySelector(selector) {
    return this.children.find((child) => child.selector === selector) || null;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function makeDiveButton() {
  const button = new FakeElement('button');
  const label = new FakeElement('span');
  label.selector = '.focus-stage-dive-label';
  const copy = new FakeElement('span');
  copy.selector = '.focus-stage-dive-copy';
  button.appendChild(label);
  button.appendChild(copy);
  return { button, label, copy };
}

const elementsById = new Map();
globalThis.window = {};
globalThis.document = {
  body: new FakeElement('body'),
  getElementById: (id) => elementsById.get(id) || null,
  querySelectorAll: () => [],
};

const { state } = await import('../js/state.js');
const { syncSemanticDiveUi } = await import('../js/modules/semantic-dive-ui.js');

function resetDom() {
  elementsById.clear();
  document.body = new FakeElement('body');
  const dive = makeDiveButton();
  elementsById.set('btn-focus-dive', dive.button);
  elementsById.set('focus-stage-inside-controls', new FakeElement('div'));
  elementsById.set('focus-stage-inside-status', new FakeElement('div'));
  elementsById.set('focus-stage-inside-status-copy', new FakeElement('div'));
  elementsById.set('btn-inside-next', new FakeElement('button'));
  elementsById.set('btn-inside-county', new FakeElement('button'));
  return {
    diveButton: dive.button,
    diveLabel: dive.label,
    diveCopy: dive.copy,
    insideControls: elementsById.get('focus-stage-inside-controls'),
    insideStatus: elementsById.get('focus-stage-inside-status'),
    insideStatusCopy: elementsById.get('focus-stage-inside-status-copy'),
    insideNext: elementsById.get('btn-inside-next'),
    insideCounty: elementsById.get('btn-inside-county'),
  };
}

function resetState() {
  state.focusedNode = null;
  state.currentView = 'galaxy';
  state.trailDepth = 0;
  state.strandContinuityState = { phase: 'idle' };
  state.navState.focusedIndex = null;
  window.getCurrentTrailFocusIndex = undefined;
  window.getNextExploreCandidateForIndex = undefined;
  window.getNextWalkCandidateForIndex = undefined;
}

resetState();
let dom = resetDom();
syncSemanticDiveUi();
assert(document.body.dataset.semanticDive === 'inactive', 'no-focus state is inactive');
assert(dom.insideControls.getAttribute('aria-hidden') === 'true', 'inside controls hidden without focus');
assert(dom.insideControls.inert === true, 'inside controls inert without focus');
assert(dom.insideStatus.getAttribute('aria-hidden') === 'true', 'inside status hidden without focus');
assert(dom.insideStatus.getAttribute('role') === 'status', 'inside status keeps status role');
assert(dom.insideStatus.getAttribute('aria-live') === 'polite', 'inside status remains polite');
assert(dom.insideStatusCopy.textContent === 'Step into this neighborhood to follow related businesses.', 'inactive copy is stable');
assert(dom.insideNext.disabled === true, 'next button disabled without candidate');
assert(dom.insideNext.textContent === 'Trail Complete', 'next button empty-state copy is stable');
assert(dom.insideNext.getAttribute('aria-disabled') === 'true', 'next button aria-disabled without candidate');
assert(dom.insideCounty.disabled === true, 'county button disabled without focus');
assert(dom.insideCounty.textContent === 'County', 'county button copy is stable');
assert(dom.diveButton.hidden === true, 'dive button hidden before trail depth');
assert(dom.diveButton.inert === true, 'dive button inert before trail depth');
assert(dom.diveButton.disabled === true, 'dive button disabled without focus');

resetState();
dom = resetDom();
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.trailDepth = 1;
syncSemanticDiveUi();
assert(document.body.dataset.semanticDive === 'inactive', 'focused pre-dive state remains inactive');
assert(dom.diveButton.hidden === false, 'dive button appears after first trail step');
assert(dom.diveButton.disabled === false, 'dive button enabled with galaxy focus');
assert(dom.diveButton.getAttribute('aria-disabled') === 'false', 'dive button aria-enabled with galaxy focus');
assert(dom.diveButton.getAttribute('aria-pressed') === 'false', 'dive button is not pressed before active mode');
assert(dom.diveLabel.textContent === 'Step Inside', 'focused label invites Step Inside');
assert(dom.diveCopy.textContent === 'Open the neighborhood around this business.', 'focused copy is stable');
assert(dom.insideCounty.disabled === false, 'county button is enabled when a node can dive');

resetState();
dom = resetDom();
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.trailDepth = 2;
window.getCurrentTrailFocusIndex = () => 4;
window.getNextWalkCandidateForIndex = (index, options) => {
  assert(index === 4, 'next-candidate lookup receives current focus index');
  assert(options.commitNeighborhood === false, 'next-candidate lookup does not commit neighborhood');
  return { index: 8 };
};
syncSemanticDiveUi();
assert(document.body.dataset.semanticDive === 'active', 'trail depth 2 activates semantic dive');
assert(document.body.dataset.journeyPhase === 'inside', 'active dive marks journey phase');
assert(document.body.dataset.insideWalkState === 'idle', 'active dive marks walk state');
assert(dom.insideControls.getAttribute('aria-hidden') === 'false', 'inside controls visible while active');
assert(dom.insideControls.inert === false, 'inside controls interactive while active');
assert(dom.insideStatus.getAttribute('aria-hidden') === 'false', 'inside status visible while active');
assert(dom.insideStatusCopy.textContent === 'Follow a connection or go back.', 'active next-candidate copy is stable');
assert(dom.insideNext.disabled === false, 'next button enabled with candidate');
assert(dom.insideNext.textContent === 'Next Stop', 'next button candidate copy is stable');
assert(dom.insideNext.getAttribute('aria-busy') === 'false', 'next button not busy at rest');
assert(dom.diveButton.getAttribute('aria-pressed') === 'true', 'dive button marks active state');
assert(dom.diveButton.getAttribute('aria-label') === 'Inside Neighborhood, use Next Stop to continue or County to exit', 'active aria-label is stable');
assert(dom.diveLabel.textContent === 'Inside Neighborhood', 'active label is stable');
assert(dom.diveCopy.textContent === 'Use Next Stop to continue or County to exit.', 'active copy is stable');

resetState();
dom = resetDom();
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.trailDepth = 2;
window.getNextWalkCandidateForIndex = () => null;
syncSemanticDiveUi();
assert(dom.insideStatusCopy.textContent === 'Inside this neighborhood. Pick another match or return to County.', 'active no-candidate copy is stable');
assert(dom.insideNext.disabled === true, 'next button disabled without candidate');
assert(dom.insideNext.textContent === 'Trail Complete', 'next button no-candidate copy is stable');

resetState();
dom = resetDom();
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.trailDepth = 2;
state.strandContinuityState = { phase: 'walking' };
window.getNextWalkCandidateForIndex = () => ({ index: 8 });
syncSemanticDiveUi();
assert(dom.insideNext.disabled === true, 'next button disabled while walking');
assert(dom.insideNext.getAttribute('aria-busy') === 'true', 'next button busy while walking');
assert(dom.insideNext.textContent === 'Following...', 'walking state copy is stable');

resetState();
dom = resetDom();
state.focusedNode = 4;
state.navState.focusedIndex = 4;
state.trailDepth = 2;
state.currentView = 'map';
syncSemanticDiveUi();
assert(document.body.dataset.semanticDive === 'inactive', 'map view forces semantic dive inactive');
assert(state.semanticDiveMode === true, 'map view preserves semanticDiveMode for return-to-galaxy resume');
assert(state.trailDepth === 2, 'map view preserves trailDepth for return-to-galaxy resume');
assert(dom.diveButton.disabled === true, 'map view disables dive button');

console.log('semantic-dive-ui surface contract passed');
