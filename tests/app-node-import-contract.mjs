import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSrc = readFileSync(resolve(process.cwd(), 'js/modules/app.js'), 'utf8');
const bridgeRegistrySrc = readFileSync(resolve(process.cwd(), 'js/modules/bridge-registry.js'), 'utf8');

assert.match(appSrc, /export\s+async\s+function\s+init\s*\(/, 'app.js exports async init()');
assert.match(appSrc, /from ['"]\.\/event-bus\.js['"]/, 'app.js imports the event bus');
assert.match(appSrc, /subscribeKeyed\(['"]app:url-sync-requested['"],\s*EVENTS\.URL_SYNC_REQUESTED/, 'app.js owns URL sync requests with keyed subscription');
assert.match(appSrc, /subscribeKeyed\(['"]app:search-ui-sync-requested['"],\s*EVENTS\.SEARCH_UI_SYNC_REQUESTED/, 'app.js owns search result rebinding requests with keyed subscription');
assert.match(appSrc, /subscribeKeyed\(['"]app:search-focus-requested['"],\s*EVENTS\.SEARCH_FOCUS_REQUESTED/, 'app.js owns search focus requests with keyed subscription');
assert.match(appSrc, /subscribeKeyed\(['"]app:search-state-reset-requested['"],\s*EVENTS\.SEARCH_STATE_RESET_REQUESTED/, 'app.js owns search reset requests with keyed subscription');
assert.match(appSrc, /subscribeKeyed\(['"]app:semantic-lane-state-requested['"],\s*EVENTS\.SEMANTIC_LANE_STATE_REQUESTED/, 'app.js owns semantic lane state requests with keyed subscription');
assert.match(appSrc, /subscribeKeyed\(['"]app:summary-card-hide-requested['"],\s*EVENTS\.SUMMARY_CARD_HIDE_REQUESTED/, 'app.js owns summary-card hide requests with keyed subscription');
assert.doesNotMatch(appSrc, /subscribe\(EVENTS\./, 'app.js init-level event subscriptions must use subscribeKeyed to avoid duplicate side effects');
assert.doesNotMatch(appSrc, /initSearchLifecycleAdapter\s*\(/, 'app.js must not restore search lifecycle adapter injection');
assert.doesNotMatch(appSrc, /initCompositionAdapter\s*\(/, 'app.js must not restore composition adapter injection');
assert.doesNotMatch(appSrc, /initCameraUiBindings|camera-ui-bindings/, 'app.js must not restore retired camera UI binding');
assert.match(appSrc, /initBridgeRegistry\s*\(/, 'app.js initializes the grouped debug action registry');
assert.match(bridgeRegistrySrc, /window\.__APP_ACTIONS__\s*=/, 'bridge-registry.js defines the grouped debug action namespace');

console.log('app-node-import-contract.mjs passed');
