/**
 * search-clear-keeps-search-surface.spec.js — Regression for
 * tmp/shittiest-ui-journey-20260812/report.md #1.
 *
 * The "Clear query" affordance (#search-clear-btn → handleClearQuery) must keep
 * the user in the search surface so they can immediately type a new query. It
 * must NOT teleport them back to the galaxy/overview (that is the explicit exit
 * affordance, the back button → handleClear → clear() → RETURN_OVERVIEW).
 *
 * Two scenarios:
 *   1. Plain search: type a query → results → click clear → surface stays
 *      'search' (not 'idle'/'overview'), query is empty, input stays focused.
 *   2. Focus-trap: focus a result (surface 'focus-search') → click clear →
 *      surface resolves back to 'search' (not stuck in 'focus-search', not
 *      'idle'), so the search input is never hidden/stranded.
 *
 * No screenshots / vision — assertions read window.__APP_STATE__.navState.surface
 * and the live DOM directly.
 */

import { test, expect } from '@playwright/test'
import { ONBOARDING_STORAGE_KEY } from '@lib/onboarding/onboarding-storage'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8796').replace(/\/$/, '')

test.describe('Search clear query keeps the user in the search surface', () => {
    test('clicking clear from a plain search keeps surface=search', async ({ page }) => {
        test.setTimeout(90_000)

        await page.addInitScript(
            (key) => {
                localStorage.setItem(key, 'true')
            },
            ONBOARDING_STORAGE_KEY
        )

        await page.setViewportSize({ width: 1280, height: 800 })
        // Default data path (local 8,406-point index); no live API needed.
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&webgl=1`)

        await page.waitForFunction(
            () => window.__APP_STATE__?.points?.length > 100,
            { timeout: 30_000, polling: 100 }
        )
        await page.waitForSelector('#search-input', { state: 'visible', timeout: 15_000 })

        // Establish a query + results so the search surface is active.
        await page.fill('#search-input', 'coffee')
        await page.waitForFunction(
            () => {
                const s = window.__APP_STATE__?.searchState?.searchStatus
                return s === 'results' || s === 'empty'
            },
            { timeout: 20_000, polling: 100 }
        )

        const surfaceBefore = await page.evaluate(() => window.__APP_STATE__?.navState?.surface)
        expect(surfaceBefore).toBe('search')

        // DOM-direct click: the header strip overlaps the input row and can
        // intercept Playwright coordinate clicks (same as the sibling
        // search-input-cleared-status spec). element.click() drives the handler
        // on the current node regardless of overlay stacking / remounts.
        await page.evaluate(() => {
            const btn = document.getElementById('search-clear-btn')
            if (btn && 'click' in btn) btn.click()
        })

        // Surface must stay 'search' — NOT be reset to 'idle'/'overview'.
        await page.waitForFunction(
            () => window.__APP_STATE__?.navState?.surface === 'search',
            { timeout: 8_000, polling: 50 }
        )
        const surfaceAfter = await page.evaluate(() => window.__APP_STATE__?.navState?.surface)
        expect(surfaceAfter).toBe('search')

        // Query wiped, status idle, input still focused.
        const postClear = await page.evaluate(() => ({
            query: window.__APP_STATE__?.searchState?.query ?? '',
            status: window.__APP_STATE__?.searchState?.searchStatus,
            focused: document.activeElement?.id
        }))
        expect(postClear.query).toBe('')
        expect(postClear.status).toBe('idle')
        expect(postClear.focused).toBe('search-input')
    })

    test('clicking clear from a focused result resolves back to search (no focus-trap)', async ({ page }) => {
        test.setTimeout(90_000)

        await page.addInitScript(
            (key) => {
                localStorage.setItem(key, 'true')
            },
            ONBOARDING_STORAGE_KEY
        )

        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&webgl=1`)

        await page.waitForFunction(
            () => window.__APP_STATE__?.points?.length > 100,
            { timeout: 30_000, polling: 100 }
        )
        await page.waitForSelector('#search-input', { state: 'visible', timeout: 15_000 })

        await page.fill('#search-input', 'coffee')
        await page.waitForFunction(
            () => {
                const s = window.__APP_STATE__?.searchState?.searchStatus
                return s === 'results' || s === 'empty'
            },
            { timeout: 20_000, polling: 100 }
        )

        // Focus the first result to promote the body into focus-search.
        const focused = await page.evaluate(() => {
            const list = document.getElementById('search-result-list')
            const first = list?.querySelector('[data-order="0"]')
            if (first && 'click' in first) {
                first.click()
                return true
            }
            return false
        })
        // If results settled with rows, the surface should now be focus-search.
        if (focused) {
            await page.waitForFunction(
                () => window.__APP_STATE__?.navState?.surface === 'focus-search',
                { timeout: 8_000, polling: 50 }
            )
        }

        await page.evaluate(() => {
            const btn = document.getElementById('search-clear-btn')
            if (btn && 'click' in btn) btn.click()
        })

        // After clearing, the surface must resolve to 'search' — not stay
        // pinned in 'focus-search' (the old trap) and not drop to 'idle'.
        await page.waitForFunction(
            () => window.__APP_STATE__?.navState?.surface === 'search',
            { timeout: 8_000, polling: 50 }
        )
        const surfaceAfter = await page.evaluate(() => window.__APP_STATE__?.navState?.surface)
        expect(surfaceAfter).toBe('search')

        const postClear = await page.evaluate(() => ({
            focusedIndex: window.__APP_STATE__?.navState?.focusedIndex,
            query: window.__APP_STATE__?.searchState?.query ?? '',
            status: window.__APP_STATE__?.searchState?.searchStatus
        }))
        // Auto-focused result must be dropped so the body settles into plain search.
        expect(postClear.focusedIndex == null).toBe(true)
        expect(postClear.query).toBe('')
        expect(postClear.status).toBe('idle')
    })
})
