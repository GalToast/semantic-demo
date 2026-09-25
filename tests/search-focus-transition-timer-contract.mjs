/**
 * search-focus-transition-timer-contract.mjs
 *
 * No-resurrection guard for the retired search focus transition timer behavior.
 *
 * The old transition timer used `js/modules/search-state.ts` which is MISSING.
 * This contract ensures:
 * 1. No read of the retired module.
 * 2. Current focus transition code avoids `window.setTimeout`.
 * 3. No import of retired adapter.
 * 4. Focus transition start/settled events are both published with a token.
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SEARCH_SRC = path.join(ROOT, 'src/lib/search');

function readFileSync(p) {
  if (!fs.existsSync(p)) throw new Error(`ASSERTION FAILED: Source file missing: ${p}`);
  return fs.readFileSync(p, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

console.log('\n[TEST 1] Must not read retired `js/modules/search-state.ts`');
const retiredPath = path.join(ROOT, 'js/modules/search-state.ts');
assert(!fs.existsSync(retiredPath), 'Retired module js/modules/search-state.ts must not exist');
console.log('  PASS');

console.log('\n[TEST 2] Focus transition code avoids `window.setTimeout`');
const orchestrationSrc = readFileSync(path.join(SEARCH_SRC, 'orchestration.ts'));
const sig = 'export function beginSearchFocusTransition';
const start = orchestrationSrc.indexOf(sig);
assert(start !== -1, 'beginSearchFocusTransition must be exported');
const nextExport = orchestrationSrc.indexOf('\nexport ', start + sig.length);
const fnRegion = orchestrationSrc.slice(start, nextExport === -1 ? undefined : nextExport);
assert(!/window\.setTimeout/.test(fnRegion), 'beginSearchFocusTransition must not use window.setTimeout');
console.log('  PASS');

console.log('\n[TEST 3] Focus transition code does not import retired adapter');
assert(!orchestrationSrc.includes('search-lifecycle-adapter'), 'orchestration.ts must not import retired lifecycle adapter');
console.log('  PASS');

console.log('\n[TEST 4] Focus transition publishes start and settled events with transitionToken');
const startedIndex = fnRegion.indexOf('EVENTS.SEARCH_FOCUS_TRANSITION_STARTED');
const settledIndex = fnRegion.indexOf('EVENTS.SEARCH_FOCUS_TRANSITION_SETTLED');
assert(startedIndex !== -1, 'beginSearchFocusTransition must publish SEARCH_FOCUS_TRANSITION_STARTED');
assert(settledIndex !== -1, 'beginSearchFocusTransition must publish SEARCH_FOCUS_TRANSITION_SETTLED');
assert(startedIndex < settledIndex, 'SEARCH_FOCUS_TRANSITION_STARTED must be published before SETTLED');
const startedPayload = fnRegion.slice(startedIndex, startedIndex + 350);
const settledPayload = fnRegion.slice(settledIndex, settledIndex + 350);
assert(startedPayload.includes('transitionToken'), 'SEARCH_FOCUS_TRANSITION_STARTED payload must include transitionToken');
assert(settledPayload.includes('transitionToken'), 'SEARCH_FOCUS_TRANSITION_SETTLED payload must include transitionToken');
console.log('  PASS');

console.log('\nsearch-focus-transition-timer-contract.mjs passed');
