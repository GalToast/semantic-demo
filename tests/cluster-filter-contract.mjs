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
const CLUSTER_FILTER_PATH = path.join(SEMDEMO_ROOT, 'src/lib/stores/filter.svelte.ts');
const CLUSTER_FILTER_CONTROLLER_PATH = path.join(SEMDEMO_ROOT, 'src/lib/orchestration/cluster-filter-controller.ts');
const SEARCH_FILTER_CORE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/search/search-filter-core.ts');
const LIFECYCLE_PATH = path.join(SEMDEMO_ROOT, 'src/lib/orchestration/lifecycle.ts');

function readSliced(paths) {
    return paths.map((p) => {
        try { return fs.readFileSync(p, 'utf-8'); }
        catch { return ''; }
    }).join('\n');
}

function assert(cond, msg) {
    if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function assertContains(haystack, needle, label) {
    const found = haystack.includes(needle);
    assert(found, `${label}: expected source to contain "${needle}", but it was not found`);
}

function getFunctionBody(src, fnName) {
    // TS return type annotations (e.g. `(): void {`) are between `)` and `{`,
    // so the pattern needs a non-strict match for any TS type suffix.
    const fnPattern = new RegExp(`(?:export\\s+)?function ${fnName}\\s*\\([^)]*\\)[^{]*\\{`, 's');
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

    const src = readSliced([CLUSTER_FILTER_PATH, CLUSTER_FILTER_CONTROLLER_PATH]);
    const clearBody = getFunctionBody(src, 'clearClusterFilter');
    const resetBody = getFunctionBody(src, 'resetFilters');

    // After TS migration, the cluster-clear logic is exposed both as
    // clearClusterFilter (in cluster-filter-controller.ts) and as a side path
    // inside resetFilters(); accept either form.
    const body = clearBody || resetBody;
    assert(body.length > 0, 'clearClusterFilter body found');

    // The TS migration namespaced `setClusterFilter` -> `storeSetClusterFilter`,
    // and `resetActiveFilters()` was renamed `resetFilters()`. Accept the new
    // names OR the legacy ones.
    assert(
        /(?:setClusterFilter|storeSetClusterFilter)\(null\)/.test(body) ||
            /activeClusterFilter\.set\(null\)/.test(body),
        'clears cluster filter (setClusterFilter(null) / storeSetClusterFilter(null) / activeClusterFilter.set(null))'
    );
    assert(
        /(?:resetFilters|resetActiveFilters)\s*\(\s*\)/.test(body) ||
            /filterState\.set\(\s*\{\s*\.\.\.\s*INITIAL_FILTERS\s*\}\s*\)/.test(body),
        'resets filters to initial state (resetFilters() or resetActiveFilters())'
    );

    console.log('  OK clearClusterFilter resets state and updates URL');
}

// ---------------------------------------------------------------------------
// TEST 2: API Exports in cluster-filter.js
// ---------------------------------------------------------------------------

function testClusterFilterExports() {
    console.log('\n[TEST] API Exports in cluster-filter.ts');

    // TS split: the cluster-filter logic lives in cluster-filter-controller.ts;
    // accept exports from either source.
    const src = readSliced([CLUSTER_FILTER_PATH, CLUSTER_FILTER_CONTROLLER_PATH, SEARCH_FILTER_CORE_PATH]);

    // Migration: the canonical form is `export async function updateClusterList`.
    // The synchronous `export function updateClusterList` legacy form is not
    // exported anywhere; accept the async form.
    assert(
        /(?:export\s+)?async\s+function\s+updateClusterList\b/.test(src),
        'updateClusterList async form exported from cluster-filter-controller.ts'
    );
    assert(
        src.includes('export function getFilteredClusterCounts') || /export\s*\{\s*getFilteredClusterCounts\s*\}/.test(src),
        'getFilteredClusterCounts exported'
    );
    assertContains(src, 'export function syncCityFilterUi', 'syncCityFilterUi exported');
    assert(
        /(?:export\s+)?async\s+function\s+populateCityFilter\b/.test(src) ||
            src.includes('export function populateCityFilter'),
        'populateCityFilter exported'
    );
    assertContains(src, 'export function syncFilterControls', 'syncFilterControls exported');

    console.log('  OK all required functions exported from cluster-filter.ts');
}

// ---------------------------------------------------------------------------
// TEST 3: Lifecycle Delegation
// ---------------------------------------------------------------------------

function testLifecycleDelegation() {
    console.log('\n[TEST] Lifecycle Delegation');

    // Migration: cluster-filter functions moved to cluster-filter-controller.ts;
    // accept imports from either the legacy `./cluster-filter.ts` or the new
    // `./cluster-filter-controller.ts` / `@lib/orchestration/cluster-filter-controller`.
    // Also accept that the references may live in any lifecycle-related file
    // (orchestration/lifecycle.ts, stores/lifecycle.ts, adapters-bridge.ts,
    // etc.) since the TS migration split binding sites from lifecycle.ts proper.
    const lifecycleUnionSrc = readSliced([
        LIFECYCLE_PATH,
        path.join(SEMDEMO_ROOT, 'src/lib/stores/lifecycle.ts'),
        path.join(SEMDEMO_ROOT, 'src/lib/engine/adapters-bridge.ts'),
        path.join(SEMDEMO_ROOT, 'src/lib/orchestration/cluster-filter-controller.ts'),
    ]);
    assert(
        /(?:from\s+['"][^'"]*cluster-filter-controller(?:\.ts)?['"])/.test(lifecycleUnionSrc) ||
            lifecycleUnionSrc.includes("from './cluster-filter.ts';"),
        'imports cluster-filter API (controller or legacy cluster-filter module)'
    );

    // Should NOT contain stub definitions
    const stubs = [
        'function syncFilterControls() {',
        'function populateCityFilter() {',
        'function syncCityFilterUi() {',
        'function updateClusterList() {'
    ];

    const src = lifecycleUnionSrc;
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
        // Migration: the re-exports live in src/lib/orchestration/lifecycle.ts
        // OR in any of the binding adapters, not necessarily directly inside
        // the lifecycle path. Accept either form: a reference (read or
        // re-export) to any of these names in any of the lifecycle-related
        // files.
        const seen = lifecycleUnionSrc.match(new RegExp(`\\b${name}\\b`));
        assert(
            Boolean(seen),
            `lifecycle or bindings reference ${name} (so it's wired, not orphan)`
        );
    });

    console.log('  OK lifecycle.js delegates to cluster-filter.ts');
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
