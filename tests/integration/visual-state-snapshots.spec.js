/**
 * Visual State Snapshots — Body Data-Attr Baseline
 *
 * Captures Playwright screenshots for the 4 primary body data-attr states
 * and stores them as visual baselines for regression detection.
 *
 * States covered:
 *   1. idle-overview      — initial overview (no interaction)
 *   2. search-mode        — search mode radio clicked, query typed
 *   3. focus-search       — after clicking a search result
 *   4. focus-programmatic — programmatic focus from overview (if a node is clickable)
 *
 * Usage:
 *   # Run tests (compare against existing baselines):
 *   npx playwright test tests/integration/visual-state-snapshots.spec.js --browser=chromium
 *
 *   # Update baselines (overwrite snapshots with current rendering):
 *   UPDATE_SNAPSHOTS=true npx playwright test tests/integration/visual-state-snapshots.spec.js --browser=chromium
 *
 * Environment variables:
 *   TEST_BASE_URL        — target URL (default: http://127.0.0.1:5175)
 *   INTEGRATION_TIMEOUT  — per-step timeout in ms (default: 30000)
 *   INTEGRATION_HEADLESS — set to 'true' for headless CI mode
 *   UPDATE_SNAPSHOTS     — set to 'true' to update baseline screenshots
 */

import { test, expect } from '@playwright/test'
import {
    installMockFetch,
    navigateToApp,
    enterSearchMode,
    typeSearchQuery,
    clickFirstSearchResult,
    SNAPSHOT_SETTLE_MS,
} from './helpers.js'

// ── Config ──────────────────────────────────────────────────────────────────

const UPDATE_SNAPSHOTS = process.env.UPDATE_SNAPSHOTS === 'true'

// ── Snapshot options ────────────────────────────────────────────────────────

const SNAPSHOT_OPTIONS = {
    // Allow some variance for anti-aliasing and font rendering differences
    maxDiffPixelRatio: 0.01,
    threshold: 0.2,
    animations: 'disabled',
}

// ── Tests ───────────────────────────────────────────────────────────────────

test.describe('Visual state snapshots', () => {
    test.beforeEach(async ({ page }) => {
        // Install mock routes before each test
        await installMockFetch(page)
    })

    test('idle-overview', async ({ page }) => {
        await navigateToApp(page)
        await page.waitForTimeout(SNAPSHOT_SETTLE_MS)

        await expect(page).toHaveScreenshot('idle-overview.png', {
            ...SNAPSHOT_OPTIONS,
            updateSnapshots: UPDATE_SNAPSHOTS ? 'always' : 'missing',
        })
    })

    test('search-mode', async ({ page }) => {
        await navigateToApp(page)
        await enterSearchMode(page)
        await typeSearchQuery(page, 'cafe')
        await page.waitForTimeout(SNAPSHOT_SETTLE_MS)

        await expect(page).toHaveScreenshot('search-mode.png', {
            ...SNAPSHOT_OPTIONS,
            updateSnapshots: UPDATE_SNAPSHOTS ? 'always' : 'missing',
        })
    })

    test('focus-search', async ({ page }) => {
        await navigateToApp(page)
        await enterSearchMode(page)
        await typeSearchQuery(page, 'cafe')
        await clickFirstSearchResult(page)
        await page.waitForTimeout(SNAPSHOT_SETTLE_MS)

        await expect(page).toHaveScreenshot('focus-search.png', {
            ...SNAPSHOT_OPTIONS,
            updateSnapshots: UPDATE_SNAPSHOTS ? 'always' : 'missing',
        })
    })

    test('focus-programmatic', async ({ page }) => {
        await navigateToApp(page)

        // Try to click a visible field-node in overview
        const fieldNode = page.locator('[data-field-node], .field-node, [role="button"]').first()
        const nodeVisible = await fieldNode.isVisible().catch(() => false)

        if (nodeVisible) {
            await fieldNode.click()
            await page.waitForTimeout(SNAPSHOT_SETTLE_MS)

            await expect(page).toHaveScreenshot('focus-programmatic.png', {
                ...SNAPSHOT_OPTIONS,
                updateSnapshots: UPDATE_SNAPSHOTS ? 'always' : 'missing',
            })
        } else {
            // If no field-node is visible, skip the snapshot
            console.log('  [focus-programmatic] No field-node visible; skipping snapshot')
            test.skip()
        }
    })
})
