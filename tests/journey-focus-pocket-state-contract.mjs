'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function assertDeepEqual(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
}

globalThis.document = {
  body: { dataset: {}, classList: { add() {}, remove() {}, contains() { return false; }, toggle() { return false; } } },
  createElement() { return { dataset: {}, classList: { add() {}, remove() {}, contains() { return false; }, toggle() { return false; } }, style: {} }; },
  querySelector() { return null; },
  getElementById() { return null; },
};

globalThis.window = {
  innerWidth: 1280,
  innerHeight: 800,
  __DEBUG_PROBES__: false,
  matchMedia() {
    return { matches: false, addEventListener() {}, removeEventListener() {} };
  },
  requestAnimationFrame() { return 1; },
  cancelAnimationFrame() {},
  performance: { now: () => 0 },
};
globalThis.performance = globalThis.window.performance;
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
globalThis.cancelAnimationFrame = globalThis.window.cancelAnimationFrame;

const { state, withStateMutation } = await import('../js/state.js');
const {
  getFocusPocketIndices,
  setFocusPocketIndices,
  clearFocusPocketIndices,
  getFocusPocketRoleByIndex,
  setFocusPocketRoleByIndex,
  setFocusPocketRoleForIndex,
  clearFocusPocketRoleByIndex,
  getFocusPocketMotionByIndex,
  setFocusPocketMotionByIndex,
  setFocusPocketMotionForIndex,
  clearFocusPocketMotionByIndex,
  getFocusPocketMeta,
  setFocusPocketMeta,
  clearFocusPocketMeta,
} = await import('../js/modules/focus-pocket.js');

const originalNavState = state.navState;
const originalMotion = state.focusPocketMotionByIndex;

try {
  withStateMutation(() => {
    state.navState = { ...originalNavState, focusPocketIndices: null, focusPocketRoleByIndex: null, focusPocketMeta: null };
    state.focusPocketMotionByIndex = null;
  });

  assertDeepEqual(getFocusPocketIndices(), [], 'indices getter should fall back to empty array');
  setFocusPocketIndices([1, 4, 8]);
  assertDeepEqual(getFocusPocketIndices(), [1, 4, 8], 'indices setter should round-trip');
  clearFocusPocketIndices();
  assertDeepEqual(getFocusPocketIndices(), [], 'indices clear should reset to empty array');

  assert(getFocusPocketRoleByIndex() instanceof Map, 'role getter should fall back to a Map');
  setFocusPocketRoleForIndex(4, 'primary');
  assert(state.navState.focusPocketRoleByIndex instanceof Map, 'role item setter should initialize owner Map');
  assert(getFocusPocketRoleByIndex().get(4) === 'primary', 'role item setter should round-trip');
  setFocusPocketRoleByIndex(new Map([[8, 'support']]));
  assert(getFocusPocketRoleByIndex().get(8) === 'support', 'role map setter should replace Map');
  clearFocusPocketRoleByIndex();
  assert(getFocusPocketRoleByIndex().size === 0, 'role clear should reset to empty Map');

  assert(getFocusPocketMotionByIndex() instanceof Map, 'motion getter should fall back to a Map');
  setFocusPocketMotionForIndex(2, { role: 'halo', delay: 120 });
  assert(state.focusPocketMotionByIndex instanceof Map, 'motion item setter should initialize owner Map');
  assert(getFocusPocketMotionByIndex().get(2).delay === 120, 'motion item setter should round-trip');
  setFocusPocketMotionByIndex(new Map([[3, { role: 'primary', delay: 40 }]]));
  assert(getFocusPocketMotionByIndex().get(3).role === 'primary', 'motion map setter should replace Map');
  clearFocusPocketMotionByIndex();
  assert(getFocusPocketMotionByIndex().size === 0, 'motion clear should reset to empty Map');

  assert(getFocusPocketMeta() === null, 'meta getter should fall back to null');
  setFocusPocketMeta({ active: true, nodeCount: 5 });
  assert(getFocusPocketMeta().nodeCount === 5, 'meta setter should round-trip');
  clearFocusPocketMeta();
  assert(getFocusPocketMeta() === null, 'meta clear should reset to null');
} finally {
  withStateMutation(() => {
    state.navState = originalNavState;
    state.focusPocketMotionByIndex = originalMotion;
  });
}

console.log('PASS journey-focus-pocket-state-contract');
