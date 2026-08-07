/**
 * Filter + search chrome contract — verifies the Svelte-rendered chrome
 * preserves the IDs/classes/data-attrs the rest of the app keys off, and
 * that basic user interactions (chip click, input typing, clear button)
 * still drive the same observable state changes as the previous vanilla-DOM
 * bindings.
 */

import { test, expect } from '@playwright/test'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '')
const APP_PATH = process.env.TEST_APP_PATH || '/index.html'

const SEMANTIC_HEALTH_STUB = {
    ok: true,
    state: 'healthy',
    provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
}

test('Filter + search chrome (Svelte) preserves the DOM contract and basic interactions', async ({ page }) => {
    test.setTimeout(60000)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.addInitScript(() => {
        window.__PLAYWRIGHT__ = true
    })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.route('**/api.php?action=semantic_lane_health**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(SEMANTIC_HEALTH_STUB)
        })
    })
    await page.route('**/api.php?action=semantic_search**', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, count: 0, results: [] })
        })
    })

    await page.goto(`${BASE_URL}${APP_PATH}?nodemo=1&view=galaxy`)
    await page.waitForSelector('#search-input', { state: 'visible', timeout: 15000 })
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {})

    // The filters section is a <details> collapsed by default and hidden via
    // body[data-graph-context] CSS rules. Open it the same way the QA
    // contract does so the chips are interactable on mobile.
    await page.evaluate(() => {
        const section = document.querySelector('#filters-section')
        if (section && typeof section.open === 'boolean') section.open = true
        document.body.dataset.graphContext = 'filters-open'
    })
    // state mutation applied synchronously

    // The Svelte islands should have rendered inside the static mount slots.
    // The QA contract's selectors all live inside the chrome, so finding them
    // proves the Svelte templates ran end-to-end.
    await expect(page.locator('.search-label')).toHaveCount(1)
    await expect(page.locator('#search-input')).toHaveCount(1)
    await expect(page.locator('#search-clear-btn')).toHaveCount(1)
    await expect(page.locator('#search-spinner')).toHaveCount(1)

    await expect(page.locator('#filters-section #city-filter')).toHaveCount(1)
    await expect(page.locator('[data-status-filter="all"]')).toHaveCount(1)
    await expect(page.locator('[data-status-filter="active"]')).toHaveCount(1)
    await expect(page.locator('[data-signal-filter="website"]')).toHaveCount(1)
    await expect(page.locator('[data-signal-filter="email"]')).toHaveCount(1)
    await expect(page.locator('#filter-clear-btn')).toHaveCount(1)

    // Status filter click should flip aria-pressed and reflect the active class.
    const allChip = page.locator('[data-status-filter="all"]')
    const activeChip = page.locator('[data-status-filter="active"]')
    await expect(allChip).toHaveAttribute('aria-pressed', 'true')
    await expect(activeChip).toHaveAttribute('aria-pressed', 'false')
    await activeChip.click()
    await expect(activeChip).toHaveAttribute('aria-pressed', 'true')
    await expect(allChip).toHaveAttribute('aria-pressed', 'false')
    await allChip.click()
    await expect(allChip).toHaveAttribute('aria-pressed', 'true')
    await expect(activeChip).toHaveAttribute('aria-pressed', 'false')

    // Signal toggle should be independent of status.
    const websiteChip = page.locator('[data-signal-filter="website"]')
    await expect(websiteChip).toHaveAttribute('aria-pressed', 'false')
    await websiteChip.click()
    await expect(websiteChip).toHaveAttribute('aria-pressed', 'true')
    // Clear button should enable when any filter is on.
    await expect(page.locator('#filter-clear-btn')).toBeEnabled()
    await page.locator('#filter-clear-btn').click()
    await expect(websiteChip).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('#filter-clear-btn')).toBeDisabled()

    // Close the filter sheet before exercising search chrome. Its scrim is
    // intentionally modal and must not intercept the next workflow.
    await page.locator('#filters-section > summary').click()
    await expect(page.locator('#filters-section')).not.toHaveAttribute('open')

    // Typing in the search input should add the has-query class on
    // .search-container (driven by the Svelte effect, not the old imperative
    // classList.toggle).
    const searchInput = page.locator('#search-input')
    await searchInput.fill('coffee')
    await expect(page.locator('.search-container')).toHaveClass(/has-query/)
    await expect(searchInput).toHaveValue('coffee')

    // The clear button should blank the input and remove has-query.
    await page.locator('#search-clear-btn').click()
    await expect(searchInput).toHaveValue('')
    await expect(page.locator('.search-container')).not.toHaveClass(/has-query/)
    // After clearing, the input should regain focus.
    await expect(searchInput).toBeFocused()

    // At the narrowest supported phone width the empty label row collapses,
    // but the same element must remain the results-sheet toggle once a query
    // exists. This guards the cascade against strands.css re-showing the idle
    // row or the responsive hide removing the active toggle.
    await page.setViewportSize({ width: 320, height: 740 })
    await page.reload()
    await page.waitForSelector('#search-input', { state: 'visible', timeout: 15000 })
    const narrowLabel = page.locator('.search-label')
    await expect(narrowLabel).toBeHidden()

    const narrowInput = page.locator('#search-input')
    await narrowInput.fill('coffee')
    await expect(page.locator('.search-container')).toHaveClass(/has-query/)
    await expect(narrowLabel).toBeVisible()
    await expect(narrowLabel).toHaveAttribute('aria-controls', 'search-results')
})
