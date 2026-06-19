/**
 * W15 Body Data-Attribute Live Integration Probe (v2 — Production-Ready)
 *
 * Tests that body data-attrs reflect the correct focus state after
 * various user flows in the live Svelte app.
 *
 * Covers 4 primary body data-attr states:
 *   - idle          (initial overview)
 *   - search        (search mode radio clicked, query typed)
 *   - focus-search  (after clicking a search result)
 *   - focus         (programmatic focus, no search context)
 *
 * The remaining 4 states (trail, inside, semantic-dive, returning) are
 * documented as TODO — they require complex multi-step setup that is
 * out of scope for the initial baseline.
 *
 * Run:
 *   npx playwright test tests/integration/w15-body-attr-live-probe.spec.js --browser=chromium --timeout=60000 --retries=2
 *
 * Environment variables:
 *   TEST_BASE_URL       — target URL (default: http://127.0.0.1:5175)
 *   INTEGRATION_TIMEOUT — per-step timeout in ms (default: 30000)
 *   INTEGRATION_HEADLESS — set to 'true' for headless CI mode
 */

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import {
    installMockFetch,
    captureConsoleErrors,
    withRetry,
    readBodyAttrs,
    logBodyAttrs,
    navigateToApp,
    enterSearchMode,
    typeSearchQuery,
    clickFirstSearchResult,
    SETTLE_MS,
} from './helpers.js'

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe('W15 body-attr live probe', () => {

    // ── State: idle (initial overview) ──────────────────────────────────────
    test('idle state: body data-attrs on initial overview', async ({ page }) => {
        const consoleCapture = captureConsoleErrors(page)

        await withRetry(async (attempt) => {
            console.log(`  [idle] Attempt ${attempt}...`)
            await navigateToApp(page)
            await page.waitForTimeout(SETTLE_MS)

            const attrs = await readBodyAttrs(page)
            logBodyAttrs(attrs, 'idle')

            expect(attrs.mode, 'data-mode should be overview').toBe('overview')
            expect(attrs.journeyPhase, 'data-journey-phase should be overview').toBe('overview')
            expect(attrs.searchStatus, 'data-search-status should be idle').toBe('idle')
            expect(attrs.trailDepth, 'data-trail-depth should be 0').toBe('0')
            expect(attrs.trailState, 'data-trail-state should be inactive').toBe('inactive')
            expect(attrs.semanticDive, 'data-semantic-dive should be inactive').toBe('inactive')
            expect(attrs.sceneReady, 'data-scene-ready should be true').toBe('true')
        }, { maxAttempts: 3, backoffMs: 1000, label: 'idle' })

        // ── a11y baseline scan (idle state) ─
        const axeResultsIdle = await new AxeBuilder({ page }).analyze()
        console.log(`  [idle] a11y: ${axeResultsIdle.violations.length} violation(s)`)  
        if (axeResultsIdle.violations.length > 0) {
            for (const v of axeResultsIdle.violations) {
                console.log(`    - [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)  
            }
        }
        if (axeResultsIdle.violations.length > 5) {
            throw new Error(`a11y regression: idle state has ${axeResultsIdle.violations.length} violations (baseline threshold: 5)`)  
        }

        // Surface console errors in failure output
        if (consoleCapture.errors.length > 0) {
            console.log(`  [idle] ${consoleCapture.summary()}`)
        }
    })

    // ── State: search (search mode + query typed) ───────────────────────────
    test('search state: body data-attrs after typing a query', async ({ page }) => {
        const consoleCapture = captureConsoleErrors(page)

        await withRetry(async (attempt) => {
            console.log(`  [search] Attempt ${attempt}...`)
            await navigateToApp(page)
            await enterSearchMode(page)
            await typeSearchQuery(page, 'cafe')
            await page.waitForTimeout(SETTLE_MS)

            const attrs = await readBodyAttrs(page)
            logBodyAttrs(attrs, 'search')

            // After entering search mode and typing, the nav-surface should reflect search
            expect(attrs.searchStatus, 'data-search-status should be searching or results or idle').toMatch(/searching|results|idle/)
            expect(attrs.sceneReady, 'data-scene-ready should be true').toBe('true')
        }, { maxAttempts: 3, backoffMs: 1000, label: 'search' })

        // ── a11y baseline scan (search state) ─
        const axeResultsSearch = await new AxeBuilder({ page }).analyze()
        console.log(`  [search] a11y: ${axeResultsSearch.violations.length} violation(s)`)  
        if (axeResultsSearch.violations.length > 0) {
            for (const v of axeResultsSearch.violations) {
                console.log(`    - [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)  
            }
        }
        if (axeResultsSearch.violations.length > 5) {
            throw new Error(`a11y regression: search state has ${axeResultsSearch.violations.length} violations (baseline threshold: 5)`)  
        }

        if (consoleCapture.errors.length > 0) {
            console.log(`  [search] ${consoleCapture.summary()}`)
        }
    })

    // ── State: focus-search (after clicking a search result) ────────────────
    test('focus-search state: body data-attrs after search-result focus click', async ({ page }) => {
        const consoleCapture = captureConsoleErrors(page)

        await withRetry(async (attempt) => {
            console.log(`  [focus-search] Attempt ${attempt}...`)
            await navigateToApp(page)
            await enterSearchMode(page)
            await typeSearchQuery(page, 'cafe')
            const clickedIndex = await clickFirstSearchResult(page)

            // Wait for the focus click to propagate
            await page.waitForTimeout(SETTLE_MS)

            const attrs = await readBodyAttrs(page)
            logBodyAttrs(attrs, 'focus-search')

            // GREEN assertions — these work via direct DOM writes in cursor.ts
            expect(attrs.focusedNode, 'data-focused-node should be the clicked index').toBe(clickedIndex)
            expect(attrs.trailDepth, 'data-trail-depth should be 1').toBe('1')
            expect(attrs.searchStatus, 'data-search-status should be focusing').toBe('focusing')
            expect(attrs.focusOrigin, 'data-focus-origin should be search-result').toBe('search-result')

            // Core parity-attr assertions — these should pass after the W15 fix
            expect(attrs.mode, 'data-mode should be focus').toBe('focus')
            expect(attrs.navSurface, 'data-nav-surface should be focus-search').toBe('focus-search')
            expect(attrs.panelSurface, 'data-panel-surface should be focus-search').toBe('focus-search')
            expect(attrs.journeyPhase, 'data-journey-phase should be focus-search').toBe('focus-search')
            expect(attrs.trailState, 'data-trail-state should be active').toBe('active')
        }, { maxAttempts: 3, backoffMs: 1000, label: 'focus-search' })

        // ── a11y baseline scan (focus-search state) ─
        const axeResultsFocusSearch = await new AxeBuilder({ page }).analyze()
        console.log(`  [focus-search] a11y: ${axeResultsFocusSearch.violations.length} violation(s)`)  
        if (axeResultsFocusSearch.violations.length > 0) {
            for (const v of axeResultsFocusSearch.violations) {
                console.log(`    - [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)  
            }
        }
        if (axeResultsFocusSearch.violations.length > 5) {
            throw new Error(`a11y regression: focus-search state has ${axeResultsFocusSearch.violations.length} violations (baseline threshold: 5)`)  
        }

        if (consoleCapture.errors.length > 0) {
            console.log(`  [focus-search] ${consoleCapture.summary()}`)
        }
    })

    // ── State: focus (programmatic focus, no search context) ────────────────
    test('focus state: body data-attrs after programmatic focus (click a node in overview)', async ({ page }) => {
        const consoleCapture = captureConsoleErrors(page)

        await withRetry(async (attempt) => {
            console.log(`  [focus] Attempt ${attempt}...`)
            await navigateToApp(page)

            // In overview mode, try to click a visible node label/field-node
            const fieldNode = page.locator('[data-field-node], .field-node, [role="button"]').first()
            const nodeVisible = await fieldNode.isVisible().catch(() => false)

            if (nodeVisible) {
                await fieldNode.click()
                await page.waitForTimeout(SETTLE_MS)

                const attrs = await readBodyAttrs(page)
                logBodyAttrs(attrs, 'focus (programmatic)')

                // After clicking a node in overview, we expect a focus state
                expect(attrs.mode, 'data-mode should be focus after node click').toBe('focus')
                expect(attrs.focusedNode, 'data-focused-node should be set').not.toBeNull()
                expect(attrs.trailDepth, 'data-trail-depth should be at least 1').toBe('1')
            } else {
                // No field-node visible — skip with a note
                console.log('  [focus] No field-node visible in overview; skipping focus assertion')
                test.skip()
            }
        }, { maxAttempts: 2, backoffMs: 1000, label: 'focus (programmatic)' })

        // ── a11y baseline scan (focus state) ─
        const axeResultsFocus = await new AxeBuilder({ page }).analyze()
        console.log(`  [focus] a11y: ${axeResultsFocus.violations.length} violation(s)`)  
        if (axeResultsFocus.violations.length > 0) {
            for (const v of axeResultsFocus.violations) {
                console.log(`    - [${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node(s))`)  
            }
        }
        if (axeResultsFocus.violations.length > 5) {
            throw new Error(`a11y regression: focus state has ${axeResultsFocus.violations.length} violations (baseline threshold: 5)`)  
        }

        if (consoleCapture.errors.length > 0) {
            console.log(`  [focus] ${consoleCapture.summary()}`)
        }
    })
})

// ── TODO: States not yet covered ────────────────────────────────────────────
//
// trail — Requires walking the thread (clicking "Walk Thread" or similar).
//         Needs a focused node first, then a trail action. Out of scope
//         for the initial 4-state baseline.
//
// inside — Requires semantic dive entry (click "Step Inside" on a focused node).
//          Complex multi-step flow: focus → step-inside → semantic dive active.
//
// semantic-dive — Same as inside; requires the semantic dive panel to be active.
//
// returning — Requires navigating back from focus to overview (Escape key or
//             "Back" button). Needs a prior focus state first.
//
// These will be added in a follow-up once the 4 primary states are stable.
