import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appTsSrc = readFileSync(resolve(process.cwd(), 'src/lib/orchestration/app-init.ts'), 'utf8');
const roleLabelSrc = readFileSync(resolve(process.cwd(), 'src/lib/utils/relationship-roles.ts'), 'utf8');

assert.match(appTsSrc, /from ['"][.\/]*event-bus['"]/, 'app.ts imports the event bus');
assert.match(appTsSrc, /subscribeKeyed\(['"]app:url-sync-requested['"],\s*EVENTS\.URL_SYNC_REQUESTED/, 'app.ts owns URL sync requests with keyed subscription');
assert.match(appTsSrc, /subscribeKeyed\(['"]app:search-ui-sync-requested['"],\s*EVENTS\.SEARCH_UI_SYNC_REQUESTED/, 'app.ts owns search result rebinding requests with keyed subscription');
assert.match(appTsSrc, /subscribeKeyed\(['"]app:search-focus-requested['"],\s*EVENTS\.SEARCH_FOCUS_REQUESTED/, 'app.ts owns search focus requests with keyed subscription');
assert.match(appTsSrc, /subscribeKeyed\(['"]app:search-state-reset-requested['"],\s*EVENTS\.SEARCH_STATE_RESET_REQUESTED/, 'app.ts owns search reset requests with keyed subscription');
assert.match(appTsSrc, /subscribeKeyed\(['"]app:semantic-lane-state-requested['"],\s*EVENTS\.SEMANTIC_LANE_STATE_REQUESTED/, 'app.ts owns semantic lane state requests with keyed subscription');
assert.match(appTsSrc, /subscribeKeyed\(['"]app:summary-card-hide-requested['"],\s*EVENTS\.SUMMARY_CARD_HIDE_REQUESTED/, 'app.ts owns summary-card hide requests with keyed subscription');
assert.doesNotMatch(appTsSrc, /subscribe\(EVENTS\./, 'app.ts init-level event subscriptions must use subscribeKeyed to avoid duplicate side effects');
assert.doesNotMatch(appTsSrc, /initSearchLifecycleAdapter\s*\(/, 'app.ts must not restore search lifecycle adapter injection');
assert.doesNotMatch(appTsSrc, /initCompositionAdapter\s*\(/, 'app.ts must not restore composition adapter injection');
assert.doesNotMatch(appTsSrc, /initCameraUiBindings|camera-ui-bindings/, 'app.ts must not restore retired camera UI binding');
assert.doesNotMatch(appTsSrc, /from ['"]\.\/bridge-registry\.js['"]|import ['"]\.\/bridge-registry\.js['"]/, 'app.ts must not import bridge-registry (deleted; inlined into app.ts)');
assert.match(appTsSrc, /__APP_ACTIONS__/, 'app.ts defines the grouped debug action namespace inline');
assert.match(roleLabelSrc, /_getSelectedBusinessRoleLabel/, 'role-label.ts exports the business role label function');

console.log('app-node-import-contract.mjs passed');
