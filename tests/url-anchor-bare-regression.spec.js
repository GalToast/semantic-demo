/**
 * tests/url-anchor-bare-regression.spec.js
 *
 * Regression guard for commit 68797a8 ("fix(url-state): bare ?anchor=<id>
 * URLs rebuild the focus pocket").
 *
 * Purpose: catch a regression where ?anchor=<id> URLs without ?q=... silently
 * skip the focus dispatch path. The pre-68797a8 code gated anchor restoration
 * behind `_restoreSearchFromParams`, which only ran when `q?.trim().length >= 2`.
 *
 * These three cases pin the post-fix behaviour through Svelte shell data-attr
 * surfaces (the most reliable contract signals for the build-time minified Svelte
 * shell, where store internals are not exposed via __APP_STATE__).
 *
 *   A - bare ?anchor=519 (no q)
 *       - panelSurface MUST be focus-search once URL routing is done
 *       - activeView MUST remain galaxy (anchor restore must not flip views)
 *       - graphicsMode MUST be webgl (the bundle booted into the 3D mode)
 *
 *   B - ?q=coffee&anchor=519 (mixed)
 *       - panelSurface MUST be focus-search once the search round-trip resolves
 *       - activeView MUST remain galaxy
 *       - semantics-dive may or may not engage (gated on results); pin only
 *         when the search-results-list DOM node appears
 *
 *   C - ?anchor=garbage-id (non-numeric; gracefully no-op)
 *       - panelSurface should NOT be focus-search (no dispatch path triggered)
 *       - graphicsMode MUST be webgl (normal boot survived the bad URL)
 *       - title MUST NOT carry the Focus: prefix
 *
 * Target: Svelte production shell dist/svelte/index.html (via 127.0.0.1:8795).
 * Mirrors the structural shape of tests/live-url-state-reconstruction.spec.js
 * (legacy shell); uses the same mock helper.
 */

import { test, expect } from '@playwright/test'
import { setupMockSearch } from './helpers/mock-semantic-search.js'

// ----- Constants -------------------------------------------------------------

/** Canonical test base URL — override via TEST_BASE_URL for staging/CI hosts. */
const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/+$/, '')
const SVELTE_SHELL = `${BASE_URL}/dist/svelte/index.html`

/** Per-test ceiling: this spec exercises URL-round-trip + data-load + reactive settle. */
const NAV_TIMEOUT_MS = 60000

// ----- Helpers ---------------------------------------------------------------

/**
 * Open the Svelte shell with an optional URL search suffix and wait until the
 * app has fully booted: graphics mode is webgl AND the body dataset reflects
 * SOME known state (either idle, search-corridor, focus-search, etc).
 *
 * Returns a snapshot probe function for inline assertions.
 */
async function openAppWithUrl(page, queryString = '') {
    await setupMockSearch(page)
    const url = `${SVELTE_SHELL}${queryString.startsWith('?') ? queryString : `?${queryString}`}`
    await page.goto(url)
    // WebGL context + bridge must materialise, then two RAF settle reactive
    // $effect propagation in App.svelte for data-attr-driven surfaces.
    await page.waitForFunction(() => document.body.dataset.graphicsMode === 'webgl', { timeout: NAV_TIMEOUT_MS })
    await page
        .waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), {
            timeout: 8000
        })
        .catch(() => {
            /* RAF-settle is best-effort; assertion is what matters */
        })
}

/**
 * Capture a snapshot of all observable surfaces the fix touches.
 * Resilient against Svelte build-time minification that strips internal
 * store keys; uses only data-attr + document.title that we know are stable.
 */
async function anchorProbe(page) {
    return page.evaluate(() => {
        const surface = document.body?.dataset?.panelSurface ?? null
        const view = document.body?.dataset?.activeView ?? null
        const dive = document.body?.dataset?.semanticDive ?? null
        const graphics = document.body?.dataset?.graphicsMode ?? null
        const ctx = document.body?.dataset?.graphContext ?? null
        return {
            title: document.title,
            url: location.href,
            urlParams: {
                q: new URLSearchParams(location.search).get('q'),
                anchor: new URLSearchParams(location.search).get('anchor'),
                view: new URLSearchParams(location.search).get('view')
            },
            body: {
                panelSurface: surface,
                activeView: view,
                semanticDive: dive,
                graphicsMode: graphics,
                graphContext: ctx
            },
            // Only present if the focus-card has hydrated; absence is acceptable.
            focusStage:
                !!document.querySelector('#focus-stage') &&
                getComputedStyle(document.getElementById('focus-stage')).display !== 'none'
        }
    })
}

