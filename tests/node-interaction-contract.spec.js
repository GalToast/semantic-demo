/**
 * node-interaction-contract.spec.js
 *
 * Contract test proving that clicking a search result item transitions the app
 * into a focused search route with the expected state and body surface.
 *
 * Run through the manifest runner or directly:
 *   node tests/run-all-contracts.js --group=scene
 *   npx playwright test tests/node-interaction-contract.spec.js --browser=chromium --workers=1 --headed
 */

import { test, expect } from '@playwright/test'
import { snapshot, stateField } from './helpers/state-harness.js'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '')

const SEMANTIC_HEALTH_STUB = {
    ok: true,
    state: 'healthy',
    provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
}

const SEARCH_STUB = {
    ok: true,
    count: 3,
    results: [
        { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
        { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
        { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' }
    ]
}

async function setupMockSearch(page) {
    await page.route('**/api.php?action=semantic_lane_health**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) })
    )
    await page.route('**/api.php?action=semantic_search**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB) })
    )
}

async function openApp(page) {
    await setupMockSearch(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE_URL}/index.html?view=galaxy`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => typeof window.__navActions__?.search === 'function', { timeout: 20000 })
    await expect
        .poll(
            async () => {
                const points = await stateField(page, 'points')
                return Array.isArray(points) ? points.length : -1
            },
            { timeout: 20000 }
        )
        .toBeGreaterThan(0)
    await page.waitForFunction(
        () => {
            const overlay = document.getElementById('loading-overlay')
            if (!overlay) return true
            const styles = getComputedStyle(overlay)
            return (
                overlay.classList.contains('hidden') ||
                styles.display === 'none' ||
                styles.visibility === 'hidden' ||
                styles.pointerEvents === 'none'
            )
        },
        { timeout: 20000 }
    )
    // preceding waitForFunction handles settlement
}

test.describe('node interaction: search result focus transition', () => {
    test('clicking a search result enters focused search route state', async ({ page }) => {
        test.setTimeout(60000)

        await openApp(page)

        const input = page.locator('#search-input')
        await input.focus()
        await input.fill('coffee')
        await page.evaluate(async () => {
            const el = document.getElementById('search-input')
            if (!el) return
            el.value = 'coffee'
            el.dispatchEvent(new Event('input', { bubbles: true }))
            const fn = window.__navActions__?.search
            if (typeof fn === 'function') {
                await fn('coffee', { preferCachedResults: false })
            }
        })
        await expect(page.locator('.search-result-item').first()).toBeVisible({ timeout: 15000 })

        await page.locator('.search-result-item').first().click()
        await expect.poll(async () => stateField(page, 'focusedNode'), { timeout: 15000 }).not.toBeNull()

        const result = await snapshot(page, ['focusedNode', 'navState.mode'])
        const panelSurface = await page.evaluate(() => document.body.dataset.panelSurface || '')

        expect(result.focusedNode, 'focusedNode is set after result click').not.toBeNull()
        expect(['focus', 'focus-search'], 'body dataset panel surface').toContain(panelSurface)
        expect(['focus', 'trail'], 'navState mode').toContain(result['navState.mode'])
    })
})
