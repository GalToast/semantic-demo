'use strict';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

globalThis.document = {
  body: { dataset: {} },
  getElementById() { return null; },
  querySelector() { return null; },
};
globalThis.window = {};
globalThis.performance = { now: () => 12345 };

const { state } = await import('./helpers/canonical-state.mjs');
const {
  setStrandContinuityState,
  clearStrandContinuityState,
} = await import('../src/lib/utils/strand-continuity.ts');
const journeyModule = await import('../src/lib/journey/journey.ts');
// Wave70 split: src/lib/journey/thread-inspector.ts no longer exists; the
// state module is its logical successor for the setter/clearer ownership
// assertion below.
const threadInspectorModule = await import('../src/lib/journey/thread-inspector-state.ts');

const original = { strandContinuityState: state.strandContinuityState };

try {
  // Reframed: journey and thread-inspector consume the shared strand-continuity
  // owner via the engine bridge layer.  Confirm they do NOT locally re-define
  // the setter/clearer (no resurrection of old local copies).
  // They import from strand-continuity, not define their own.
  assert(
    typeof journeyModule.setStrandContinuityState !== 'function' ||
      journeyModule.setStrandContinuityState === setStrandContinuityState,
    'journey should not locally define its own setStrandContinuityState'
  );
  assert(
    typeof threadInspectorModule.setStrandContinuityState !== 'function' ||
      threadInspectorModule.setStrandContinuityState === setStrandContinuityState,
    'thread-inspector should not locally define its own setStrandContinuityState'
  );

  const exploring = setStrandContinuityState('exploring', {
    targetIndex: 7,
    fromIndex: 2,
    reason: 'shared service route',
  });
  assert(exploring.phase === 'exploring', 'exploring phase should be accepted');
  assert(exploring.targetIndex === 7, 'targetIndex should be recorded');
  assert(exploring.fromIndex === 2, 'fromIndex should be recorded');
  assert(exploring.reason === 'shared service route', 'reason should be recorded');
  assert(exploring.startedAt === 12345, 'startedAt should use performance.now');
  // The standalone wrapper mirrors to the canonical appState.strandContinuityState.
  assert(state.strandContinuityState.phase === 'exploring', 'appState strand phase should sync');
  assert(state.strandContinuityState.targetIndex === 7, 'appState strand target should sync');
  assert(state.strandContinuityState.fromIndex === 2, 'appState strand origin should sync');
  assert(
    state.strandContinuityState.reason === 'shared service route',
    'appState strand reason should sync'
  );
  // Dewindowing: body data-strand-journey* attributes are owned by
  // parity-attrs.svelte.ts (derived from focusStore.strandContinuityPhase).
  // The standalone wrapper must NOT write them directly.
  assert(
    document.body.dataset.strandJourney === undefined,
    'setStrandContinuityState must not write body.dataset.strandJourney (parity-attrs owns it)'
  );
  assert(
    document.body.dataset.strandJourneyTarget === undefined,
    'setStrandContinuityState must not write body.dataset.strandJourneyTarget'
  );
  assert(
    document.body.dataset.strandJourneyReason === undefined,
    'setStrandContinuityState must not write body.dataset.strandJourneyReason'
  );

  const invalid = setStrandContinuityState('not-a-phase', { targetIndex: Number.NaN, fromIndex: Infinity });
  assert(invalid.phase === 'idle', 'invalid phases should normalize to idle');
  assert(invalid.targetIndex === null, 'invalid target should normalize to null');
  assert(invalid.fromIndex === null, 'invalid origin should normalize to null');
  assert(state.strandContinuityState.phase === 'idle', 'appState phase should normalize after invalid phase');

  clearStrandContinuityState('contract-clear');
  assert(state.strandContinuityState.phase === 'idle', 'clear should set idle phase');
  assert(state.strandContinuityState.reason === 'contract-clear', 'clear should preserve reason for diagnostics');
} finally {
  state.strandContinuityState = original.strandContinuityState;
}

console.log('PASS journey-strand-continuity-contract');
