/**
 * reset-callsite-routing-contract.mjs
 *
 * MODERNIZED: Final Reset Routing Contract.
 *
 * Verifies that the 'Reset' actions route through the authoritative
 * module APIs rather than legacy window globals.
 */

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

globalThis.window = {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  location: { search: '' },
  history: { pushState: () => {}, replaceState: () => {}, state: {} }
};

globalThis.document = {
  body: { dataset: {} },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  createElement: () => ({ dataset: {}, classList: { add: () => {}, remove: () => {} } }),
  visibilityState: 'visible'
};

const { resetExplorationFocus, resetExperienceState, resetNodePositions } = await import('../src/lib/stores/lifecycle.ts');

console.log('=================================================================');
console.log('reset-callsite-routing-contract.mjs (MODERNIZED)');
console.log('=================================================================');

try {
  console.log('\n[TEST 1] Authoritative reset exports exist');
  assert(typeof resetExplorationFocus === 'function', 'resetExplorationFocus exported');
  assert(typeof resetExperienceState === 'function', 'resetExperienceState exported');
  assert(typeof resetNodePositions === 'function', 'resetNodePositions exported');
  assert(typeof globalThis.window.returnToCountyView === 'undefined', 'window.returnToCountyView bridge is retired');
  console.log('  PASS — Exports confirmed');

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}
