import { test, expect } from '@playwright/test'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8796').replace(/\/$/, '')
const APP_PATH = process.env.TEST_APP_PATH || '/dist/svelte/index.html'

const SEARCH_STUB = {
    ok: true,
    count: 1,
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
            semantic_score: 0.99
        }
    ]
}

test('deep-link query hydrates and runs search without a second input event', async ({ page }) => {
    test.setTimeout(60000)
    let searchRequests = 0

    await page.route(
        (url) => {
            const parsed = new URL(url)
            return parsed.pathname.endsWith('/api.php') && parsed.searchParams.get('action') === 'semantic_search'
        },
        async (route) => {
            searchRequests += 1
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(SEARCH_STUB)
            })
        }
    )
    await page.route(
        (url) => {
            const parsed = new URL(url)
            return parsed.pathname.endsWith('/api.php') && parsed.searchParams.get('action') === 'semantic_lane_health'
        },
        async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, state: 'healthy' })
            })
        }
    )

    await page.goto(`${BASE_URL}${APP_PATH}?q=coffee&nodemo=1`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveTitle(/Semantic Explorer|MoCo Business Mycelium/)

    const searchInput = page.locator('#search-input')
    await expect(searchInput).toBeVisible({ timeout: 15000 })
    await expect(searchInput).toHaveValue('coffee', { timeout: 15000 })
    await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 30000 })

    expect(searchRequests, 'deep-link restore must dispatch the semantic search request').toBeGreaterThan(0)
    // The restore (or the onMount ?q= path, whichever wins the isNew race) must
    // own the search exactly once — a second dispatch after release() would
    // mean the lease/dedup change regressed into a double API round-trip.
    expect(searchRequests, 'same-query dedup must prevent a second semantic search request').toBe(1)
    await expect(page.locator('.search-result-item')).toHaveCount(1)
})

test.afterEach(async ({ page }) => {
    await page.evaluate(() => {
        localStorage.removeItem('moco_mycelium_demo_v1')
        sessionStorage.clear()
    })
})
