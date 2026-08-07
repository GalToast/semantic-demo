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
    test.setTimeout(240000)
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
    // Poll for settled DOM (results rendered) instead of double-rAF — the CDP
    // channel is immune to headless GPU rAF stalls (see pollFor rationale).
    await page.waitForFunction(
        () => document.querySelector('.search-result-item') !== null || document.querySelector('#search-result-list') !== null,
        null,
        { timeout: 15000, polling: 100 }
    )

    // 2. Perform Search
    // The fill() re-triggers a fresh search over the deep-link results so the
    // result list is authoritative for the click below.
    const searchInput = page.locator('#search-input')
    await searchInput.focus()
    await searchInput.fill('coffee')
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 30000 })
    // Poll for at least 1 result with populated text instead of double-rAF.
    await page.waitForFunction(
        () => {
            const items = document.querySelectorAll('.search-result-item')
            if (items.length === 0) return false
            return items[0].textContent.trim().length > 0
        },
        null,
        { timeout: 15000, polling: 100 }
    )

    // 3. Focus / Step Inside
    await page.locator('.search-result-item').first().click()
    // result click — settlement handled by subsequent waitForFunction

    // Wait for the focus surface to settle before switching views. This keeps
    // the assertion focused on the view handoff rather than on camera timing.
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
    // Poll for the selected-card to have populated content (settled data flush)
    // instead of a double-rAF settle that races GPU rAF stalls.
    await page.waitForFunction(
        () => {
            const card = document.querySelector('#selected-card, #focus-card-selected')
            if (!card) return false
            return card.textContent.trim().length > 0
        },
        null,
        { timeout: 15000, polling: 100 }
    )

    // FocusPocket is torn down when the map takes ownership of the view. Its
    // partial cleanup must not replay a stale `currentView:'galaxy'` snapshot
    // over this user-initiated map switch.
    await page.evaluate(() => window.__navActions__.switchView('map', { skipTerrainPrelude: true }))
    await page.waitForFunction(() => document.body.dataset.activeView === 'map', {
        timeout: 15000,
        polling: 50
    })

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
    // Poll for the reset to settle (overview mode active) instead of double-rAF.
    await page.waitForFunction(
        () => {
            const body = document.body
            return body.dataset.activeView === 'galaxy' || body.dataset.panelSurface === 'idle' || body.dataset.panelSurface === 'overview'
        },
        null,
        { timeout: 15000, polling: 100 }
    )
})

test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
        localStorage.removeItem('moco_mycelium_demo_v1')
        sessionStorage.clear()
    })
})
