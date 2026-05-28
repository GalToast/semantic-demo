'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
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

const { state } = await import('../js/state.js');
const { syncRuntimeState, getRuntimeStateSnapshot } = await import('../js/modules/focus-pocket.js');

const original = getRuntimeStateSnapshot();

try {
  const navState = { ...state.navState, focusedIndex: 7, focusPocketIndices: [7, 8] };
  const targetPositions = [{ x: 1, y: 2, z: 3 }];
  const focusPocketMotionByIndex = new Map([[8, { role: 'primary', delay: 64 }]]);

  syncRuntimeState({
    navState,
    targetPositions,
    focusPocketMotionByIndex,
    focusPocketTransitionStartedAt: 1234,
    nodesAreSettling: true,
    autoRotate: false,
  });

  const snapshot = getRuntimeStateSnapshot();
  assert(snapshot.navState === navState, 'snapshot should expose current navState reference');
  assert(snapshot.targetPositions === targetPositions, 'snapshot should expose current targetPositions reference');
  assert(snapshot.focusPocketMotionByIndex === focusPocketMotionByIndex, 'snapshot should expose current motion Map reference');
  assert(snapshot.focusPocketTransitionStartedAt === 1234, 'snapshot should expose transition start time');
  assert(snapshot.nodesAreSettling === true, 'snapshot should expose settling flag');
  assert(snapshot.autoRotate === false, 'snapshot should expose autoRotate flag');

  syncRuntimeState({ nodesAreSettling: false });
  assert(getRuntimeStateSnapshot().nodesAreSettling === false, 'syncRuntimeState should support partial top-level patches');
} finally {
  syncRuntimeState(original);
}

console.log('PASS journey-focus-runtime-state-contract');
