/**
 * Event-driven search tooltip/UI contract.
 *
 * Search no longer depends on the tooltip adapter at runtime. Tooltip hides and
 * search result rebinding are expressed as event-bus requests owned by app/UI
 * subscribers.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CWD = process.cwd();
const SEARCH_STATE_PATH = resolve(CWD, 'js/modules/search-state.js');
const SEARCH_RESULTS_UI_PATH = resolve(CWD, 'js/modules/search-results-ui.js');
const APP_PATH = resolve(CWD, 'js/modules/app.js');
const TOOLTIP_PATH = resolve(CWD, 'js/modules/tooltip.js');

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
const tooltipSrc = readFileSync(TOOLTIP_PATH, 'utf8');

console.log('\n[TEST 1] search-state does not import tooltip or tooltip adapter');
assertNotContains(searchSrc, "from './tooltip.js'", 'search-state must not import tooltip.js');
assertNotContains(searchSrc, "from './search-ui-adapter.js'", 'search-state must not import search-ui-adapter.js');
assertNotContains(searchSrc, 'adapter_hideTooltip', 'search-state must not keep tooltip adapter aliases');
console.log('  PASS');

console.log('\n[TEST 2] search-state has no bare window tooltip calls');
['window.hideTooltip', 'window.positionTooltip', 'window.updateTooltipContent'].forEach((needle) => {
  assertNotContains(searchSrc, needle, `search-state must not call ${needle}`);
});
console.log('  PASS');

console.log('\n[TEST 3] tooltip hide requests use the event bus');
assertContains(searchSrc, 'publish(EVENTS.TOOLTIP_HIDE_REQUESTED)', 'search-state hideTooltip wrapper must publish tooltip hide');
assertContains(resultsSrc, 'publish(EVENTS.TOOLTIP_HIDE_REQUESTED)', 'search-results-ui must publish tooltip hide');
assertContains(tooltipSrc, 'subscribe(EVENTS.TOOLTIP_HIDE_REQUESTED, hideTooltip)', 'tooltip owner must subscribe to hide requests');
console.log('  PASS');

console.log('\n[TEST 4] search result rebinding is event-driven');
assertContains(resultsSrc, 'publish(EVENTS.SEARCH_UI_SYNC_REQUESTED', 'search-results-ui must publish rebind requests');
assertContains(appSrc, "subscribeKeyed('app:search-ui-sync-requested', EVENTS.SEARCH_UI_SYNC_REQUESTED", 'app.js must subscribe to rebind requests with a stable key');
assertContains(appSrc, 'searchModule.bindSearchResultInteractions', 'app.js must delegate rebinding to search-state');
console.log('  PASS');

console.log('\n[TEST 5] app does not restore tooltip adapter as search-state dependency');
assertNotContains(appSrc, 'initSearchLifecycleAdapter({', 'app.js must not restore search lifecycle adapter');
console.log('  PASS');

console.log('\nsearch-state-ui-adapter-contract.mjs passed');
