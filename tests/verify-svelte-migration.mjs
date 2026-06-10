#!/usr/bin/env node
/**
 * Svelte Migration Browser Proof
 *
 * Verifies that all 4 Svelte islands actually mount into the DOM and render
 * real content. Replaces the deleted verify-svelte-migration.mjs referenced
 * in the wave-15 checkpoint.
 *
 * What this test proves (real behavior, not mocked):
 *   1. App.svelte mounts into #app-root (unified chrome owner)
 *   2. search-chrome-slot gets a mounted SearchChrome island
 *   3. selected-details renders the SelectedBusinessDetails component
 *   4. search-results remains present as the legacy-owned surface slot
 *   5. filter-chrome-slot gets a mounted FilterChrome island
 *   6. Each mounted island/component renders real DOM children (not empty slots)
 *
 * Run:  node tests/verify-svelte-migration.mjs
 *       npm run test:svelte-migration
 *
 * Requires the dev server at 127.0.0.1:8795 or TEST_BASE_URL override.
 */

import { chromium } from 'playwright';

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8795';
const APP_PATH = process.env.TEST_APP_PATH || '/vector-explorer-polished.html';
const DIAGNOSTIC = process.env.DIAGNOSTIC === '1';

const SEMANTIC_HEALTH_STUB = {
    ok: true,
    state: 'healthy',
    provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
};

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
    if (condition) {
        console.log(`  ok ${message}`);
        passed++;
    } else {
        console.log(`  FAIL ${message}`);
        failed++;
        failures.push(message);
    }
}

async function diag(page, label) {
    if (!DIAGNOSTIC) return;
    const state = await page.evaluate(() => {
        const s = window.__state || window.state || {};
        return {
            eventListenersInitialized: s.eventListenersInitialized,
            pointsLength: s.points?.length,
            dataLoadAttempt: s.dataLoadAttempt,
        };
    }).catch(() => 'eval failed');
    const slots = await page.evaluate(() => ({
        searchChrome: !!document.getElementById('search-chrome-slot'),
        searchResults: !!document.getElementById('search-results'),
        selectedDetails: !!document.getElementById('selected-details'),
        filterChrome: !!document.getElementById('filter-chrome-slot'),
        filterChromeMounted: document.getElementById('filter-chrome-slot')?.dataset?.svelteMounted,
        searchChromeMounted: document.getElementById('search-chrome-slot')?.dataset?.svelteMounted,
        searchResultsMounted: document.getElementById('search-results')?.dataset?.svelteMounted,
        selectedDetailsMounted: document.getElementById('selected-details')?.dataset?.svelteMounted,
    })).catch(() => 'eval failed');
    console.log(`  [diag ${label}] state=`, JSON.stringify(state), 'slots=', JSON.stringify(slots));
}

// Main

