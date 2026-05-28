import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const appSrc = readFileSync(resolve(process.cwd(), 'js/modules/app.js'), 'utf8');

assert.match(appSrc, /export\s+async\s+function\s+init\s*\(/, 'app.js exports async init()');
assert.match(appSrc, /initCompositionAdapter\s*\(/, 'app.js initializes the composition adapter');
assert.match(appSrc, /initSearchLifecycleAdapter\s*\(/, 'app.js initializes the search lifecycle adapter');
assert.match(appSrc, /window\.__APP_ACTIONS__\s*=/, 'app.js defines the grouped debug action namespace');

console.log('app-node-import-contract.mjs passed');
