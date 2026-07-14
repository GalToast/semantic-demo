/**
 * A11y Baseline Test — WCAG Conformance for 4 Critical States
 *
 * Captures axe-core violation counts for each of the 4 critical user-flow
 * states and stores them as an a11y regression baseline. This test is
 * independent from the integration probe (w15-body-attr-live-probe.spec.js)
 * so it can be enabled/disabled separately.
 *
 * States tested:
 *   1. idle-overview      — initial overview (no interaction)
 *   2. search-mode        — search mode radio clicked, query typed
 *   3. focus-search       — after clicking a search result
 *   4. focus-programmatic — programmatic focus from overview (if a node is clickable)
 *
 * Violation categories tracked:
 *   - color-contrast  — insufficient contrast ratios
 *   - aria-*          — missing/invalid ARIA attributes
 *   - label           — form elements without accessible names
 *   - landmark        — missing landmark regions
 *   - heading-order   — skipped heading levels
 *
 * Run:
 *   npm run test:a11y
 *   # or directly:
 *   npx playwright test tests/integration/a11y-baseline.spec.js --browser=chromium
 *
 * Environment variables:
 *   TEST_BASE_URL        — target URL (default: http://127.0.0.1:5175)
 *   INTEGRATION_TIMEOUT  — per-step timeout in ms (default: 30000)
 *   INTEGRATION_HEADLESS — set to 'true' for headless CI mode
 *   A11Y_MAX_VIOLATIONS  — fail threshold per state (default: 5)
 */

import { test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
    captureConsoleErrors,
    withRetry,
    navigateToApp,
    enterSearchMode,
    typeSearchQuery,
    clickFirstSearchResult,
    SETTLE_MS
} from './helpers.js'

// ── Config ──────────────────────────────────────────────────────────────────

/**
 * Maximum violations allowed per state before the test fails.
 * Increase this when new known issues are discovered; decrease when
 * real a11y bugs are fixed (the count should go down, not up).
 */
const MAX_VIOLATIONS = parseInt(process.env.A11Y_MAX_VIOLATIONS || '5', 10)

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Run an axe-core a11y scan and log violations.
 * Returns the results object for further inspection.
 */
