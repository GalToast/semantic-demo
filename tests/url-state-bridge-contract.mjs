/**
 * url-state-bridge-contract.mjs
 *
 * Contract for the URL restore reset bridge.
 *
 * Current compatibility rule:
 * - url-state.js exports resetStateBeforeUrlRestore for URL restore ownership.
 * - lifecycle.js still exports resetStateBeforeUrlRestore for legacy contracts
 *   and call sites until that wider ownership migration is complete.
 * - url-state.js must not directly import search-state.js or re-import the
 *   reset helper from lifecycle.js.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = process.cwd();
const urlStateSrc = readFileSync(resolve(cwd, 'js/modules/url-state.js'), 'utf8');
const lifecycleSrc = readFileSync(resolve(cwd, 'js/modules/lifecycle.js'), 'utf8');

assert.match(
    urlStateSrc,
    /export\s+function\s+resetStateBeforeUrlRestore\s*\(\s*options\s*=\s*\{\s*\}\s*\)/,
    'url-state.js must export resetStateBeforeUrlRestore(options = {})'
);

assert(
    /export\s+function\s+resetStateBeforeUrlRestore\s*\(\s*options\s*=\s*\{\s*\}\s*\)/.test(lifecycleSrc)
        || /export\s*\{[\s\S]*\bresetStateBeforeUrlRestore\b[\s\S]*\}/m.test(lifecycleSrc),
    'lifecycle.js must keep the compatibility resetStateBeforeUrlRestore export while legacy contracts import it'
);

const resetImportFromLifecycle = /import\s*\{[\s\S]*resetStateBeforeUrlRestore[\s\S]*\}\s*from\s*['"]\.\/lifecycle\.js['"]/m;
assert.equal(
    resetImportFromLifecycle.test(urlStateSrc),
    false,
    'url-state.js must not import resetStateBeforeUrlRestore from lifecycle.js'
);

assert.equal(
    /from\s*['"]\.\/search-state\.js['"]/.test(urlStateSrc),
    false,
    'url-state.js must not import search-state.js directly'
);

assert.match(
    urlStateSrc,
    /getUrlSearchAdapter\s*\(\)/,
    'url-state.js must use the injected URL search adapter for search state work'
);

const deferredRestoreBody = urlStateSrc.match(/async\s+function\s+applyUrlStateFromDeferred\s*\(\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
assert.match(
    deferredRestoreBody,
    /const\s+searchParams\s*=\s*new\s+URLSearchParams\s*\(\s*params\s*\)/,
    'deferred URL restore must normalize stored params back into URLSearchParams'
);
assert.match(
    deferredRestoreBody,
    /const\s+offset\s*=\s*Number\s*\(\s*searchParams\.get\s*\(\s*['"]offset['"]\s*\)\s*\|\|\s*0\s*\)/,
    'deferred URL restore must read offset from URLSearchParams, not the stored plain object'
);
assert.doesNotMatch(
    deferredRestoreBody,
    /params\.get\s*\(\s*['"]offset['"]\s*\)/,
    'deferred URL restore must not call .get() on the stored plain-object params'
);
assert.match(
    deferredRestoreBody,
    /restoreActiveClusterFilterFromUrl\s*\(\s*searchParams\s*\)/,
    'deferred URL restore must re-apply cluster filter state before replaying search'
);

assert.match(
    lifecycleSrc,
    /export\s*\{[\s\S]*\bresetStateBeforeUrlRestore\b[\s\S]*\}/m,
    'lifecycle compatibility export should remain explicit until dependent contracts are migrated'
);

console.log('url-state bridge contract passed');
