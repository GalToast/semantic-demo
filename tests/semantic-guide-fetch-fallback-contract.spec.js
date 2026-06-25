/**
 * semantic-guide-fetch-fallback-contract.spec.js
 *
 * Deterministic Playwright contract test for semantic-guide.js fetch and
 * fallback behavior — mocked network responses for invalid JSON, non-ok
 * responses, timeout, and stale request cancellation.
 *
 * Run:
 *   npx playwright test tests/semantic-guide-fetch-fallback-contract.spec.js --reporter=list --headed
 */

import { test, expect } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const _ROOT = path.resolve(__dirname, '..')
const APP_URL = 'http://127.0.0.1:8795/dist/svelte/index.html?nodemo=1'

/**
 * Wait for state.points to be initialised (the app loads its trail data
 * asynchronously; we need the state machine ready before triggering
 * requestSemanticGuide).
 */
async function waitForStateReady(page) {
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
        () => {
            const s = window.__APP_STATE__ ?? window.__TEST_STATE__
            return typeof s === 'object' && Array.isArray(s.points) && s.points.length > 0
        },
        { timeout: 30000 }
    )
}

/**
 * Ensure state.focusedNode is set and a search context exists so
 * buildSemanticGuideRequestPayload() returns a non-null payload.
 */
async function prepareFocusNode(page) {
    await page.evaluate(() => {
        const appState = window.__APP_STATE__ ?? window.__TEST_STATE__
        if (appState.points && appState.points.length > 0) {
            appState.focusedNode = 0

            // Set a minimal currentSearchSummary so payload builder doesn't short-circuit
            if (!appState.currentSearchSummary) {
                appState.currentSearchSummary = {
                    query: 'test search',
                    resultIndices: [0],
                    anchorIndex: 0,
                    visibleMatches: 1
                }
            }
        }
    })
}

