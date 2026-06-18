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

const { state } = await import('../src/lib/engine/state-bridge.ts');
const {
  setStrandContinuityState,
  clearStrandContinuityState,
} = await import('../src/lib/utils/strand-continuity.ts');
const journeyModule = await import('../src/lib/journey/journey.ts');
const threadInspectorModule = await import('../src/lib/journey/thread-inspector.ts');

const original = { strandContinuityState: state.strandContinuityState };

try {
  // Reframed: journey and thread-inspector consume the shared strand-continuity
  // owner via the engine bridge layer.  Confirm they do NOT locally re-define
  // the setter/clearer (no resurrection of old local copies).
  // They import from strand-continuity-bridge, not define their own.
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
  assert(document.body.dataset.strandJourney === 'exploring', 'body strand phase should sync');
  assert(document.body.dataset.strandJourneyTarget === '7', 'body strand target should sync');
  assert(document.body.dataset.strandJourneyFrom === '2', 'body strand origin should sync');
  assert(document.body.dataset.strandJourneyReason === 'shared service route', 'body strand reason should sync');

  const invalid = setStrandContinuityState('not-a-phase', { targetIndex: Number.NaN, fromIndex: Infinity });
  assert(invalid.phase === 'idle', 'invalid phases should normalize to idle');
  assert(invalid.targetIndex === null, 'invalid target should normalize to null');
  assert(invalid.fromIndex === null, 'invalid origin should normalize to null');
  assert(document.body.dataset.strandJourney === 'idle', 'idle phase should sync after invalid phase');

  clearStrandContinuityState('contract-clear');
  assert(state.strandContinuityState.phase === 'idle', 'clear should set idle phase');
  assert(state.strandContinuityState.reason === 'contract-clear', 'clear should preserve reason for diagnostics');
  assert(document.body.dataset.strandJourney === 'idle', 'clear should sync idle phase');
  assert(document.body.dataset.strandJourneyReason === 'contract-clear', 'clear reason should sync');
} finally {
  state.strandContinuityState = original.strandContinuityState;
}

console.log('PASS journey-strand-continuity-contract');
