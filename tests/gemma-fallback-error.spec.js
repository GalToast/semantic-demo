/**
 * tests/gemma-fallback-error.spec.js
 *
 * Deterministic Playwright contract test verifying the fallback behavior
 * of the semantic guide synthesis when api.php?action=semantic_guide fails.
 *
 * Run:
 *   npx playwright test tests/gemma-fallback-error.spec.js --browser=chromium --headed
 */

import { test, expect } from '@playwright/test'

const EXPLICIT_BASE_URL =
    process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.BASE_URL || ''
const APP_PATH = '/dist/svelte/index.html?nodemo=1'

async function resolveAppUrl() {
    if (EXPLICIT_BASE_URL) return `${EXPLICIT_BASE_URL.replace(/\/$/, '')}${APP_PATH}`

    for (let port = 8795; port <= 8895; port += 1) {
        const candidate = `http://127.0.0.1:${port}${APP_PATH}`
        try {
            const response = await fetch(candidate)
            if (response.ok && !(await response.text()).includes('Not found:')) return candidate
        } catch {
            // Try the next local contract/dev-server port.
        }
    }

    return `http://127.0.0.1:8795${APP_PATH}`
}

async function waitForStateReady(page) {
    const appUrl = await resolveAppUrl()
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
    // The Svelte shell publishes testReady eagerly, while app data may populate
    // asynchronously. Individual tests seed deterministic records when needed.
    await page.waitForFunction(
        () => {
            return (
                document.body?.dataset?.testReady === 'true' &&
                typeof (window.__APP_STATE__ ?? window.__TEST_STATE__) === 'object'
            )
        },
        { timeout: 60000 }
    )
}

async function seedSearchGuideState(page) {
    return page.evaluate(() => {
        const s = window.__APP_STATE__ ?? window.__TEST_STATE__
        const mutate = window.withStateMutation ?? s?.withMutation ?? ((fn) => fn())

        return mutate(() => {
            s.points = Array.from({ length: 4 }, (_, index) => ({
                lead_id: `test_${index}`,
                name: `Coffee Test ${index}`,
                city: index % 2 === 0 ? 'Conroe' : 'The Woodlands',
                category: 'Coffee',
                cluster_label: 'Coffee',
                status: 'active'
            }))

            s.searchState.currentSearchSummary = {
                query: 'coffee',
                anchorIndex: 0,
                resultIndices: [0, 1, 2, 3]
            }
            s.currentView = 'galaxy'
            return s.points[0]?.name || ''
        })
    })
}

test.describe('Semantic Guide Error Fallback (Gemma Fallback)', () => {
    test('500 response on action=semantic_guide triggers deterministic fallback path and populates elements', async ({
        page
    }) => {
        test.setTimeout(120000)

        // Mock **/api.php?action=semantic_guide to return a 500 status
        await page.route('**/api.php?action=semantic_guide', async (route) => {
            await route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ ok: false, error: 'Internal Server Error' })
            })
        })
        await page.route('**/api.php?action=semantic_lane_health**', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, status: 'healthy' })
            })
        })

        await waitForStateReady(page)

        // Setup state so buildSemanticGuideRequestPayload returns a valid payload
        const anchorName = await seedSearchGuideState(page)

        expect(anchorName).not.toBe('')

        // Trigger through the bound button; use DOM click so visibility does not matter.
        await page.evaluate(async () => {
            const s = window.__APP_STATE__ ?? window.__TEST_STATE__
            const mutate = window.withStateMutation ?? s?.withMutation ?? ((fn) => fn())

            mutate(() => {
                s.points = Array.from({ length: 4 }, (_, index) => ({
                    lead_id: `test_${index}`,
                    name: `Coffee Test ${index}`,
                    city: index % 2 === 0 ? 'Conroe' : 'The Woodlands',
                    category: 'Coffee',
                    cluster_label: 'Coffee',
                    status: 'active'
                }))
                s.searchState.currentSearchSummary = {
                    query: 'coffee',
                    anchorIndex: 0,
                    resultIndices: [0, 1, 2, 3]
                }
                s.currentView = 'galaxy'
            })
            const trigger = document.getElementById('synthesize-trigger')
            if (trigger) {
                trigger.hidden = false
                trigger.classList.remove('hidden')
                trigger.style.display = 'block'
            }
            const button = document.getElementById('btn-synthesize')
            if (button) button.disabled = false
            button?.click()
        })

        // Small delay to allow async fetch to reject and DOM to update
        await page
            .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 })
            .catch(() => {})

        // Assertions:
        // 1. #semantic-summary-card has .is-synthesizing removed and is not .hidden
        const cardEl = page.locator('#semantic-summary-card')
        await expect(cardEl).not.toHaveClass(/\bhidden\b/, { timeout: 10000 })
        await expect(cardEl).not.toHaveClass(/\bis-synthesizing\b/, { timeout: 10000 })

        // 2. #summary-card-title-text matches client-side fallback value (uppercase with anchors this trail)
        const titleEl = page.locator('#summary-card-title-text')
        const expectedTitle = `${anchorName} anchors this trail`.toUpperCase()
        await expect(titleEl).toHaveText(expectedTitle, { timeout: 10000 })

        // 3. #summary-text is populated by the fallback summary generator
        const textEl = page.locator('#summary-text')
        await expect(textEl).toContainText(/Logical mapping of 4 matches for "coffee"/i, { timeout: 10000 })

        // 4. #summary-suggestions has populated suggestion buttons with correct data attributes
        const suggestionsEl = page.locator('#summary-suggestions')
        const buttons = suggestionsEl.locator('button.suggestion-btn')
        await expect(buttons).toHaveCount(3, { timeout: 10000 })

        // Verify data-lead-id attributes exist and stay stable enough for click routing.
        const leadIds = new Set()
        for (let i = 0; i < 3; i++) {
            const button = buttons.nth(i)
            const dataLeadId = await button.getAttribute('data-lead-id')
            expect(dataLeadId).toBeTruthy()
            leadIds.add(dataLeadId)
        }
        expect(leadIds.size).toBe(3)

        // 5. #summary-lane-status has 'Deterministic fallback active'
        const statusEl = page.locator('#summary-lane-status')
        await expect(statusEl).toHaveText('Deterministic fallback active', { timeout: 10000 })
    })
})
