/**
 * record-url-focus-restore.spec.js
 *
 * PR-B4: `?record=<lead_id>` deep-link restores focus on the matching
 * business. The camera/focus pipeline writes `record=<lead_id>` to the URL
 * when a business is focused, but applyUrlState() only restored `anchor`
 * (array index). For shared links like `?record=519` (no anchor), focus was
 * dropped and the app fell back to the default business.
 *
 * Verifies:
 *   - main.ts classifies ?record=519 as a deep-link (splash dismissed)
 *   - url-state.ts maps record=519 to the array index with lead_id=519
 *   - navState.focusedIndex lands on that index
 */

import { test, expect } from '@playwright/test'
import { ONBOARDING_STORAGE_KEY } from '@lib/onboarding/onboarding-storage'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:5173'

test.beforeEach(async ({ page }) => {
    // Surface console errors so failed tests show the real cause
    const errors = []
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

    // Pre-seed localStorage to suppress the W52 onboarding help dialog.
    await page.addInitScript(() => {
        try {
            localStorage.setItem(
                ONBOARDING_STORAGE_KEY,
                JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
            )
        } catch {
            /* localStorage unavailable */
        }
    })
})

test('?record=519 deep-link restores focus on lead_id=519', async ({ page }) => {
    await page.goto(`${BASE_URL}?record=519&nodemo=1&webgl=1`, { waitUntil: 'domcontentloaded' })

    // Wait for engine / data to be ready. A deep-link bypasses the splash,
    // so signalReady() fires automatically; we just need the dataset.
    await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 10000 })

    // Give applyUrlState() a tick to resolve the record and dispatch focus.
    await page.waitForTimeout(250)

    const state = await page.evaluate(() => {
        const points = window.__APP_STATE__?.points ?? []
        const focusedIndex = window.__APP_STATE__?.navState?.focusedIndex ?? null
        const focusedRecord = focusedIndex != null ? points[focusedIndex] : null
        return {
            focusedIndex,
            focusedLeadId: focusedRecord?.lead_id ?? null,
            focusedName: focusedRecord?.name ?? null,
            pointCount: points.length
        }
    })

    expect(state.pointCount, 'dataset should be loaded').toBeGreaterThan(100)
    expect(state.focusedIndex, 'focusedIndex should be set').not.toBeNull()
    expect(state.focusedLeadId, 'focused business should have lead_id=519').toBe('519')
    // The app exposes points[i].name as the human-readable business name
    // ("Angel Fire Coffee"), normalized from the API's slug form
    // ("519-angel-fire-coffee") for display. lead_id is the canonical
    // identifier; the name is the display label.
    expect(state.focusedName, 'focused business should be Angel Fire Coffee').toContain('Angel Fire Coffee')
})
