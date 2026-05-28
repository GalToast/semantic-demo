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

const { state } = await import('../js/state.js');
const {
  setStrandContinuityState,
  clearStrandContinuityState,
  initJourneyTimerAdapter,
} = await import('../js/modules/journey.js');

const original = { strandContinuityState: state.strandContinuityState };

try {
  initJourneyTimerAdapter({
    setTimer: () => 1,
    clearTimer: () => {},
  });

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
