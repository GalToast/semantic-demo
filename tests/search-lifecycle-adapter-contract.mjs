/**
 * Event-driven search lifecycle contract.
 *
 * The old injected search-lifecycle adapter is retired from runtime ownership.
 * Search publishes typed intent events; app/lifecycle/visual owners subscribe
 * and perform the side effects.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const SEARCH_STATE_PATH = resolve(CWD, 'js/modules/search-state.ts');
const SEARCH_RESULTS_UI_PATH = resolve(CWD, 'js/modules/search-results-ui.ts');
const APP_PATH = resolve(CWD, 'js/modules/app.ts');
const EVENT_BUS_PATH = resolve(CWD, 'js/modules/event-bus.ts');

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
}

function assertContains(src, needle, label) {
  assert(src.includes(needle), `${label}: expected source to contain "${needle}"`);
}

function assertNotContains(src, needle, label) {
  assert(!src.includes(needle), `${label}: source should NOT contain "${needle}"`);
}

const searchSrc = readFileSync(SEARCH_STATE_PATH, 'utf8');
const resultsSrc = readFileSync(SEARCH_RESULTS_UI_PATH, 'utf8');
const appSrc = readFileSync(APP_PATH, 'utf8');
const eventSrc = readFileSync(EVENT_BUS_PATH, 'utf8');

console.log('\n[TEST 1] search-state has no runtime lifecycle adapter import');
assertNotContains(searchSrc, "from './search-lifecycle-adapter.ts'", 'search-state must be event-driven');
assertNotContains(searchSrc, 'adapter_', 'search-state must not keep adapter directive aliases');
console.log('  PASS');

console.log('\n[TEST 2] search-state publishes lifecycle intent events');
[
  'SEARCH_STARTED',
  'SEARCH_SUCCESS',
  'SEARCH_EMPTY',
  'SEARCH_DEGRADED',
  'SEARCH_FOCUS_REQUESTED',
  'SEARCH_STATE_RESET_REQUESTED',
  'SEARCH_FOCUS_TRANSITION_STARTED',
  'SEARCH_FOCUS_TRANSITION_SETTLED',
  'SEARCH_CLEARED',
  'STATE_RESET'
].forEach((eventName) => {
  assertContains(searchSrc, `EVENTS.${eventName}`, `search-state must publish/use ${eventName}`);
});
console.log('  PASS');

console.log('\n[TEST 3] search-results UI publishes owner-side requests instead of adapter calls');
assertNotContains(resultsSrc, 'adapter_', 'search-results-ui must not call lifecycle adapter aliases');
[
  'URL_SYNC_REQUESTED',
  'SEARCH_UI_SYNC_REQUESTED',
  'TOOLTIP_HIDE_REQUESTED',
  'SEMANTIC_LANE_STATE_REQUESTED',
  'SUMMARY_CARD_HIDE_REQUESTED',
  'SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED',
  'COMPOSITION_UPDATED'
].forEach((eventName) => {
  assertContains(resultsSrc, `EVENTS.${eventName}`, `search-results-ui must publish/use ${eventName}`);
});
console.log('  PASS');

console.log('\n[TEST 4] app subscribes to search lifecycle side-effect requests');
[
  'URL_SYNC_REQUESTED',
  'SEARCH_UI_SYNC_REQUESTED',
  'SEARCH_FOCUS_REQUESTED',
  'SEARCH_STATE_RESET_REQUESTED',
  'SEARCH_STATUS_SYNC_REQUESTED',
  'SEMANTIC_LANE_STATE_REQUESTED',
  'SUMMARY_CARD_HIDE_REQUESTED',
  'SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED'
].forEach((eventName) => {
  assertContains(appSrc, `subscribeKeyed('app:`, `app.js must use keyed subscriptions for init-level event owners`);
  assertContains(appSrc, `EVENTS.${eventName}`, `app.js must subscribe to ${eventName}`);
});
assertNotContains(appSrc, 'subscribe(EVENTS.', 'app.js must not use unkeyed init-level event subscriptions');
assertNotContains(appSrc, 'initSearchLifecycleAdapter({', 'app.js must not restore adapter injection');
console.log('  PASS');

console.log('\n[TEST 5] event manifest includes search lifecycle request events');
[
  'URL_SYNC_REQUESTED',
  'SEARCH_UI_SYNC_REQUESTED',
  'SEARCH_STATUS_SYNC_REQUESTED',
  'SEMANTIC_LANE_STATE_REQUESTED',
  'SUMMARY_CARD_HIDE_REQUESTED',
  'SEMANTIC_GUIDE_BUTTON_STATE_REQUESTED'
].forEach((eventName) => {
  assertContains(eventSrc, `${eventName}: '${eventName}'`, `event-bus must define ${eventName}`);
});
console.log('  PASS');

console.log('\nsearch-lifecycle-adapter-contract.mjs passed');
