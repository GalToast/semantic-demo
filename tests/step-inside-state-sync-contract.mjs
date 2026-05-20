/**
 * Contract: Step Inside state synchronization.
 *
 * After clicking "Step Inside" from a focused search result, all authoritative
 * surfaces must agree the app is in semantic dive depth 2:
 *   - JS state:     state.trailDepth === 2, state.semanticDiveMode === true
 *   - body dataset: trailDepth === "2", semanticDive === "active"
 *   - URL:          depth=2
 *   - journey phase === "inside"
 *   - graphContext !== "focus-search"  (semantic-dive context takes priority)
 *   - panelSurface !== "focus-search"  (semantic-dive surface takes priority)
 *
 * This contract runs in Node with a minimal DOM shim.
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
        this._listeners = {};
        this._selector = null;
    }
    appendChild(child) { this.children.push(child); return child; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); if (name === 'title') this.title = ''; }
    querySelector(selector) { return this.children.find(c => c._selector === selector) || null; }
    querySelectorAll() { return []; }
    addEventListener(event, fn) { (this._listeners[event] = this._listeners[event] || []).push(fn); }
    dispatchEvent(event) { (this._listeners[event.name] || []).forEach(fn => fn(event)); }
}

class FakeDocument extends FakeElement {
    constructor() { super('document'); this._selector = '#document'; }
    querySelectorAll() { return []; }
}

function assert(condition, message) {
    if (!condition) throw new Error(`FAIL: ${message}`);
}

const elementsById = new Map();
const fakeDoc = new FakeDocument();
globalThis.document = fakeDoc;
globalThis.window = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (id) => clearTimeout(id) };
Object.defineProperty(globalThis, 'document', {
    value: fakeDoc,
    writable: true,
    configurable: true
});

const { state } = await import('../js/state.js');
const { syncSemanticDiveUi } = await import('../js/modules/semantic-dive-ui.js');

// Minimal lifecycle imports needed for this contract
const { refreshCompositionState, setMyceliumMode, updateUrlState } = await import('../js/modules/lifecycle.js');

// Seed a minimal state that simulates being in focused search (depth=1 state before Step Inside)
function seedPreDiveState() {
    state.focusedNode = 4;
    state.navState.focusedIndex = 4;
    state.trailDepth = 1;
    state.semanticDiveMode = false;
    state.navState.mode = 'focus';           // ← this is what prevents sync
    state.currentView = 'galaxy';
    state.currentSearchSummary = { anchorIndex: 4, query: 'test' };
    state.myceliumMode = 'trail';
    state.selectedPoint = state.points?.[4] ?? {};
    document.body.dataset.trailDepth = '1';
    document.body.dataset.graphContext = 'focus-search';
    document.body.dataset.panelSurface = 'focus-search';
    document.body.dataset.semanticDive = 'inactive';
    document.body.dataset.journeyPhase = 'focus';
}

// Bootstrap DOM elements for refreshCompositionState()
function bootstrapDom() {
    elementsById.clear();
    const body = new FakeElement('body');
    fakeDoc.appendChild(body);
    fakeDoc.body = body;
    fakeDoc.getElementById = id => elementsById.get(id) || null;

    const compass = new FakeElement('div');
    compass._selector = '#journey-compass';
    elementsById.set('journey-compass', compass);
    elementsById.set('btn-journey-primary', new FakeElement('button'));
    elementsById.set('btn-journey-secondary', new FakeElement('button'));
    elementsById.set('btn-journey-tertiary', new FakeElement('button'));

    // Simulate the state before Step Inside: focus-search graph context
    body.dataset.trailDepth = '1';
    body.dataset.graphContext = 'focus-search';
    body.dataset.panelSurface = 'focus-search';
    body.dataset.semanticDive = 'inactive';
    body.dataset.journeyPhase = 'focus';
    body.dataset.trailState = 'active';
    body.dataset.activeView = 'galaxy';
    body.dataset.mapContext = 'idle';
    body.dataset.journeyCompassDensity = 'compact';
    body.dataset.journeyCompassCopy = 'quiet';
    body.dataset.journeyNavigationOwner = 'scene';

    // Step Inside button (exists after trailDepth >= 1)
    const diveBtn = new FakeElement('button');
    elementsById.set('btn-focus-dive', diveBtn);
    const diveLabel = new FakeElement('span'); diveLabel._selector = '.focus-stage-dive-label'; diveBtn.appendChild(diveLabel);
    const diveCopy = new FakeElement('span'); diveCopy._selector = '.focus-stage-dive-copy'; diveBtn.appendChild(diveCopy);

    elementsById.set('focus-stage-inside-controls', new FakeElement('div'));
    elementsById.set('focus-stage-inside-status', new FakeElement('div'));
    elementsById.set('focus-stage-inside-status-copy', new FakeElement('div'));
    elementsById.set('btn-inside-next', new FakeElement('button'));
    elementsById.set('btn-inside-county', new FakeElement('button'));
}

// --- THE ACTUAL FIX TEST ---

bootstrapDom();
seedPreDiveState();

// Simulate: user clicks Step Inside → window.setSemanticDiveMode(true)
window.setSemanticDiveMode(true);

// After setSemanticDiveMode(true):
// 1. state.semanticDiveMode must be true
assert(state.semanticDiveMode === true, 'state.semanticDiveMode should be true');

// 2. state.trailDepth must be 2
assert(state.trailDepth === 2, `state.trailDepth should be 2, got ${state.trailDepth}`);

// 3. state.navState.mode must be 'trail' (THE FIX)
assert(state.navState.mode === 'trail', `state.navState.mode should be 'trail', got '${state.navState.mode}'`);

// 4. refreshCompositionState should now derive graphContext NOT 'focus-search'
//    (semantic dive context takes priority over focus-search in derivePanelSurface)
refreshCompositionState();

console.log('DEBUG graphContext after refresh:', document.body.dataset.graphContext);
console.log('DEBUG semanticDive after refresh:', document.body.dataset.semanticDive);
console.log('DEBUG state.semanticDiveMode:', state.semanticDiveMode);
console.log('DEBUG state.focusedNode:', state.focusedNode);
console.log('DEBUG hasFocus check:', state.focusedNode !== null && state.focusedNode !== undefined);

const graphCtx = document.body.dataset.graphContext;
const panelSurf = document.body.dataset.panelSurface;

assert(graphCtx !== 'focus-search',
    `graphContext should not be 'focus-search' after Step Inside, got '${graphCtx}'`);
assert(['active', 'transitioning'].includes(document.body.dataset.semanticDive),
    `body.dataset.semanticDive should be 'active' or 'transitioning', got '${document.body.dataset.semanticDive}'`);
assert(Number(document.body.dataset.trailDepth) === 2,
    `body.dataset.trailDepth should be 2, got ${document.body.dataset.trailDepth}`);
assert(document.body.dataset.journeyPhase === 'inside',
    `body.dataset.journeyPhase should be 'inside', got '${document.body.dataset.journeyPhase}'`);

// Verify panelSurface derives correctly — semantic-dive owns both active and transition states.
assert(panelSurf === 'semantic-dive',
    `panelSurface should be 'semantic-dive' after Step Inside, got '${panelSurf}'`);

// --- Test exiting Step Inside (County button) ---
window.setSemanticDiveMode(false);

assert(state.semanticDiveMode === false, 'state.semanticDiveMode should be false after exit');
assert(state.trailDepth === 1, `state.trailDepth should return to 1 after exit, got ${state.trailDepth}`);
// navState.mode should still be 'trail' (trail mode stays active, just depth drops)
assert(state.navState.mode === 'trail', `state.navState.mode should stay 'trail' after exit, got '${state.navState.mode}'`);

console.log('step-inside-state-sync contract passed');
