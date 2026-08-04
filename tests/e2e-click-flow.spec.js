import { test, expect } from '@playwright/test'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8796').replace(/\/$/, '')
const APP_PATH = process.env.TEST_APP_PATH || '/dist/svelte/index.html'
const SEMANTIC_HEALTH_STUB = {
    ok: true,
    state: 'healthy',
    provenance: {
        label: 'Search ready',
        detail: 'Semantic search is ready.'
    }
}
const SEARCH_STUB = {
    ok: true,
    count: 3,
    results: [
        {
            index: 0,
            lead_id: 1,
            name: 'Java Junction Coffee',
            what: 'Coffee roaster and cafe',
            city: 'Conroe',
            lat: 30.3119,
            lng: -95.4561,
            cluster: 3,
            status: 'active',
            website: 'https://example.com/java',
            email: 'hello@example.com',
            phone: '(936) 555-0101',
            score: 0.99,
            semantic_score: 0.99,
            public_note: 'Coffee-relevant local business result.'
        },
        {
            index: 1,
            lead_id: 2,
            name: 'The Grind House',
            what: 'Coffee shop',
            city: 'The Woodlands',
            lat: 30.1658,
            lng: -95.4612,
            cluster: 3,
            status: 'active',
            website: 'https://example.com/grind',
            email: 'hi@example.com',
            phone: '(936) 555-0102',
            score: 0.91,
            semantic_score: 0.91,
            public_note: 'Nearby hospitality result.'
        },
        {
            index: 2,
            lead_id: 20,
            name: 'Cafe Mosaic',
            what: 'Cafe and bakery',
            city: 'Montgomery',
            lat: 30.3883,
            lng: -95.6963,
            cluster: 5,
            status: 'active',
            website: 'https://example.com/mosaic',
            email: 'cafe@example.com',
            phone: '(936) 555-0103',
            score: 0.86,
            semantic_score: 0.86,
            public_note: 'Related local service result.'
        }
    ]
}

test('E2E Semantic Explorer Click Flow', async ({ page }) => {
    test.setTimeout(180000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.route('**api.php**semantic_lane_health**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(SEMANTIC_HEALTH_STUB)
        })
    })
    await page.route('**api.php**semantic_search**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(SEARCH_STUB)
        })
    })

    // 1. Initial Load
    // Boot via the deep-link query so the result pipeline reliably populates
    // (the typed-only idle boot additionally fights the splash/help/data gates
    // in this environment). NOTE 2026-08-04: the deep-link restore keeps a
    // url-state piggyback in flight (waitForSearchSettle + post-settle surface
    // reconciliation) that can clobber a view switch that lands before the
    // focus-settle completes — the bounded retry below is the mitigation.
    await page.goto(`${BASE_URL}${APP_PATH}?q=coffee&nodemo=1`)
    await expect(page).toHaveTitle(/Semantic Explorer|MoCo Business Mycelium/)
    await page.waitForSelector('#search-input', { state: 'visible', timeout: 30000 })
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {})

    // 2. Perform Search
    // The fill() re-triggers a fresh search over the deep-link results so the
    // result list is authoritative for the click below.
    const searchInput = page.locator('#search-input')
    await searchInput.focus()
    await searchInput.fill('coffee')
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 30000 })
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {})

    // 3. Focus / Step Inside
    await page.locator('.search-result-item').first().click()
    // result click — settlement handled by subsequent waitForFunction

    // Wait for the search-focus transition to fully settle before switching
    // views. A click lands while the app is in its 'focusing' phase (amber
    // camera/settle state); switching to map mid-transition lets the pending
    // focus-settle reconciliation (which re-writes mode:'search' +
    // surface:'focus-search' and restores the galaxy view) land AFTER the
    // switch and clobber it — the app pins to galaxy and
    // `dataset.activeView === 'map'` never flips (probe-parity-timeline
    // matrix, 2026-08-04: switches from settled state always stick).
    // Gate on the settled focus DOM, NOT on searchStatus: headless GPU stalls
    // can leave status stuck at 'focusing' even when the focus UI is fully
    // settled (CAMERA_NODE_FOCUSED never publishes), which would make a status
    // gate hang forever. Accept either the InfoPanel (#selected-card) or the
    // FocusCard (#focus-card-selected) — the search-result-click path lands on
    // 'focus-search' where the InfoPanel is the visible business card.
    await page.waitForFunction(
        () =>
            document.querySelector('#selected-card') !== null ||
            document.querySelector('#focus-card-selected') !== null,
        null,
        { timeout: 30000, polling: 100 }
    )
    // Second rAF settle so the settled-state DOM (focus card, panel) paints
    // before the view switch.
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {})

    // The map switch can be clobbered once by the focus-settle reconciliation
    // tail: if the settle completes AFTER the switch (the click's camera/settle
    // chain can lag ~10-20s behind a headless main-thread stall), the app
    // re-writes mode/surface and restores the galaxy view, so
    // `dataset.activeView === 'map'` never flips even though the switch itself
    // committed (write trail shows `currentView:'map'` mirroring at switch
    // time, then a settle-path write reverts it; probe matrix 2026-08-04).
    // Settled-state switches always stick (E2 matrix), so a bounded retry is
    // deterministic: once the settle tail has run, the next attempt lands.
    let switched = false
    for (let attempt = 0; attempt < 15 && !switched; attempt++) {
        await page.evaluate(() => window.__navActions__.switchView('map', { skipTerrainPrelude: true }))
        await page
            .waitForFunction(() => document.body.dataset.activeView === 'map', {
                timeout: 4000,
                polling: 50
            })
            .then(() => {
                switched = true
            })
            .catch(() => {
                /* settle tail may still be pending — retry */
            })
    }
    expect(switched, 'map switch must stick after the focus-settle reconciliation (bounded retry)').toBe(true)

    // 4. Switch to Map Mode
    // Repaired 2026-08-03: the original drove the dead legacy #btn-map overlay
    // button (zero render sites since the controls overlay was retired;
    // f0bceb84 removed the bindings). Drive the real switchView function via
    // the Playwright test-globals hook and assert the parity dataset, matching
    // the switchview-race repair.

    // 5. Shareable-state assertion
    // The share/copy-link button (#btn-share-view) was also retired — it renders
    // nowhere and copyCurrentViewLink now has zero live callers. Its clipboard
    // content (view=map + q=coffee) is exactly the URL state the share link
    // would carry, so assert the URL directly: the map switch must record
    // view=map (typed-bus URL sync, d4e0f096) and the search query must survive.
    expect(page.url(), 'map switch must record view=map in the URL').toContain('view=map')
    expect(page.url(), 'search query must survive the map switch').toContain('q=coffee')

    // 6. Reset
    await page.evaluate(() => {
        const resetExperienceState = window.__navActions__?.resetExperienceState
        if (typeof resetExperienceState === 'function') {
            resetExperienceState()
        }
    })
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {})
})

test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
        localStorage.removeItem('moco_mycelium_demo_v1')
        sessionStorage.clear()
    })
})
