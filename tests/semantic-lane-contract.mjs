/**
 * semantic-lane-contract.mjs
 *
 * MODERNIZED: Final Semantic Lane Contract.
 *
 * Verifies the health check loop and proactive warming logic
 * using direct module calls and state verification.
 */

import { state, withStateMutation } from '../src/lib/engine/state-bridge.ts';
import * as lane from '../js/modules/semantic-lane.ts';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

// DOM Shim
globalThis.window = {
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
};
const elementsById = new Map();
class FakeElement {
  constructor() {
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.textContent = '';
    this.title = '';
    this.attributes = new Map();
  }
  setAttribute(name, value) {
    this.attributes.set(name, value);
  }
  removeAttribute(name) {
    this.attributes.delete(name);
  }
  getAttribute(name) {
    return this.attributes.get(name) || null;
  }
}
globalThis.document = {
  body: { dataset: {} },
  getElementById: (id) => elementsById.get(id) || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  visibilityState: 'visible'
};

function resetState() {
  withStateMutation(() => {
    state.semanticLaneState = 'checking';
    state.currentSearchSummary = null;
    state.semanticLaneWarmingCounter = 0;
  });
  document.visibilityState = 'visible';
  elementsById.clear();
}

console.log('=================================================================');
console.log('semantic-lane-contract.mjs (MODERNIZED)');
console.log('=================================================================');

try {
  // TEST 1: Proactive warming reasons
  resetState();
  console.log('\n[TEST 1] Focus and visibility reasons trigger warm probes');
  assert(lane.shouldWarmSemanticLane('focus') === true, 'focus triggers warm');
  assert(lane.shouldWarmSemanticLane('visibility') === true, 'visibility triggers warm');
  console.log('  PASS — Reason-based warming confirmed');

  // TEST 2: Visibility suppression
  resetState();
  console.log('\n[TEST 2] Visibility suppression for health probes');
  document.visibilityState = 'hidden';
  withStateMutation(() => {
    state.currentSearchSummary = { query: 'coffee', resultIndices: [0] };
  });
  assert(lane.shouldWarmSemanticLane('interval') === false, 'hidden document suppresses warm');
  console.log('  PASS — Visibility suppression confirmed');

  // TEST 3: Active search state triggers interval warm probes
  resetState();
  console.log('\n[TEST 3] Active search state triggers interval warm probes');
  withStateMutation(() => {
    state.currentSearchSummary = { query: 'coffee', resultIndices: [0] };
  });
  assert(lane.shouldWarmSemanticLane('interval') === true, 'active search summary triggers warm');
  resetState();
  elementsById.set('search-input', { value: 'ab' });
  assert(lane.shouldWarmSemanticLane('interval') === true, 'search input >= 2 chars triggers warm');
  elementsById.set('search-input', { value: 'a' });
  assert(lane.shouldWarmSemanticLane('interval') === false, 'search input < 2 chars does not trigger warm');
  console.log('  PASS — Active search warming confirmed');

  // TEST 4: Degraded lane copy is truthful, not warming
  resetState();
  console.log('\n[TEST 4] Degraded lane uses text-fallback copy');
  const pill = new FakeElement();
  elementsById.set('semantic-lane-pill', pill);
  lane.applySemanticLaneHealthPayload({
    ok: true,
    state: 'degraded',
    search_ok: false,
    embed_ok: false,
    provenance: {
      label: 'Search + embed reconnecting',
      detail: 'The semantic engine is currently being optimized. Check back in a moment.'
    }
  });
  assert(pill.textContent === 'Search degraded', 'degraded payload does not show warming label');
  assert(pill.title === 'Using text search while semantic search reconnects.', 'degraded title explains text fallback');
  assert(pill.dataset.state === 'degraded', 'pill state remains degraded');
  console.log('  PASS — Degraded lane copy is truthful');

  console.log('\n=================================================================');
  console.log('ALL TESTS PASSED');
  console.log('=================================================================');
  process.exit(0);
} catch (err) {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
}
