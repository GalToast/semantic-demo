/**
 * cluster-filter-contract.mjs
 *
 * Fast Node contract test: cluster-filter.js public API and lifecycle delegation.
 *
 * Coverage:
 *   1. clearClusterFilter resets state and calls applyFilters/updateUrlState.
 *   2. updateClusterList is exported and performs UI/state updates.
 *   3. getFilteredClusterCounts is exported and returns Map of counts.
 *   4. lifecycle.js re-exports the cluster-filter API for global bridges.
 *
 * Runs in Node — no Playwright, no browser, no DOM.
 * Source-only assertions via string search + structural analysis.
 */

import fs from 'node:fs';
import path from 'node:path';

const SEMDEMO_ROOT = path.resolve(process.cwd());
const CLUSTER_FILTER_PATH = path.join(SEMDEMO_ROOT, 'js/modules/cluster-filter.js');
const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'js/modules/lifecycle.js');

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertContains(haystack, needle, label) {
    const found = haystack.includes(needle);
    assert(found, `${label}: expected source to contain "${needle}", but it was not found`);
}

function getFunctionBody(src, fnName) {
    const fnPattern = new RegExp(`(?:export\\s+)?function ${fnName}\\s*\\([^)]*\\)\\s*\\{`, 's');
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
// TEST 1: clearClusterFilter implementation
// ---------------------------------------------------------------------------

function testClearClusterFilter() {
    console.log('\n[TEST] clearClusterFilter implementation');

    const src = fs.readFileSync(CLUSTER_FILTER_PATH, 'utf-8');
    const body = getFunctionBody(src, 'clearClusterFilter');

    assert(body.length > 0, 'clearClusterFilter body found');
    assertContains(body, 'resetActiveFilters()', 'calls resetActiveFilters()');
    assertContains(body, 'setClusterFilter(null)', 'calls setClusterFilter(null)');
    assertContains(body, "updateUrlState({}, { reason: 'cluster-filter-clear' })", 'updates URL state');

    console.log('  OK clearClusterFilter resets state and updates URL');
}

// ---------------------------------------------------------------------------
// TEST 2: API Exports in cluster-filter.js
// ---------------------------------------------------------------------------

function testClusterFilterExports() {
    console.log('\n[TEST] API Exports in cluster-filter.js');

    const src = fs.readFileSync(CLUSTER_FILTER_PATH, 'utf-8');

    assertContains(src, 'export function updateClusterList', 'updateClusterList exported');
    assert(
        src.includes('export function getFilteredClusterCounts') || /export\s*\{\s*getFilteredClusterCounts\s*\}/.test(src),
        'getFilteredClusterCounts exported'
    );
    assertContains(src, 'export function syncCityFilterUi', 'syncCityFilterUi exported');
    assertContains(src, 'export function populateCityFilter', 'populateCityFilter exported');
    assertContains(src, 'export function syncFilterControls', 'syncFilterControls exported');

    console.log('  OK all required functions exported from cluster-filter.js');
}

// ---------------------------------------------------------------------------
// TEST 3: Lifecycle Delegation
// ---------------------------------------------------------------------------

function testLifecycleDelegation() {
    console.log('\n[TEST] Lifecycle Delegation');

    const src = fs.readFileSync(LIFECYCLE_PATH, 'utf-8');

    // Should import from cluster-filter.js
    assertContains(src, "from './cluster-filter.js';", 'imports from cluster-filter.js');

    // Should NOT contain stub definitions
    const stubs = [
        'function syncFilterControls() {',
        'function populateCityFilter() {',
        'function syncCityFilterUi() {',
        'function updateClusterList() {'
    ];

    stubs.forEach(stub => {
        assert(!src.includes(stub), `Lifecycle should NOT contain stub: ${stub}`);
    });

    [
        'clearClusterFilter',
        'updateClusterList',
        'getFilteredClusterCounts',
        'applyFilters',
        'syncCityFilterUi',
        'populateCityFilter',
        'syncFilterControls'
    ].forEach((name) => {
        assert(new RegExp(`\\b${name}\\b`).test(src), `lifecycle re-exports ${name}`);
    });

    console.log('  OK lifecycle.js delegates to cluster-filter.js');
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

function main() {
    console.log('============================================================');
    console.log('cluster-filter-contract.mjs');
    console.log('Contract test: cluster-filter API and delegation');
    console.log('============================================================');

    try {
        testClearClusterFilter();
        testClusterFilterExports();
        testLifecycleDelegation();

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
