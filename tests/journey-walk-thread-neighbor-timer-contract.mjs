'use strict';

import { readFileSync } from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

const source = readFileSync(new URL('../js/modules/journey-thread-settler.js', import.meta.url), 'utf8');

function extractFunctionBody(name) {
  const signature = `export function ${name}`;
  const start = source.indexOf(signature);
  assert(start >= 0, `${name} export should exist`);
  const bodyStart = source.indexOf(') {', start);
  assert(bodyStart >= 0, `${name} should have a function body`);
  const openBrace = bodyStart + 2;
  assert(openBrace >= 0, `${name} should have a function body`);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return source.slice(openBrace + 1, index);
  }
  throw new Error(`ASSERTION FAILED: ${name} function body should close`);
}

const walkBody = extractFunctionBody('walkThreadNeighbor');
const adapterBody = extractFunctionBody('initJourneyTimerAdapter');

assert(
  adapterBody.includes('if (deps.setTimer) _setTimer = deps.setTimer;') &&
    adapterBody.includes('if (deps.clearTimer) _clearTimer = deps.clearTimer;'),
  'timer adapter should own injectable set/clear timer hooks'
);

const captureArrivalIndex = walkBody.indexOf('const priorArrivalTimeoutId = state.strandContinuityState?.arrivalTimeoutId;');
const captureSettleIndex = walkBody.indexOf('const priorSettleTimeoutId = state.strandContinuityState?.settleTimeoutId;');
const exploringIndex = walkBody.indexOf("setStrandContinuityState('exploring'");
assert(captureArrivalIndex >= 0, 'walk should capture existing arrival timeout before replacing strand state');
assert(captureSettleIndex >= 0, 'walk should capture existing settle timeout before replacing strand state');
assert(
  captureArrivalIndex < exploringIndex && captureSettleIndex < exploringIndex,
  'existing timeout IDs must be captured before setStrandContinuityState replaces the state object'
);

assert(
  walkBody.includes("dispatchNavTransition('WALK_TO'") &&
    walkBody.includes('appendHistory: !options.restoreHistory'),
  'walk should route traversal through the WALK_TO nav transition'
);

assert(
  walkBody.includes('timerAdapter.clearTimer(priorArrivalTimeoutId)') &&
    walkBody.includes('timerAdapter.clearTimer(priorSettleTimeoutId)'),
  'walk should clear prior traversal timers through the timer adapter'
);
assert(
  !walkBody.includes('clearTimeout(state.strandContinuityState.arrivalTimeoutId)') &&
    !walkBody.includes('clearTimeout(state.strandContinuityState.settleTimeoutId)'),
  'walk should not clear prior traversal timers from the replaced strand state object'
);

const arrivalTimerIndex = walkBody.indexOf('const arrivalTid = timerAdapter.setTimer(() => {');
const settleTimerIndex = walkBody.indexOf('const settleTid = timerAdapter.setTimer(() => {');
assert(arrivalTimerIndex >= 0, 'walk should schedule an arrival timer through the timer adapter');
assert(settleTimerIndex > arrivalTimerIndex, 'walk should schedule settle after arrival');
assert(walkBody.includes('}, options.arrivalDelay || 820);'), 'arrival timer delay should remain configurable with 820ms default');
assert(walkBody.includes('}, options.settleDelay || 5200);'), 'settle timer delay should remain configurable with 5200ms default');
assert(
  walkBody.includes('state.strandContinuityState.arrivalTimeoutId = arrivalTid;') &&
    walkBody.includes('state.strandContinuityState.settleTimeoutId = settleTid;'),
  'scheduled timer IDs should be stored on strandContinuityState for later cancellation'
);

const arrivalBlock = walkBody.slice(arrivalTimerIndex, settleTimerIndex);
assert(
  arrivalBlock.includes("state.strandContinuityState.phase === 'exploring'") &&
    arrivalBlock.includes('state.strandContinuityState.targetIndex === capturedIndex'),
  'arrival timer should only commit when the expected exploring target is still current'
);
assert(
  arrivalBlock.includes("setStrandContinuityState('arrived'") &&
    arrivalBlock.includes('syncFocusStage(pointAtArrival || state.selectedPoint || null)') &&
    arrivalBlock.includes('updateJourneyCompass()') &&
    arrivalBlock.includes('primeNextThreadInspectionAfterWalk(capturedIndex)'),
  'arrival timer should move to arrived and refresh the focus-stage/compass/next-thread handoff'
);
assert(
  arrivalBlock.includes('if (state.semanticDiveMode)') &&
    arrivalBlock.includes('previewInsideNextThread({ force: true })') &&
    arrivalBlock.includes('syncSemanticDiveUi()'),
  'arrival timer should preserve semantic-dive preview behavior'
);

const settleBlock = walkBody.slice(settleTimerIndex);
assert(
  settleBlock.includes("state.strandContinuityState.phase === 'arrived'") &&
    settleBlock.includes('state.strandContinuityState.targetIndex === capturedIndex'),
  'settle timer should only clear when the expected arrived target is still current'
);
assert(
  settleBlock.includes("clearStrandContinuityState('arrival-settled')") &&
    settleBlock.includes('syncFocusStage(pointAtSettle || state.selectedPoint || null)'),
  'settle timer should clear the strand journey and resync the focus stage'
);

console.log('PASS journey-walk-thread-neighbor-timer-contract');