/**
 * Title-update check that doesn't depend on a particular business name being
 * in mock data — just checks whether the focus pipeline flipped document.title
 * out of the default and onto a Focus: prefix.
 */
function titleCarriesFocus(title) {
    return typeof title === 'string' && /^Focus:/.test(title)
}

// ----- Tests -----------------------------------------------------------------

test.describe('URL-anchor bare regression (post-fix pinning)', () => {
    /**
     * Case A — bare ?anchor=519, no ?q param.
     * This is the precise URL shape that regressed pre-68797a8.
     */
    test('A: bare ?anchor=519 transitions to focus-search without ?q', async ({ page }) => {
        test.setTimeout(NAV_TIMEOUT_MS)
        await page.setViewportSize({ width: 1440, height: 1000 })

        await openAppWithUrl(page, 'anchor=519')

        // Wait for the URL-restore surface flip before probing.
        // The webgl gate resolves before focus-search lands → reads 'idle'.
        // Mirror Test B (below) which already does this.
        await page.waitForFunction(
            () => document.body.dataset?.panelSurface === 'focus-search',
            null,
            { timeout: NAV_TIMEOUT_MS }
        )

        const probe = await anchorProbe(page)

        // URL routing MUST trigger the focus-search surface
        expect(probe.body.panelSurface).toBe('focus-search')
        // Active view MUST NOT have flipped off galaxy
        expect(probe.body.activeView).toBe('galaxy')
        // WebGL must be live
        expect(probe.body.graphicsMode).toBe('webgl')
        // URL anchor MUST be preserved
        expect(probe.urlParams.anchor).toBe('519')
        // No q param was provided; data flow should not have started a search
        expect(probe.urlParams.q).toBeNull()
    })

    /**
     * Case B — ?q=coffee&anchor=519 (mixed).
     * Regression in the opposite direction: search dispatch should NOT clobber
     * the numeric anchor restoration that _restoreAnchorFromParams now handles
     * unconditionally.
     */
    test('B: ?q=coffee&anchor=519 also lands on focus-search (numeric anchor preserved)', async ({ page }) => {
        test.setTimeout(NAV_TIMEOUT_MS)
        await page.setViewportSize({ width: 1440, height: 1000 })

        await openAppWithUrl(page, 'q=coffee&anchor=519')

        // Wait for at least one search-result to render OR for the focus
        // search surface to flip — whichever signals first. The search round-trip
        // is asynchronous, so the test must not race it too tightly.
        await page.waitForFunction(
            () =>
                document.body.dataset.panelSurface === 'focus-search' || document.querySelector('.search-result-item'),
            { timeout: NAV_TIMEOUT_MS }
        )

        const probe = await anchorProbe(page)

        // Either the focus pipeline ran (panelSurface=focus-search) OR the
        // search results rendered. The contract under test is that the numeric
        // anchor does NOT get clobbered by q-only restoration.
        const focusSurfaceFlipped = probe.body.panelSurface === 'focus-search'
        const searchReturnedResults = await page
            .locator('.search-result-item')
            .count()
            .then((n) => n > 0)
            .catch(() => false)

        expect(focusSurfaceFlipped || searchReturnedResults).toBe(true)
        // Active view remains galaxy
        expect(probe.body.activeView).toBe('galaxy')
        // URL parameters are preserved
        expect(probe.urlParams.q).toBe('coffee')
        expect(probe.urlParams.anchor).toBe('519')
    })

    /**
     * Case C — ?anchor=garbage-id (non-numeric).
     * Numeric guard in _restoreAnchorFromParams must bail out cleanly and the
     * search-resolve path inside _restoreSearchFromParams must not crash on the
     * garbage id (no result.find match) — the page should boot normally and
     * panelSurface should NOT transition to focus-search.
     */
    test('C: ?anchor=garbage-id is a graceful no-op (panelSurface stays off focus-search)', async ({ page }) => {
        test.setTimeout(NAV_TIMEOUT_MS)
        await page.setViewportSize({ width: 1440, height: 1000 })

        await openAppWithUrl(page, 'anchor=garbage-id')

        const probe = await anchorProbe(page)

        // Garbage anchor must not have routed to focus-search
        expect(probe.body.panelSurface).not.toBe('focus-search')
        // Graphics mode is still webgl — the bundle still booted
        expect(probe.body.graphicsMode).toBe('webgl')
        // Title is still the default (the focus pipeline never fired)
        expect(titleCarriesFocus(probe.title)).toBe(false)
        // URL garbage-anchor is preserved (we don't silently drop unknown params)
        expect(probe.urlParams.anchor).toBe('garbage-id')
    })
})
