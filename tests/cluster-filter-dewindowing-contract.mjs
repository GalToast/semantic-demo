/**
 * cluster-filter-dewindowing-contract.mjs
 *
 * Fast Node contract test: cluster-filter.js no longer calls window.applyFilters,
 * window.clearSearchGlow, or window.updateUrlState directly.
 *
 * Coverage:
 *   1. cluster-filter.js imports applyFilters, clearSearchGlow, updateUrlState
 *      from the local cluster-filter-adapter.js module.
 *   2. cluster-filter.js does NOT contain window.applyFilters, window.clearSearchGlow,
 *      or window.updateUrlState call sites.
 *   3. cluster-filter-adapter.js exists, exports initClusterFilterAdapter, applyFilters,
 *      clearSearchGlow, updateUrlState, and isClusterFilterAdapterReady.
 *   4. app.js imports initClusterFilterAdapter and calls it in init(), injecting the
 *      actual window-bridged functions.
 *   5. cluster-filter-adapter.js is a leaf (no imports from cluster-filter, url-state,
 *      search-state, or lifecycle).
 *
 * Runs in Node — no Playwright, no browser, no DOM.
 * Source-only assertions via string search + structural analysis.
 *
 * Usage:
 *   node tests/cluster-filter-dewindowing-contract.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const CLUSTER_FILTER_PATH = path.join(SEMDEMO_ROOT, 'js/modules/cluster-filter.js');
const ADAPTER_PATH = path.join(SEMDEMO_ROOT, 'js/modules/cluster-filter-adapter.js');
const APP_PATH = path.join(SEMDEMO_ROOT, 'js/modules/app.js');

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertContains(haystack, needle, label) {
    const found = haystack.includes(needle);
    assert(found, `${label}: expected source to contain "${needle}", but it was not found`);
}

function assertNotContains(haystack, needle, label) {
    const found = haystack.includes(needle);
    assert(!found, `${label}: source should NOT contain "${needle}", but it was found`);
}

function getFunctionBody(src, fnName) {
    const fnPattern = new RegExp(`export function ${fnName}\\s*\\([^)]*\\)\\s*\\{`, 's');
    const match = src.match(fnPattern);
    if (!match) return '';
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        i++;
    }
    return src.slice(start, i - 1);
}

// ---------------------------------------------------------------------------
// TEST 1: cluster-filter.js imports from cluster-filter-adapter.js
// ---------------------------------------------------------------------------

function testClusterFilterImportsAdapter() {
    console.log('\n[TEST] cluster-filter.js imports from cluster-filter-adapter.js');

    const src = fs.readFileSync(CLUSTER_FILTER_PATH, 'utf-8');

    assertContains(
        src,
        "import { applyFilters, clearSearchGlow, updateUrlState, clearShortSemanticSearchState } from './cluster-filter-adapter.js';",
        'cluster-filter imports adapter functions'
    );

    console.log('  OK cluster-filter.js imports adapter functions');
}

// ---------------------------------------------------------------------------
// TEST 2: cluster-filter.js has NO window.applyFilters / window.clearSearchGlow / window.updateUrlState
// ---------------------------------------------------------------------------

function testNoDirectWindowCalls() {
    console.log('\n[TEST] cluster-filter.js has no direct window.* calls for the dewindowed trio');

    const src = fs.readFileSync(CLUSTER_FILTER_PATH, 'utf-8');

    // These patterns must NOT appear in cluster-filter.js
    const forbidden = [
        'window.applyFilters',
        'window.clearSearchGlow',
        'window.updateUrlState',
    ];

    forbidden.forEach((pattern) => {
        assertNotContains(src, pattern, `no ${pattern} call in cluster-filter.js`);
    });

    console.log('  OK cluster-filter.js has no direct window.* calls');
}

// ---------------------------------------------------------------------------
// TEST 3: cluster-filter-adapter.js exists and exports required functions
// ---------------------------------------------------------------------------

function testAdapterExports() {
    console.log('\n[TEST] cluster-filter-adapter.js exports required functions');

    const src = fs.readFileSync(ADAPTER_PATH, 'utf-8');

    assertContains(src, 'export function initClusterFilterAdapter', 'initClusterFilterAdapter exported');
    assertContains(src, 'export function applyFilters', 'applyFilters exported');
    assertContains(src, 'export function clearSearchGlow', 'clearSearchGlow exported');
    assertContains(src, 'export function updateUrlState', 'updateUrlState exported');
    assertContains(src, 'export function isClusterFilterAdapterReady', 'isClusterFilterAdapterReady exported');

    console.log('  OK cluster-filter-adapter.js exports all required functions');
}

// ---------------------------------------------------------------------------
// TEST 4: cluster-filter-adapter.js is a leaf — no imports from cluster-filter, url-state, search-state, lifecycle
// ---------------------------------------------------------------------------

function testAdapterIsLeaf() {
    console.log('\n[TEST] cluster-filter-adapter.js is a leaf (no circular/broad imports)');

    const src = fs.readFileSync(ADAPTER_PATH, 'utf-8');

    // These must NOT appear as actual import declarations
    const forbiddenImports = [
        "from './cluster-filter'",
        'from "./cluster-filter"',
        "from './url-state'",
        'from "./url-state"',
        "from './search-state'",
        'from "./search-state"',
        "from './lifecycle'",
        'from "./lifecycle"',
    ];

    forbiddenImports.forEach((mod) => {
        assertNotContains(src, mod, `adapter must not import ${mod}`);
    });

    console.log('  OK cluster-filter-adapter.js is a leaf module');
}

// ---------------------------------------------------------------------------
// TEST 5: app.js imports and calls initClusterFilterAdapter
// ---------------------------------------------------------------------------

function testAppInitializesAdapter() {
    console.log('\n[TEST] app.js imports initClusterFilterAdapter and calls it in init()');

    const src = fs.readFileSync(APP_PATH, 'utf-8');

    assertContains(src, "import { initClusterFilterAdapter } from './cluster-filter-adapter.js';", 'app.js imports initClusterFilterAdapter');
    assertContains(src, 'initClusterFilterAdapter(', 'app.js calls initClusterFilterAdapter');

    // Must be called before applyUrlState to ensure adapter is ready
    const adapterCallIdx = src.indexOf('initClusterFilterAdapter(');
    const urlStateCallIdx = src.indexOf("measureStep('applyUrlState', applyUrlState)");
    assert(adapterCallIdx !== -1 && urlStateCallIdx !== -1 && adapterCallIdx < urlStateCallIdx, 'initClusterFilterAdapter must be called BEFORE applyUrlState');

    console.log('  OK app.js initializes the cluster-filter adapter before applyUrlState');
}

// ---------------------------------------------------------------------------
// TEST 6: setClusterFilter calls the adapter functions
// ---------------------------------------------------------------------------

function testSetClusterFilterCallsAdapter() {
    console.log('\n[TEST] setClusterFilter calls adapter functions instead of window.*');

    const src = fs.readFileSync(CLUSTER_FILTER_PATH, 'utf-8');
    const body = getFunctionBody(src, 'setClusterFilter');

    assert(body.length > 0, 'setClusterFilter function body found');

    assert(body.includes('clearSearchGlow()'), 'setClusterFilter calls clearSearchGlow()');
    assert(body.includes('applyFilters()'), 'setClusterFilter calls applyFilters()');
    assert(body.includes('updateUrlState({}, { reason: \'cluster-filter\' })'), 'setClusterFilter calls updateUrlState with cluster-filter reason');

    assertNotContains(body, 'window.clearSearchGlow', 'setClusterFilter must not call window.clearSearchGlow');
    assertNotContains(body, 'window.applyFilters', 'setClusterFilter must not call window.applyFilters');
    assertNotContains(body, 'window.updateUrlState', 'setClusterFilter must not call window.updateUrlState');

    console.log('  OK setClusterFilter uses adapter calls');
}

// ---------------------------------------------------------------------------
// TEST 7: clearClusterFilter calls the adapter updateUrlState
// ---------------------------------------------------------------------------

function testClearClusterFilterCallsAdapter() {
    console.log('\n[TEST] clearClusterFilter calls adapter updateUrlState');

    const src = fs.readFileSync(CLUSTER_FILTER_PATH, 'utf-8');
    const body = getFunctionBody(src, 'clearClusterFilter');

    assert(body.length > 0, 'clearClusterFilter function body found');

    assert(body.includes('updateUrlState({}, { reason: \'cluster-filter-clear\' })'), 'clearClusterFilter calls updateUrlState');
    assertNotContains(body, 'window.updateUrlState', 'clearClusterFilter must not call window.updateUrlState');

    console.log('  OK clearClusterFilter uses adapter updateUrlState');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
    console.log('============================================================');
    console.log('cluster-filter-dewindowing-contract.mjs');
    console.log('Contract test: cluster-filter.js dewindowing seam');
    console.log('============================================================');

    try {
        testClusterFilterImportsAdapter();
        testNoDirectWindowCalls();
        testAdapterExports();
        testAdapterIsLeaf();
        testAppInitializesAdapter();
        testSetClusterFilterCallsAdapter();
        testClearClusterFilterCallsAdapter();

        console.log('\n============================================================');
        console.log('ALL TESTS PASSED');
        console.log('============================================================');
        process.exit(0);
    } catch (err) {
        console.error('\nTEST FAILED:', err.message);
        process.exit(1);
    }
}

main();
