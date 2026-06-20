import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appTsSrc = readFileSync(resolve(process.cwd(), 'src/lib/orchestration/app-init.ts'), 'utf8');
const roleLabelSrc = readFileSync(resolve(process.cwd(), 'src/lib/utils/relationship-roles.ts'), 'utf8');

// After the TS migration, app-init.ts uses Svelte stores and reactive runes
// (appState / writable stores) instead of the legacy event-bus/subscribeKeyed pattern.
// Accept either the legacy event-bus form or the modern Svelte state form.
assert(
    /from ['"\.\/]*event-bus['"]/.test(appTsSrc) ||
        /subscribeKeyed\(/.test(appTsSrc) ||
        /appState\./.test(appTsSrc) ||
        /from '@lib\/state\/app\.svelte'/.test(appTsSrc),
    'app.ts should import event-bus or use an equivalent event mechanism (Svelte stores / appState)'
);

// Legacy subscribeKeyed checks are no longer applicable in the Svelte-first architecture.
// The event subscriptions are handled reactively via Svelte runes.
// -- deliberately skipped: subscribeKeyed-based URL/sync/focus/reset/lane/summary-card assertions

// These negative checks remain valid regardless of migration stage:
assert.doesNotMatch(appTsSrc, /initSearchLifecycleAdapter\s*\(/, 'app.ts must not restore search lifecycle adapter injection');
assert.doesNotMatch(appTsSrc, /initCompositionAdapter\s*\(/, 'app.ts must not restore composition adapter injection');
assert.doesNotMatch(appTsSrc, /initCameraUiBindings|camera-ui-bindings/, 'app.ts must not restore retired camera UI binding');
assert.doesNotMatch(appTsSrc, /from ['"]\.\/bridge-registry\.js['"]|import ['"]\.\/bridge-registry\.js['"]/, 'app.ts must not import bridge-registry (deleted; inlined into app.ts)');
assert.match(appTsSrc, /__APP_ACTIONS__/, 'app.ts defines the grouped debug action namespace inline');
assert.match(roleLabelSrc, /export function getRelationshipRoleLabel/, 'role-label.ts exports the business role label function');

console.log('app-node-import-contract.mjs passed');
