/**
 * Filter + search chrome contract — verifies the Svelte-rendered chrome
 * preserves the IDs/classes/data-attrs the rest of the app keys off, and
 * that basic user interactions (chip click, input typing, clear button)
 * still drive the same observable state changes as the previous vanilla-DOM
 * bindings.
 */

import { test, expect } from '@playwright/test'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '')
const APP_PATH = process.env.TEST_APP_PATH || '/dist/svelte/index.html'

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
        // This journey verifies the Svelte chrome, not Three.js. Keep the
        // webgl render class so the search row is mounted, but make the
        // renderer capability probe fail fast so 8,406 points cannot starve
        // the control assertions. Dedicated 3D suites cover the real engine.
        const nativeGetContext = HTMLCanvasElement.prototype.getContext
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (type === 'webgl' || type === 'webgl2') return null
            return nativeGetContext.call(this, type, ...args)
        }
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

    // This journey exercises the Svelte chrome at every tested viewport. The
    // responsive renderer otherwise selects the mobile placeholder at 320px,
    // which intentionally hides the idle info panel and its search input.
    await page.goto(`${BASE_URL}${APP_PATH}?nodemo=1&webgl=1&view=galaxy`)
    await page.waitForSelector('#search-input', { state: 'visible', timeout: 15000 })
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {})
    // Do not begin the filter journey while the 8,406-record hydration is
    // still replacing the city options. That reflow makes a fixed mobile
    // sheet an unreliable actionability target.
    await page.waitForFunction(() => document.querySelectorAll('#city-filter option').length > 1, null, {
        timeout: 15000
    })

    // Open the component through its real summary control. Filters.svelte
    // owns the <details> open state, so mutating the native property directly
    // races its controlled Svelte binding.
    await page.locator('#filters-section > summary').click()
    await expect(page.locator('#filters-section')).toHaveAttribute('open', '')

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

    // The chip is already visible inside the fixed sheet. Use the pointer
    // coordinates directly so Playwright does not try to scroll the fixed
    // <details> ancestor before dispatching the real browser click.
    const clickVisibleChip = async (locator) => {
        const box = await locator.boundingBox()
        expect(box).not.toBeNull()
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    }

    // Status filter click should flip aria-pressed and reflect the active class.
    const allChip = page.locator('[data-status-filter="all"]')
    const activeChip = page.locator('[data-status-filter="active"]')
    await expect(allChip).toHaveAttribute('aria-pressed', 'true')
    await expect(activeChip).toHaveAttribute('aria-pressed', 'false')
    await clickVisibleChip(activeChip)
    await expect(activeChip).toHaveAttribute('aria-pressed', 'true')
    await expect(allChip).toHaveAttribute('aria-pressed', 'false')
    await clickVisibleChip(allChip)
    await expect(allChip).toHaveAttribute('aria-pressed', 'true')
    await expect(activeChip).toHaveAttribute('aria-pressed', 'false')

    // Signal toggle should be independent of status.
    const websiteChip = page.locator('[data-signal-filter="website"]')
    await expect(websiteChip).toHaveAttribute('aria-pressed', 'false')
    await clickVisibleChip(websiteChip)
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
    // Use a query absent from the local fallback index so this chrome-only
    // journey does not auto-focus a single result and unmount the search row
    // before the clear-button assertion runs.
    await searchInput.fill('semantic-explorer-no-match')
    await expect(page.locator('.search-container')).toHaveClass(/has-query/)
    await expect(searchInput).toHaveValue('semantic-explorer-no-match')

    // The clear button should blank the input and remove has-query.
    // The header strip can cover this affordance during the search-surface
    // transition. Direct element.click() is the established coverage path
    // for this remounting control and still invokes the Svelte handler.
    await page.locator('#search-clear-btn').evaluate((button) => button.click())
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
    await narrowInput.fill('semantic-explorer-no-match')
    await expect(page.locator('.search-container')).toHaveClass(/has-query/)
    await expect(narrowLabel).toBeVisible()
    await expect(narrowLabel).toHaveAttribute('aria-controls', 'search-results')
})
