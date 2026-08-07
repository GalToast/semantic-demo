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
import './helpers/svelte-rune-shim.mjs';

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

console.log('url-state bridge contract static passed');

// ── Runtime Behavioral Tests ──────────────────────────────────────────────────

// Shims needed for url-state imports
if (!globalThis.document) {
    globalThis.document = {
        body: { dataset: {}, classList: { add() {}, remove() {}, contains() { return false; } } },
        getElementById() { return null },
        createElement() { return { dataset: {}, style: {}, classList: { add() {}, remove() {} } } },
        querySelector() { return null }
    }
}
if (!globalThis.window) {
    globalThis.window = {
        location: { search: '', href: 'http://localhost:5173/' },
        history: { pushState() {}, replaceState() {} },
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} } }
    }
}
globalThis.Event = class Event { constructor(type) { this.type = type } }

const {
    clearExplorationFocusSelection,
    resetStateBeforeUrlRestore,
    applyUrlState
} = await import('../src/lib/orchestration/url-state.ts')
const { navStore } = await import('../src/lib/stores/navigation.svelte.ts')

// R1: clearExplorationFocusSelection is callable and resets nav state
{
    clearExplorationFocusSelection()
    // After clearing, the nav state should reflect reset values
    const navState = navStore.get ? navStore.get() : navStore
    if (navState.focusedIndex !== null && navState.focusedIndex !== undefined) {
        throw new Error(`expected focusedIndex=null/undefined after clear, got ${navState.focusedIndex}`)
    }
    console.log('  R1 PASS: clearExplorationFocusSelection → focusedIndex = null')
}

// R2: resetStateBeforeUrlRestore is callable (with clearSearchInput=false)
{
    try {
        resetStateBeforeUrlRestore({ clearSearchInput: false })
        console.log('  R2 PASS: resetStateBeforeUrlRestore({ clearSearchInput: false }) → no throw')
    } catch (e) {
        console.error(`  R2 FAIL: resetStateBeforeUrlRestore threw: ${e.message}`)
        process.exitCode = 1
    }
}

// R3: resetStateBeforeUrlRestore with clearSearchInput=true is callable
{
    try {
        resetStateBeforeUrlRestore({ clearSearchInput: true })
        console.log('  R3 PASS: resetStateBeforeUrlRestore({ clearSearchInput: true }) → no throw')
    } catch (e) {
        console.error(`  R3 FAIL: resetStateBeforeUrlRestore(clearSearchInput) threw: ${e.message}`)
        process.exitCode = 1
    }
}

// R4: clearExplorationFocusSelection idempotency (call twice, no throw)
{
    clearExplorationFocusSelection()
    clearExplorationFocusSelection()
    console.log('  R4 PASS: clearExplorationFocusSelection is idempotent')
}

// R5: applyUrlState is exported and callable (may throw due to missing DOM/window, but must be a function)
{
    assert.strictEqual(typeof applyUrlState, 'function', 'applyUrlState must be a function')
    console.log('  R5 PASS: applyUrlState is a function (canonical URL restore entry point)')
}

console.log('url-state bridge contract complete');
