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
    test.setTimeout(60000)
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
    await page.goto(`${BASE_URL}${APP_PATH}?q=coffee&nodemo=1`)
    await expect(page).toHaveTitle(/Semantic Explorer|MoCo Business Mycelium/)
    await page.waitForSelector('#search-input', { state: 'visible', timeout: 15000 })
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {})

    // 2. Perform Search
    // BLOCKER (pre-existing, 2026-08-03): deep-link ?q=coffee does not hydrate the
    // search input or run a search in the dist app (probe: searchStatus stays idle,
    // zero api.php requests, 8406-point dataset loads fine — evidence in
    // tmp/probe-search-output.txt, reproducible at HEAD with search files stashed).
    // The fill() below re-triggers search, but the result pipeline still needs the
    // deep-link/search boot defect fixed before this step can pass.
    const searchInput = page.locator('#search-input')
    await searchInput.focus()
    await searchInput.fill('coffee')
    await page.waitForSelector('.search-result-item', { state: 'visible', timeout: 15000 })
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {})

    // 3. Focus / Step Inside
    await page.locator('.search-result-item').first().click()
    // result click — settlement handled by subsequent waitForFunction

    // 4. Switch to Map Mode
    // Repaired 2026-08-03: the original drove the dead legacy #btn-map overlay
    // button (zero render sites since the controls overlay was retired;
    // f0bceb84 removed the bindings). Drive the real switchView function via
    // the Playwright test-globals hook and assert the parity dataset, matching
    // the switchview-race repair.
    await page.evaluate(() => window.__navActions__?.switchView('map'))
    await page.waitForFunction(() => document.body.dataset.activeView === 'map', { timeout: 15000, polling: 50 })

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