test.describe('semantic-guide.js fetch and fallback behavior', () => {
    test('fetch returns invalid JSON → fallback card shown', async ({ page }) => {
        test.setTimeout(60000)

        // Mock the semantic_guide endpoint to return plain text (invalid JSON)
        await page.route('**/api.php?action=semantic_guide', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'text/plain',
                body: 'not json'
            })
        })

        await waitForStateReady(page)
        await prepareFocusNode(page)

        // Trigger the semantic guide request
        await page.evaluate(() => {
            window.requestSemanticGuide()
        })

        // The summary card becomes visible with fallback content
        // Use toHaveClass(/\bhidden\b/) rather than toBeVisible() for reliable hidden-attribute check
        const summaryCardEl = page.locator('#semantic-summary-card')
        await expect(summaryCardEl).not.toHaveClass(/\bhidden\b/, { timeout: 10000 })

        // Verify fallback content is present. With a focused point and search
        // context, fallback text is generated from local result context.
        const summaryTextEl = page.locator('#summary-text')
        await expect(summaryTextEl).toContainText(/logical mapping|search opens a trail/i, { timeout: 5000 })

        // Verify laneStatus shows deterministic fallback active
        const laneStatusEl = page.locator('#summary-lane-status')
        await expect(laneStatusEl).toContainText(/deterministic fallback/i, { timeout: 5000 })

        // The story element stays hidden (hideSummaryTrailStoryNote is called on error path)
        const storyEl = page.locator('#summary-gemma-story')
        await expect(storyEl).toHaveClass(/\bhidden\b/, { timeout: 5000 })
    })

    test('fetch succeeds with valid JSON but ok:false → fallback card shown', async ({ page }) => {
        test.setTimeout(60000)

        // Mock the semantic_guide endpoint to return a non-ok JSON response
        // Use **/api.php** pattern to ensure match regardless of query string encoding
        await page.route('**/api.php**', async (route) => {
            const url = route.request().url()
            if (!url.includes('semantic_guide')) return route.continue()
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: false, error: 'Service unavailable' })
            })
        })

        await waitForStateReady(page)
        await prepareFocusNode(page)

        // Trigger the semantic guide request
        await page.evaluate(() => {
            window.requestSemanticGuide()
        })

        // The summary card becomes visible with fallback content
        const summaryCardEl = page.locator('#semantic-summary-card')
        await expect(summaryCardEl).not.toHaveClass(/\bhidden\b/, { timeout: 10000 })

        // Verify fallback content generated from local payload context.
        const summaryTextEl = page.locator('#summary-text')
        await expect(summaryTextEl).toContainText(/logical mapping|search opens a trail/i, { timeout: 5000 })

        // Lane status confirms deterministic fallback
        const laneStatusEl = page.locator('#summary-lane-status')
        await expect(laneStatusEl).toContainText(/deterministic fallback/i, { timeout: 5000 })

        // Story element stays hidden (hideSummaryTrailStoryNote called on error path)
        const storyEl = page.locator('#summary-gemma-story')
        await expect(storyEl).toHaveClass(/\bhidden\b/, { timeout: 5000 })
    })

    test('fetch times out → fallback card shown', async ({ page }) => {
        test.setTimeout(30000)

        // Inject a short timeout so the test completes in ~600ms instead of 30s.
        // The route abort fires just after the 500ms injected timeout, triggering
        // the timedOut path in fetchSemanticGuide → showSemanticGuideFailure.
        await page.route('**/api.php**', async (route) => {
            const url = route.request().url()
            if (!url.includes('semantic_guide')) return route.continue()
            // Wait one tick past the 500ms injected timeout before aborting.
            await new Promise((resolve) => setTimeout(resolve, 600))
            await route.abort('timedout')
        })

        await waitForStateReady(page)
        await prepareFocusNode(page)

        // Set the short timeout and trigger the request in the same evaluate call
        // so the window property is set before fetchSemanticGuide reads it.
        await page.evaluate(() => {
            window.__SEMANTIC_GUIDE_TIMEOUT_MS__ = 500
            window.requestSemanticGuide()
        })

        // The summary card becomes visible with fallback content after the short timeout.
        const summaryCardEl = page.locator('#semantic-summary-card')
        await expect(summaryCardEl).not.toHaveClass(/\bhidden\b/, { timeout: 3000 })

        // Verify laneStatus confirms deterministic fallback.
        const laneStatusEl = page.locator('#summary-lane-status')
        await expect(laneStatusEl).toContainText(/deterministic fallback/i, { timeout: 3000 })

        // Verify the summary text shows fallback content.
        const summaryTextEl = page.locator('#summary-text')
        await expect(summaryTextEl).toContainText(/logical mapping|search opens a trail/i, { timeout: 3000 })

        // Story element stays hidden on timeout (hideSummaryTrailStoryNote called).
        const storyEl = page.locator('#summary-gemma-story')
        await expect(storyEl).toHaveClass(/\bhidden\b/, { timeout: 3000 })
    })

    test('stale request cancellation (request superseded by new request)', async ({ page }) => {
        test.setTimeout(90000)

        // Mock the semantic_guide endpoint to delay response by 3 seconds
        // Use **/api.php** pattern to ensure match regardless of query string encoding
        await page.route('**/api.php**', async (route) => {
            const url = route.request().url()
            if (!url.includes('semantic_guide')) return route.continue()
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, guide: { title: 'Delayed Response' } }),
                delay: 3000
            })
        })

        await waitForStateReady(page)
        await prepareFocusNode(page)

        // Call requestSemanticGuide() twice in immediate succession:
        // - First call starts request A
        // - Second call aborts request A and starts request B
        // The mock will respond to request B (request A's fetch was aborted before it reached the mock)
        await page.evaluate(() => {
            window.requestSemanticGuide()
        })

        // Immediately call again — this aborts the first request's controller
        await page.evaluate(() => {
            window.requestSemanticGuide()
        })

        // Wait for the card to leave the synthesizing/loading state
        // (the mock responds after 3s to request B, so card should update within ~5s)
        await page.waitForFunction(
            () => {
                const card = document.getElementById('semantic-summary-card')
                if (!card) return false
                // Card is no longer in synthesizing state means the callback ran
                return !card.classList.contains('is-synthesizing')
            },
            { timeout: 15000 }
        )

        // Verify the card is not stuck in loading state — it should have processed request B
        const summaryCardEl = page.locator('#semantic-summary-card')
        const isSynthesizing = await summaryCardEl.evaluate((el) => el.classList.contains('is-synthesizing'))
        expect(isSynthesizing).toBe(false)

        // Verify the card has visible content (either success or fallback) — not empty
        const summaryTextEl = page.locator('#summary-text')
        const textContent = await summaryTextEl.textContent()
        expect(textContent.trim().length).toBeGreaterThan(0)
    })
})