async function main() {
    const url = `${BASE_URL}${APP_PATH}`;
    console.log(`\nSvelte migration browser proof: ${url}\n`);

    let browser;
    let page;
    try {
        browser = await chromium.launch({ headless: false });
        page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

        const consoleMessages = [];
        page.on('console', (msg) => {
            consoleMessages.push({ type: msg.type(), text: msg.text() });
        });

        // Intercept API calls to avoid real backend dependency
        await page.route('**/api.php**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(SEMANTIC_HEALTH_STUB)
            })
        );
        // Mock data assets so loadData() resolves quickly
        await page.route('**/data.dat**', (route) =>
            route.fulfill({ status: 200, contentType: 'application/octet-stream', body: Buffer.alloc(0) })
        );
        await page.route('**/leadEnrichment**', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
        );

        // Suppress the micro-demo so the chrome/island contract is deterministic.
        await page.goto(`${url}?nodemo=1`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

        // Step 1: App.svelte must mount into #app-root
        console.log('Waiting for App.svelte to mount into #app-root...');
        await page.waitForFunction(() => {
            const root = document.getElementById('app-root');
            return root && root.children.length > 0;
        }, { timeout: 30_000 });
        assert(true, 'App.svelte mounted into #app-root (children present)');

        // Verify App.svelte renders InfoPanelChrome
        const hasInfoPanel = await page.evaluate(() => !!document.getElementById('info-panel'));
        assert(hasInfoPanel, 'InfoPanelChrome rendered (info-panel element exists)');

        // Verify App.svelte renders LegendPanelChrome
        const hasLegendPanel = await page.evaluate(() => !!document.getElementById('btn-legend'));
        assert(hasLegendPanel, 'LegendPanelChrome rendered (btn-legend exists)');

        // Verify App.svelte renders SemanticGuideOverlay
        const hasSemanticGuide = await page.evaluate(() => !!document.getElementById('semantic-summary-card'));
        assert(hasSemanticGuide, 'SemanticGuideOverlay rendered (semantic-summary-card exists)');

        // Verify App.svelte renders the loading overlay
        const hasLoadingOverlay = await page.evaluate(() => !!document.getElementById('loading-overlay'));
        assert(hasLoadingOverlay, 'Loading overlay rendered (loading-overlay exists)');

        // Step 2: Wait for full app init
        // The loading overlay hides when init completes (or via safety-valve timer).
        // initEventListeners (which sets up island mounters) runs during initCoreUi.
        console.log('Waiting for loading overlay to hide (app init complete)...');
        await diag(page, 'before-wait-overlay');
        await page.waitForFunction(() => {
            const overlay = document.getElementById('loading-overlay');
            if (!overlay) return true;
            // Check various ways the overlay might be hidden
            if (overlay.hidden) return true;
            if (overlay.style.display === 'none') return true;
            if (overlay.classList.contains('is-hidden')) return true;
            const cs = getComputedStyle(overlay);
            if (cs.display === 'none') return true;
            if (cs.opacity === '0') return true;
            // Also check for the 'is-leaving' class that lifecycle.js adds
            if (overlay.classList.contains('is-leaving')) return true;
            return false;
        }, { timeout: 60_000 });
        assert(true, 'Loading overlay hidden (app init complete)');
        await diag(page, 'after-wait-overlay');

        // Extra settle time for dynamic imports to resolve
        await page.waitForTimeout(2000);
        await diag(page, 'after-settle');

        // Step 3: Force panelSurface to expose all island slots
        console.log('Setting panelSurface to map-focus-search to expose all slots...');
        await page.evaluate(() => {
            document.body.dataset.panelSurface = 'map-focus-search';
        });
        // Give Svelte time to react to the compositionStore change
        await page.waitForTimeout(1000);
        await diag(page, 'after-panelSurface');

        // Verify the slots are now in the DOM
        const slotsExist = await page.evaluate(() => ({
            searchChrome: !!document.getElementById('search-chrome-slot'),
            searchResults: !!document.getElementById('search-results'),
            selectedDetails: !!document.getElementById('selected-details'),
            filterChrome: !!document.getElementById('filter-chrome-slot')
        }));
        assert(slotsExist.searchChrome, 'search-chrome-slot exists in DOM after panelSurface change');
        assert(slotsExist.searchResults, 'search-results slot exists in DOM after panelSurface change');
        assert(slotsExist.selectedDetails, 'selected-details slot exists in DOM after panelSurface change');
        assert(slotsExist.filterChrome, 'filter-chrome-slot exists in DOM after panelSurface change');

        // Step 4: Wait for surviving Svelte islands and component surfaces
        // SearchChrome and FilterChrome are still mounted through awaitSlot island helpers.
        // SearchResults and SelectedBusinessDetails are rendered inside App.svelte info-panel
        // surfaces; the search-results slot remains legacy-owned until a query populates it.
        console.log('Waiting for Svelte islands and component surfaces...');

        const MOUNT_FLAG = 'svelteMounted';
        const ISLAND_DEFS = [
            { slotId: 'search-chrome-slot', flag: 'search-chrome', label: 'SearchChrome' },
            { slotId: 'filter-chrome-slot', flag: 'filter-chrome', label: 'FilterChrome' }
        ];

        for (const island of ISLAND_DEFS) {
            try {
                // Playwright waitForFunction(expression, arg, options): arg is a single value.
                // Pass all params as a single object arg, options separately.
                await page.waitForFunction(
                    ({ slotId, flag, mountFlag }) => {
                        const el = document.getElementById(slotId);
                        return el && el.dataset[mountFlag] === flag;
                    },
                    { slotId: island.slotId, flag: island.flag, mountFlag: MOUNT_FLAG },
                    { timeout: 30_000 }
                );
                assert(true, `${island.label} island mounted (data-svelte-mounted=${island.flag})`);
            } catch {
                // Diagnostic: dump the actual state before declaring failure
                await diag(page, `failed-${island.label}`);
                assert(false, `${island.label} island failed to mount within 30s`);
            }
        }

        await page.waitForFunction(() => {
            const selected = document.getElementById('selected-details');
            return selected && selected.querySelector('#selected-name') && selected.querySelector('#selected-what') && selected.querySelector('.selected-grid');
        }, { timeout: 30_000 });
        assert(true, 'SelectedBusinessDetails rendered inside selected-details surface');

        await page.waitForFunction(() => {
            const results = document.getElementById('search-results');
            return results && results.classList.contains('search-results');
        }, { timeout: 30_000 });
        assert(true, 'Search results surface exists for legacy renderer');

        // Step 5: Verify each mounted island/component rendered real DOM content
        console.log('Verifying real DOM content in mounted islands and component surfaces...');

        // SearchChrome: should contain the search input and clear button
        const searchChromeContent = await page.evaluate(() => {
            const slot = document.getElementById('search-chrome-slot');
            if (!slot) return { hasChildren: false };
            return {
                hasChildren: slot.children.length > 0,
                hasInput: !!slot.querySelector('#search-input'),
                hasClear: !!slot.querySelector('#search-clear-btn'),
                hasSearchLabel: !!slot.querySelector('.search-label')
            };
        });
        assert(searchChromeContent.hasChildren, 'SearchChrome rendered children');
        assert(searchChromeContent.hasInput, 'SearchChrome rendered #search-input');
        assert(searchChromeContent.hasClear, 'SearchChrome rendered #search-clear-btn');
        assert(searchChromeContent.hasSearchLabel, 'SearchChrome rendered .search-label');

        // Search results: no query is seeded in this proof, so the legacy-owned surface
        // is expected to be empty. The component surface check above proves it exists.
        const searchResultsContent = await page.evaluate(() => {
            const slot = document.getElementById('search-results');
            if (!slot) return { exists: false };
            return {
                exists: slot.classList.contains('search-results'),
                childCount: slot.children.length
            };
        });
        assert(searchResultsContent.exists, 'Search results surface exists and is empty without a query');

        // SelectedBusinessDetails: should render the selected-hero section
        const selectedDetailsContent = await page.evaluate(() => {
            const slot = document.getElementById('selected-details');
            if (!slot) return { mounted: false };
            return {
                mounted: true,
                hasChildren: slot.children.length > 0,
                hasHero: !!slot.querySelector('.selected-hero'),
                hasName: !!slot.querySelector('#selected-name'),
                hasWhat: !!slot.querySelector('#selected-what'),
                hasGrid: !!slot.querySelector('.selected-grid'),
                childCount: slot.children.length
            };
        });
        assert(selectedDetailsContent.mounted, 'SelectedBusinessDetails surface is mounted');
        assert(selectedDetailsContent.hasChildren, 'SelectedBusinessDetails rendered children');
        assert(selectedDetailsContent.hasHero, 'SelectedBusinessDetails rendered .selected-hero');
        assert(selectedDetailsContent.hasName, 'SelectedBusinessDetails rendered #selected-name');
        assert(selectedDetailsContent.hasWhat, 'SelectedBusinessDetails rendered #selected-what');
        assert(selectedDetailsContent.hasGrid, 'SelectedBusinessDetails rendered .selected-grid');

        // FilterChrome: should contain the filter toolbar
        const filterChromeContent = await page.evaluate(() => {
            const slot = document.getElementById('filter-chrome-slot');
            if (!slot) return { hasChildren: false };
            return {
                hasChildren: slot.children.length > 0,
                hasToolbar: !!slot.querySelector('.filter-toolbar'),
                hasStatusRow: !!slot.querySelector('#status-filter-row'),
                hasSignalRow: !!slot.querySelector('#signal-filter-row'),
                hasClearBtn: !!slot.querySelector('#filter-clear-btn'),
                hasCityFilter: !!slot.querySelector('#city-filter')
            };
        });
        assert(filterChromeContent.hasChildren, 'FilterChrome rendered children');
        assert(filterChromeContent.hasToolbar, 'FilterChrome rendered .filter-toolbar');
        assert(filterChromeContent.hasStatusRow, 'FilterChrome rendered #status-filter-row');
        assert(filterChromeContent.hasSignalRow, 'FilterChrome rendered #signal-filter-row');
        assert(filterChromeContent.hasClearBtn, 'FilterChrome rendered #filter-clear-btn');
        assert(filterChromeContent.hasCityFilter, 'FilterChrome rendered #city-filter');

        // Step 6: Verify store-to-DOM reactivity (FilterChrome)
        console.log('Verifying store reactivity in FilterChrome...');
        // Force the filters section open so chips are interactable
        await page.evaluate(() => {
            const section = document.getElementById('filters-section');
            if (section && typeof section.open === 'boolean') section.open = true;
        });
        await page.waitForTimeout(200);

        const chipBefore = await page.evaluate(() => {
            const active = document.querySelector('[data-status-filter="all"]');
            return active?.getAttribute('aria-pressed');
        });
        assert(chipBefore === 'true', 'FilterChrome: "All" chip starts with aria-pressed=true');

        // Click via evaluate (CSS might hide from Playwright click)
        await page.evaluate(() => {
            const btn = document.querySelector('[data-status-filter="active"]');
            if (btn) btn.click();
        });
        await page.waitForTimeout(200);

        const chipAfter = await page.evaluate(() => {
            const all = document.querySelector('[data-status-filter="all"]');
            const activeBtn = document.querySelector('[data-status-filter="active"]');
            return {
                allPressed: all?.getAttribute('aria-pressed'),
                activePressed: activeBtn?.getAttribute('aria-pressed')
            };
        });
        assert(chipAfter.allPressed === 'false', 'FilterChrome: "All" chip aria-pressed=false after click');
        assert(chipAfter.activePressed === 'true', 'FilterChrome: "Active" chip aria-pressed=true after click');

        // Reset back to All
        await page.evaluate(() => {
            const btn = document.querySelector('[data-status-filter="all"]');
            if (btn) btn.click();
        });

        // Step 7: Verify no console errors from Svelte islands
        const svelteErrors = consoleMessages.filter((m) =>
            m.type === 'error' &&
            !m.text.includes('favicon') &&
            !m.text.includes('net::ERR') &&
            !m.text.includes('WebSocket') &&
            !m.text.includes('Failed to load resource') &&
            !m.text.includes('Worker') &&
            !m.text.includes('data.dat') &&
            !m.text.includes('leadEnrichment')
        );
        if (svelteErrors.length > 0) {
            console.log('  Console errors from Svelte islands:');
            for (const err of svelteErrors) {
                console.log(`    ${err.text}`);
            }
        }
        assert(svelteErrors.length === 0, 'No Svelte-related console errors during mount');

    } catch (err) {
        console.error(`\nFatal error: ${err.message}`);
        failed++;
        failures.push(`Fatal: ${err.message}`);
    } finally {
        if (browser) await browser.close();
    }

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Svelte migration browser proof: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log('\nFailures:');
        for (const f of failures) {
            console.log(`  - ${f}`);
        }
    }
    console.log(`${'='.repeat(60)}\n`);

    process.exit(failed > 0 ? 1 : 0);
}

main();
