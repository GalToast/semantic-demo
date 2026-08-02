/**
 * search-input-escape-cancel-journey.spec.js — SearchInput Escape→cancel journey test
 *
 * Verifies that pressing Escape while `showLoading === true` (status === 'searching')
 * cancels the in-flight search via handleCancel(), hiding the cancel button
 * while preserving the typed query text.
 *
 * Debounce-handling mechanism (chosen: route interception):
 *   Option 1 (evaluate-based) and Option 2 (AbortController) were considered.
 *   Route interception was chosen because:
 *     (a) It does not require code changes to SearchInput.svelte or
 *         search.svelte.ts (both READ-ONLY for this task).
 *     (b) It is deterministic across all machine speeds: the hanging route
 *         ensures performSearch never resolves, so status remains 'searching'
 *         even if the 300ms debounce timer fires before Escape is pressed.
 *     (c) handleCancel internally calls searchAbortController.abort() which
 *         rejects the hanging fetch, cleanly unwinding the search path.
 *
 *   The alternative (synchronous evaluate injecting store + dispatching Escape)
 *   was rejected because the $derived reactive chain may not flush before the
 *   subsequent dispatchEvent read — showLoading could be stale, routing Escape
 *   to handleClear instead of handleCancel.
 *
 * Acceptance criteria:
 *   1. #search-cancel-btn is visible after injecting status:'searching' via store
 *   2. After Escape, #search-cancel-btn is hidden
 *   3. #search-input value is preserved (not cleared by cancel)
 */

import { test, expect } from '@playwright/test'
import { ONBOARDING_STORAGE_KEY } from '@lib/onboarding/onboarding-storage'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:5183').replace(/\/$/, '')

test.describe('SearchInput Escape→cancel', () => {
    test('Escape while searching cancels and preserves query', async ({ page }) => {
        test.setTimeout(60_000)

        // ── Bootstrap: suppress onboarding & demo fallback ────────────────

        // Pre-seed onboarding-seen flag so the welcome sequence does not
        // overlay the input or steal focus.
        await page.addInitScript(() => {
            localStorage.setItem(ONBOARDING_STORAGE_KEY, 'true')
        })

        // ── Debounce-handling: hang search API calls ─────────────────────
        //
        // The 300ms debounce in SearchInput.handleInput → debounceDispatch
        // fires dispatchSearch → runSearch → performSearch. By hanging the
        // API route, performSearch never settles with 'results'/'error', so
        // the store status stays 'searching' until handleCancel's
        // AbortController.abort() rejects the fetch. This gives us an
        // arbitrarily wide window to drive the Escape press without racing
        // the debounce.
        await page.route('**/api.php?action=semantic_search**', async () => {
            await new Promise(() => {
                /* never resolves — aborted by handleCancel */
            })
        })

        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/?nodemo=1&webgl=1`)

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

        // Click body to register a user interaction, which sets
        // DemoChoreography.userInteractedSinceMount = true and suppresses
        // the "Getting started" fallback toast that would compete for the
        // singleton toast element.
        await page.click('body', { position: { x: 100, y: 100 } })

        // ── Drive the cancel flow ────────────────────────────────────────

        const UNIQUE_QUERY = 'test-escape-cancel-unique'

        // Fill the input to establish the query in appState. This goes
        // through handleInput → setSearchQuery → withSearchNotify, which
        // creates appState.searchState.currentSearchSummary and sets its
        // .query field. appState is the source of truth for query text;
        // the search mirror is a subscriber notification channel.
        await page.fill('#search-input', UNIQUE_QUERY)

        // Inject status='searching' via the test global. This updates the
        // searchMirror writable, which flows to $searchState.status →
        // showLoading = $derived(status === 'searching').
        await page.evaluate((query) => {
            const store = /** @type {any} */ (window).__searchStore__
            if (store) {
                store.set({ status: 'searching', query })
            }
        }, UNIQUE_QUERY)

        // Wait for the cancel button to become visible (confirming Svelte
        // reactivity flushed the DOM).
        await expect(page.locator('#search-cancel-btn')).toBeVisible({ timeout: 10_000 })

        // Focus the input and press Escape.
        await page.locator('#search-input').focus()
        await page.keyboard.press('Escape')

        // ── Assertions ───────────────────────────────────────────────────

        // Cancel button must be hidden after handleCancel runs.
        await expect(page.locator('#search-cancel-btn')).toBeHidden({ timeout: 5_000 })

        // Input value must be preserved — handleCancel does NOT clear the
        // query; it only aborts the in-flight request and sets status to idle.
        await expect(page.locator('#search-input')).toHaveValue(UNIQUE_QUERY)
    })
})