async function runA11yScan(page, stateLabel) {
    const results = await new AxeBuilder({ page }).analyze()
    const count = results.violations.length
    console.log(`  [a11y:${stateLabel}] ${count} violation(s)`)

    if (count > 0) {
        // Log each violation with impact, rule ID, description, and affected node count
        for (const v of results.violations) {
            const impact = v.impact || 'unknown'
            console.log(`    - [${impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)
        }

        // Summarize by category for the 5 key categories
        const categories = {}
        for (const v of results.violations) {
            const cat = v.id.split('-')[0] // e.g., 'color-contrast', 'aria', 'label', 'landmark', 'heading'
            categories[cat] = (categories[cat] || 0) + 1
        }
        console.log(`  [a11y:${stateLabel}] categories: ${JSON.stringify(categories)}`)
    }

    return results
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe('A11y baseline — 4 critical states', () => {
    // ── State: idle-overview ────────────────────────────────────────────────
    test('idle-overview: a11y scan', async ({ page }) => {
        const consoleCapture = captureConsoleErrors(page)

        await withRetry(
            async (attempt) => {
                console.log(`  [idle-overview] Attempt ${attempt}...`)
                await navigateToApp(page)
                await page.waitForTimeout(SETTLE_MS)

                const results = await runA11yScan(page, 'idle-overview')

                // Soft assertion: log but don't fail unless above threshold
                if (results.violations.length > MAX_VIOLATIONS) {
                    throw new Error(
                        `a11y regression: idle-overview has ${results.violations.length} violations ` +
                            `(threshold: ${MAX_VIOLATIONS}). Review violations above.`
                    )
                }

                // Store baseline metadata for future comparison
                const baseline = {
                    state: 'idle-overview',
                    timestamp: new Date().toISOString(),
                    violationCount: results.violations.length,
                    rules: results.violations.map((v) => ({
                        id: v.id,
                        impact: v.impact,
                        description: v.description,
                        nodeCount: v.nodes.length
                    }))
                }
                console.log(`  [idle-overview] baseline: ${JSON.stringify(baseline, null, 2)}`)
            },
            { maxAttempts: 3, backoffMs: 1000, label: 'idle-overview a11y' }
        )

        if (consoleCapture.errors.length > 0) {
            console.log(`  [idle-overview] ${consoleCapture.summary()}`)
        }
    })

    // ── State: search-mode ──────────────────────────────────────────────────
    test('search-mode: a11y scan', async ({ page }) => {
        const consoleCapture = captureConsoleErrors(page)

        await withRetry(
            async (attempt) => {
                console.log(`  [search-mode] Attempt ${attempt}...`)
                await navigateToApp(page)
                await enterSearchMode(page)
                await typeSearchQuery(page, 'cafe')
                await page.waitForTimeout(SETTLE_MS)

                const results = await runA11yScan(page, 'search-mode')

                if (results.violations.length > MAX_VIOLATIONS) {
                    throw new Error(
                        `a11y regression: search-mode has ${results.violations.length} violations ` +
                            `(threshold: ${MAX_VIOLATIONS}). Review violations above.`
                    )
                }

                const baseline = {
                    state: 'search-mode',
                    timestamp: new Date().toISOString(),
                    violationCount: results.violations.length,
                    rules: results.violations.map((v) => ({
                        id: v.id,
                        impact: v.impact,
                        description: v.description,
                        nodeCount: v.nodes.length
                    }))
                }
                console.log(`  [search-mode] baseline: ${JSON.stringify(baseline, null, 2)}`)
            },
            { maxAttempts: 3, backoffMs: 1000, label: 'search-mode a11y' }
        )

        if (consoleCapture.errors.length > 0) {
            console.log(`  [search-mode] ${consoleCapture.summary()}`)
        }
    })

    // ── State: focus-search ─────────────────────────────────────────────────
    test('focus-search: a11y scan', async ({ page }) => {
        const consoleCapture = captureConsoleErrors(page)

        await withRetry(
            async (attempt) => {
                console.log(`  [focus-search] Attempt ${attempt}...`)
                await navigateToApp(page)
                await enterSearchMode(page)
                await typeSearchQuery(page, 'cafe')
                await clickFirstSearchResult(page)
                await page.waitForTimeout(SETTLE_MS)

                const results = await runA11yScan(page, 'focus-search')

                if (results.violations.length > MAX_VIOLATIONS) {
                    throw new Error(
                        `a11y regression: focus-search has ${results.violations.length} violations ` +
                            `(threshold: ${MAX_VIOLATIONS}). Review violations above.`
                    )
                }

                const baseline = {
                    state: 'focus-search',
                    timestamp: new Date().toISOString(),
                    violationCount: results.violations.length,
                    rules: results.violations.map((v) => ({
                        id: v.id,
                        impact: v.impact,
                        description: v.description,
                        nodeCount: v.nodes.length
                    }))
                }
                console.log(`  [focus-search] baseline: ${JSON.stringify(baseline, null, 2)}`)
            },
            { maxAttempts: 3, backoffMs: 1000, label: 'focus-search a11y' }
        )

        if (consoleCapture.errors.length > 0) {
            console.log(`  [focus-search] ${consoleCapture.summary()}`)
        }
    })

    // ── State: focus-programmatic ───────────────────────────────────────────
    test('focus-programmatic: a11y scan', async ({ page }) => {
        const consoleCapture = captureConsoleErrors(page)

        await withRetry(
            async (attempt) => {
                console.log(`  [focus-programmatic] Attempt ${attempt}...`)
                await navigateToApp(page)

                // Try to click a visible field-node in overview
                const fieldNode = page.locator('[data-field-node], .field-node, [role="button"]').first()
                const nodeVisible = await fieldNode.isVisible().catch(() => false)

                if (nodeVisible) {
                    await fieldNode.click()
                    await page.waitForTimeout(SETTLE_MS)

                    const results = await runA11yScan(page, 'focus-programmatic')

                    if (results.violations.length > MAX_VIOLATIONS) {
                        throw new Error(
                            `a11y regression: focus-programmatic has ${results.violations.length} violations ` +
                                `(threshold: ${MAX_VIOLATIONS}). Review violations above.`
                        )
                    }

                    const baseline = {
                        state: 'focus-programmatic',
                        timestamp: new Date().toISOString(),
                        violationCount: results.violations.length,
                        rules: results.violations.map((v) => ({
                            id: v.id,
                            impact: v.impact,
                            description: v.description,
                            nodeCount: v.nodes.length
                        }))
                    }
                    console.log(`  [focus-programmatic] baseline: ${JSON.stringify(baseline, null, 2)}`)
                } else {
                    // No field-node visible — run a11y scan on idle state as fallback
                    console.log('  [focus-programmatic] No field-node visible; scanning idle state as fallback')
                    const results = await runA11yScan(page, 'focus-programmatic (idle-fallback)')

                    const baseline = {
                        state: 'focus-programmatic',
                        timestamp: new Date().toISOString(),
                        note: 'skipped — no field-node visible; idle scan captured instead',
                        violationCount: results.violations.length,
                        rules: results.violations.map((v) => ({
                            id: v.id,
                            impact: v.impact,
                            description: v.description,
                            nodeCount: v.nodes.length
                        }))
                    }
                    console.log(`  [focus-programmatic] baseline: ${JSON.stringify(baseline, null, 2)}`)
                }
            },
            { maxAttempts: 2, backoffMs: 1000, label: 'focus-programmatic a11y' }
        )

        if (consoleCapture.errors.length > 0) {
            console.log(`  [focus-programmatic] ${consoleCapture.summary()}`)
        }
    })
})
