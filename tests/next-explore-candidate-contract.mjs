/**
 * Contract: shared next-explore candidate helper and caller wiring.
 *
 * Source-only and Node-safe. Proves the helper is pure, semantic-first,
 * and that compass/semantic-dive callers no longer call the getNextExplore
 * window bridge directly.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getNextExploreCandidateForIndex } from '../src/lib/journey/thread-model.ts';

const ROOT = process.cwd();
const THREAD_MODEL = join(ROOT, 'js/modules/journey-thread-model.ts');
const COMPASS_STATE = join(ROOT, 'src/lib/journey/compass-state.ts');
const SEMANTIC_DIVE_UI = join(ROOT, 'src/lib/journey/semantic-overlay.ts');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function assertIncludes(source, needle, label) {
  assert(source.includes(needle), `${label}: missing ${needle}`);
}

function assertNotIncludes(source, needle, label) {
  assert(!source.includes(needle), `${label}: unexpected ${needle}`);
}

function testHelperBehavior() {
  assert(getNextExploreCandidateForIndex(4, null) === null, 'non-function candidate provider returns null');

  const calls = [];
  const semanticCandidate = { index: 8, source: 'semantic' };
  const firstResult = getNextExploreCandidateForIndex(4, (index, options) => {
    calls.push({ index, options });
    if (options.requireSemantic) return semanticCandidate;
    return { index: 9, source: 'geometric-fallback' };
  });

  assert(firstResult === semanticCandidate, 'semantic candidate is preferred');
  assert(calls.length === 1, 'fallback is not called after semantic hit');
  assert(calls[0].options.commitNeighborhood === false, 'semantic pass does not commit neighborhood');

  const fallbackCalls = [];
  const fallbackResult = getNextExploreCandidateForIndex(4, (index, options) => {
    fallbackCalls.push({ index, options });
    if (options.requireSemantic) return null;
    return { index: 12, source: 'geometric-fallback' };
  }, { requireOnCanvas: false, caller: 'contract' });

  assert(fallbackResult?.index === 12, 'falls back when semantic pass returns null');
  assert(fallbackCalls.length === 2, 'fallback path tries two candidate passes');
  assert(fallbackCalls.every((call) => call.options.commitNeighborhood === false), 'fallback passes do not commit neighborhood');
  assert(fallbackCalls.every((call) => call.options.caller === 'contract'), 'caller options are forwarded');
}

function testHelperPurity() {
  const source = read(THREAD_MODEL);
  const start = source.indexOf('export function getNextExploreCandidateForIndex');
  assert(start >= 0, 'helper export exists');
  const nextExport = source.indexOf('\nexport function ', start + 1);
  const body = source.slice(start, nextExport > start ? nextExport : source.length);

  for (const forbidden of ['window.', 'document.', 'navigator.', 'localStorage', 'sessionStorage']) {
    assertNotIncludes(body, forbidden, 'helper purity');
  }
}

function testCallerWiring() {
  const compass = read(COMPASS_STATE);
  const dive = read(SEMANTIC_DIVE_UI);

  for (const [label, source, focusName] of [
    ['journey-compass-state', compass, 'focusIndex'],
    ['semantic-dive-ui', dive, 'currentFocusIndex']
  ]) {
    assertIncludes(source, "import { getNextExploreCandidateForIndex } from './journey-thread-model.ts';", `${label} helper import`);
    assertIncludes(source, "import { getNextWalkCandidateForIndex } from './journey-lifecycle-adapter.ts';", `${label} adapter import`);
    assertIncludes(source, `getNextExploreCandidateForIndex(${focusName}, getNextWalkCandidateForIndex`, `${label} helper call`);
    assertNotIncludes(source, 'window.getNextWalkCandidateForIndex', `${label} no getNextWalk window bridge`);
    assertNotIncludes(source, 'window.getNextExploreCandidateForIndex', `${label} no getNextExplore window bridge`);
  }
}

testHelperBehavior();
testHelperPurity();
testCallerWiring();

console.log('next-explore-candidate-contract passed');
