/**
 * search-input-cleared-status.spec.js — Search clear() → status/idle regression test
 *
 * Verifies that clicking the clear button (#search-clear-btn) while a search is
 * in-flight (status === 'searching') resets the search status back to 'idle'
 * and hides the loading spinner.
 *
 * Bug: src/lib/search/search-dispatch.ts clear() omitted setSearchStatus('idle'),
 *   leaving status stuck at 'searching' after a mid-flight clear.
 *   Sibling methods cancel() and clearQuery() both called it; clear() was the
 *   sole omission. Fixed by mirroring the clearQuery() body.
 *
 * Acceptance criteria:
 *   1. After injecting status:'searching' via setSearchStatus, #search-spinner is visible
 *   2. After clicking #search-clear-btn, #search-spinner is hidden
 *   3. After clicking #search-clear-btn, searchStatus === 'idle'
 */

import { test, expect } from '@playwright/test'
import { ONBOARDING_STORAGE_KEY } from '@lib/onboarding/onboarding-storage'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:5183').replace(/\/$/, '')

test.describe('SearchInput clear → status/idle', () => {
    test('clicking clear while searching resets status to idle and hides spinner', async ({ page }) => {
        test.setTimeout(60_000)

        // ── Bootstrap: suppress onboarding & demo fallback ────────────────

        await page.addInitScript(() => {
            localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
        })

        // ── Debounce-handling: hang search API calls ─────────────────────
        //
        // Hang the API route so performSearch never resolves with 'results' or
        // 'error', keeping the store status at 'searching' until we explicitly
        // drive the clear path.
        await page.route('**/api.php?action=semantic_search**', async () => {
            await new Promise(() => {
                /* never resolves */
            })
        })

        // Stub the lane-health check so the app trusts the live API path and
        // actually fetches semantic_search (which the route above hangs).
        // Without this, the health check 404s on the preview server and the
        // app falls back to the local index — results settle in ~1s, the
        // spinner hides before the assertion, and the clear path is never
        // exercised mid-flight.
        await page.route('**/api.php?action=semantic_lane_health**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ok: true, state: 'healthy', provenance: {} })
            })
        )

        await page.setViewportSize({ width: 1280, height: 800 })
        // ?staticDev=0 forces the live API path (so the semantic_search fetch
        // fires and the hang-route below keeps status at 'searching'), while
        // the 8,406-point dataset still loads from the local data.dat asset
        // (legacy __APP_STATE__.points — mode-independent).
        await page.goto(`${BASE_URL}/?nodemo=1&webgl=1&staticDev=0`)

        // Wait for the legacy data layer to populate with business records.
        await page.waitForFunction(
            () => {
                const w = /** @type {any} */ (window)
                return w.__APP_STATE__?.points?.length > 100
            },
            { timeout: 30_000, polling: 100 }
        )

        // Wait for search input to be rendered and interactable.
        await page.waitForSelector('#search-input', { state: 'visible', timeout: 15_000 })

        // Click body to register a user interaction, which suppresses the
        // "Getting started" fallback toast that would compete for the
        // singleton toast element.
        await page.click('body', { position: { x: 100, y: 100 } })

        // ── Drive the clear flow ─────────────────────────────────────────

        const UNIQUE_QUERY = 'test-clear-status-unique'

        // Fill the input to establish the query in appState and trigger
        // debounceDispatch → setSearchStatus('searching') → hang on API route.
        await page.fill('#search-input', UNIQUE_QUERY)

        // Wait for the spinner to become active (confirming the search
        // dispatched and status is now 'searching'). Assert the aria contract
        // rather than CSS visibility: the spinner flips aria-hidden when the
        // search starts but can stay visually hidden until the results panel
        // finishes its surface transition.
        await expect(page.locator('#search-spinner')).toHaveAttribute('aria-hidden', 'false', { timeout: 10_000 })

        // Confirm searchStatus is 'searching' before clearing.
        const statusBeforeClear = await page.evaluate(() => {
            return /** @type {any} */ (window).__APP_STATE__?.searchState?.searchStatus ?? null
        })
        expect(statusBeforeClear).toBe('searching')

        // Click the clear button — this drives handleClear → dispatch.clear().
        // DOM-direct dispatch: the app header strip overlaps the input row and
        // intercepts BOTH Playwright's actionability clicks and coordinate
        // clicks (same class as the focus-pocket overlay fix in widget-journey),
        // and the input row can remount during the search-surface transition
        // (flapping visibility). element.click() invokes the handler on the
        // current node regardless of overlay stacking or transition remounts.
        await page.evaluate(() => {
            const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('search-clear-btn'))
            if (btn && 'click' in btn) btn.click()
        })

        // ── Assertions ─────────────────────────────────────────────────────

        // searchStatus in appState must return to 'idle' (the bug left it at
        // 'searching'): clear() → setSearchStatus('idle'), mirroring cancel()
        // and clearQuery(). Poll — the search-surface transition can remount
        // the input row and delay the final state by a frame or two.
        await page.waitForFunction(
            () => {
                const s = /** @type {any} */ (window).__APP_STATE__?.searchState?.searchStatus
                return s === 'idle'
            },
            { timeout: 8000, polling: 50 }
        )

        // Spinner must be hidden after clear() runs.
        await expect(page.locator('#search-spinner')).toBeHidden({ timeout: 5_000 })
    })
})
