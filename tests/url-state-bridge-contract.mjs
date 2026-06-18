/**
 * url-state-bridge-contract.mjs
 *
 * Contract for URL restore ownership after the Svelte/TS migration.
 *
 * Current compatibility rule:
 * - url-state.ts is the canonical owner of resetStateBeforeUrlRestore.
 * - lifecycle.ts re-exports resetStateBeforeUrlRestore from url-state.ts for
 *   backward-compatible legacy contracts and call sites.
 * - url-state.ts must not import resetStateBeforeUrlRestore from lifecycle.ts
 *   (circular-dependency prevention).
 * - url-state.ts must not restore retired URL search/navigation adapters.
 * - url-state.ts owns applyUrlState as the canonical URL restore entry point.
 */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const cwd = process.cwd();

// ── Read canonical source files directly ──────────────────────────────────────
// Bypass resolveSource (its js/modules remap table no longer covers orchestration paths).

const urlStateSrc = readFileSync(
    resolve(cwd, 'src/lib/orchestration/url-state.ts'),
    'utf8'
);
const lifecycleSrc = readFileSync(
    resolve(cwd, 'src/lib/orchestration/lifecycle.ts'),
    'utf8'
);

// ── 1. URL restore ownership lives in url-state.ts ───────────────────────────

assert.match(
    urlStateSrc,
    /export\s+function\s+resetStateBeforeUrlRestore\s*\(\s*options\s*[:{]/,
    'url-state.ts must define (not just re-export) resetStateBeforeUrlRestore'
);

// ── 2. Lifecycle re-exports resetStateBeforeUrlRestore for compat ─────────────

assert(
    // Direct re-export line: export { resetStateBeforeUrlRestore, ... } from '...'
    /export\s*\{[\s\S]*\bresetStateBeforeUrlRestore\b[\s\S]*\}\s*from\s*['"]@lib\/orchestration\/url-state['"]/m.test(lifecycleSrc)
    || /export\s*\{[\s\S]*\bresetStateBeforeUrlRestore\b[\s\S]*\}\s*from\s*['"][^'"]*url-state[^'"]*['"]/m.test(lifecycleSrc)
    || /export\s*\{[\s\S]*\bresetStateBeforeUrlRestore\b[\s\S]*\}\s*from\s*['"]\..*url-state[^'"]*['"]/m.test(lifecycleSrc),
    'lifecycle.ts must re-export resetStateBeforeUrlRestore from url-state.ts (compat bridge)'
);

// ── 3. No circular import: url-state.ts must not pull reset from lifecycle ────

const resetImportFromLifecycle = /import\s*\{[\s\S]*resetStateBeforeUrlRestore[\s\S]*\}\s*from\s*['"][^'"]*lifecycle[^'"]*['"]/m;
assert.equal(
    resetImportFromLifecycle.test(urlStateSrc),
    false,
    'url-state.ts must not import resetStateBeforeUrlRestore from lifecycle (circular-dependency guard)'
);

// ── 4. No retired URL adapter seams resurrected ──────────────────────────────

assert.doesNotMatch(
    urlStateSrc,
    /url-search-adapter|url-navigation-adapter|getUrlSearchAdapter|urlSearchAdapter|urlNavigationAdapter/,
    'url-state.ts must not reference retired URL search-adapter seams'
);
assert.doesNotMatch(
    lifecycleSrc,
    /url-search-adapter|url-navigation-adapter|getUrlSearchAdapter|urlSearchAdapter|urlNavigationAdapter/,
    'lifecycle.ts must not reference retired URL search-adapter seams'
);

// ── 5. Canonical URL restore entry point ─────────────────────────────────────

assert.match(
    urlStateSrc,
    /export\s+async\s+function\s+applyUrlState\b/,
    'url-state.ts must export applyUrlState as the canonical URL restore entry point'
);

// ── 6. applyUrlState owns the full restore lifecycle ──────────────────────────
//    It must read URLSearchParams, reset state, and apply filters/search.

const applyUrlBody = urlStateSrc.match(
    /export\s+async\s+function\s+applyUrlState\s*\([^)]*\)[^{]*\{[\s\S]*?\n\}/
)?.[0] || '';

// applyUrlState must obtain URLSearchParams (either inline or via getSearchParams helper)
assert(
    /new\s+URLSearchParams\s*\(\s*window\.location\.search/.test(applyUrlBody)
    || /getSearchParams\s*\(\s*\)/.test(applyUrlBody),
    'applyUrlState must read URLSearchParams from window.location (via getSearchParams or inline)'
);
assert.match(
    applyUrlBody,
    /resetStateBeforeUrlRestore\s*\(\s*\)/,
    'applyUrlState must call resetStateBeforeUrlRestore() before applying URL params'
);

// ── 7. url-state.ts does not import from retired search-state.js ──────────────

assert.doesNotMatch(
    urlStateSrc,
    /from\s*['"][^'"]*search-state\.js['"]/,
    'url-state.ts must not import from retired search-state.js (use Svelte stores directly)'
);

// ── 8. url-state.ts owns clearExplorationFocusSelection ───────────────────────

assert.match(
    urlStateSrc,
    /export\s+function\s+clearExplorationFocusSelection\s*\(/,
    'url-state.ts must define clearExplorationFocusSelection (focus-clear before URL restore)'
);

console.log('url-state bridge contract passed');
