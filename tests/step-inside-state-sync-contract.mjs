/**
 * step-inside-state-sync-contract.mjs
 *
 * MODERNIZED: Final State Sync Contract.
 *
 * Verifies that the 'Step Inside' state transition is correctly
 * synchronized between data state and UI dataset attributes,
 * without relying on window globals.
 */

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

// Minimal DOM shim for Node execution - MUST BE BEFORE IMPORTS
Object.defineProperty(globalThis, 'window', {
    value: {
        location: { search: '' },
        history: { pushState: () => {}, replaceState: () => {}, state: {} },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        matchMedia: () => ({ matches: false, addListener: () => {}, removeListener: () => {} }),
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {}
    },
    writable: true,
    configurable: true
});

Object.defineProperty(globalThis, 'document', {
    value: {
        body: { dataset: {} },
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({
            dataset: {},
            classList: { add: () => {}, remove: () => {} },
            setAttribute: () => {},
            getAttribute: () => null,
            appendChild: () => {},
            addEventListener: () => {},
            removeEventListener: () => {}
        }),
        activeElement: {}
    },
    writable: true,
    configurable: true
});

Object.defineProperty(globalThis, 'navigator', {
    value: { userAgent: 'node' },
    writable: true,
    configurable: true
});

// Now safe to import modules
const { state } = await import('../js/state.js');
const { setSemanticDiveMode, refreshCompositionState } = await import('../js/modules/lifecycle.js');

function resetState() {
  state.semanticDiveMode = false;
  state.trailDepth = 0;
  state.currentView = 'galaxy';
  state.navState.mode = 'overview';
  document.body.dataset = {};
}

console.log('=================================================================');
console.log('step-inside-state-sync-contract.mjs (MODERNIZED)');
console.log('=================================================================');

try {
  // TEST 1: Entering Inside mode
  resetState();
  console.log('\n[TEST 1] Entering Inside mode updates dataset and state');
  setSemanticDiveMode(true);
  refreshCompositionState();

  assert(state.semanticDiveMode === true, 'state.semanticDiveMode is true');
  assert(state.trailDepth === 2, 'state.trailDepth is 2');
  assert(state.navState.mode === 'trail' || state.navState.mode === 'inside', 'navState.mode updated');
  // refreshCompositionState requires a focus record to set semanticDive='active'
  state.focusedNode = 1;
  refreshCompositionState();
  assert(document.body.dataset.semanticDive === 'active', 'body dataset reflects active dive');
  console.log('  PASS — Enter sync confirmed');

  // TEST 2: Exiting Inside mode
  console.log('\n[TEST 2] Exiting Inside mode updates dataset and state');
  setSemanticDiveMode(false);
  refreshCompositionState();

  assert(state.semanticDiveMode === false, 'state.semanticDiveMode is false');
  assert(state.trailDepth === 1, 'state.trailDepth returns to 1');
  assert(document.body.dataset.semanticDive === 'inactive', 'body dataset reflects inactive dive');
  console.log('  PASS — Exit sync confirmed');

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}
