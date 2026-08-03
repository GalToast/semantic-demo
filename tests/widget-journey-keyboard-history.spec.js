import { test, expect } from '@playwright/test'
import { openApp } from './helpers/3d-interaction-helpers.js'

// GPU cleanup between tests (mirrors widget-journey.spec.js afterEach): force-release
// the WebGL context so the GPU process reclaims memory across the two engine inits.
test.afterEach(async ({ page }) => {
    try {
        await page
            .evaluate(() => {
                const canvas = document.querySelector('canvas')
                if (canvas) {
                    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
                    if (gl && !gl.isContextLost()) {
                        const ext = gl.getExtension('WEBGL_lose_context')
                        if (ext) ext.loseContext()
                    }
                }
            })
            .catch(() => {})
        await page.waitForTimeout(200)
    } catch {
        // Cleanup is best-effort — never mask the real test failure.
    }
})

// Helper: dismiss the first-visit help dialog if it auto-opened; it sits in the
// browser top-layer and absorbs keydown (W55 regression pattern).
async function dismissHelpDialogIfOpen(page) {
    const helpDialog = page.locator('dialog.help-dialog[open]')
    if ((await helpDialog.count()) > 0) {
        await page.keyboard.press('Escape')
        await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
        await page.waitForTimeout(200)
    }
}

// Helper: blur a focused text field so Ctrl+1-6's narrow isTextInputField guard
// does not swallow the shortcut (openApp lands with the search input focused).
async function blurActiveField(page) {
    await page.evaluate(() => {
        const el = document.activeElement
        if (el && typeof el.blur === 'function') el.blur()
    })
}

test.describe('W57 keyboard + browser-history journey', () => {
    /**
     * KH-INSIDE-SHORTCUT-FIX coverage (fix a13ab982, found by
     * nvidia/mistralai/mistral-nemotron). Pressing Ctrl+5 from a focused-business
     * state must engage the semantic-dive inside surface — the keyboard
     * equivalent of clicking the Inside chip (Header.svelte L64). Before the fix,
     * global-shortcuts dispatched the nav transition + updated the URL but never
     * called executeJourneyCompassAction(ENTER_INSIDE), so setSemanticDiveMode(true)
     * never fired and the surface-semantic-dive body class never engaged.
     */
    test('Ctrl+5 keyboard shortcut engages the semantic-dive inside surface', async ({ page }) => {
        await openApp(page)
        await blurActiveField(page)
        await dismissHelpDialogIfOpen(page)

        // Focus a business node so the selection-dependent 'inside' mode unlocks
        // (mirrors the canonical inside-test focus pattern in widget-journey.spec.js).
        const focused = await page.evaluate(() => {
            if (typeof window.__publishCameraNodeFocused__ === 'function') {
                window.__publishCameraNodeFocused__(0)
                return true
            }
            const a = window.__navActions__
            return a && typeof a.focusOnNode === 'function' ? a.focusOnNode(0) : false
        })
        expect(focused, 'a focus helper must be available to unlock the inside mode').toBe(true)
        await page.waitForFunction(() => document.body.classList.contains('surface-focus'), null, {
            timeout: 8000
        })
        await blurActiveField(page)

        await page.keyboard.press('Control+5')

        await page.waitForFunction(() => document.body.classList.contains('surface-semantic-dive'), null, {
            timeout: 8000
        })
        const state = await page.evaluate(() => {
            const pocket = document.querySelector('#focus-pocket')
            const cs = pocket ? getComputedStyle(pocket) : null
            return {
                semanticDive: document.body.classList.contains('surface-semantic-dive'),
                pocketDisplay: cs?.display,
                pocketAriaHidden: pocket?.getAttribute('aria-hidden')
            }
        })
        expect(state.semanticDive, 'Ctrl+5 must engage the semantic-dive surface (matches the Inside chip path)').toBe(
            true
        )
        expect(state.pocketDisplay, 'focus pocket must be visible in the dive surface').toBe('block')
        expect(state.pocketAriaHidden, 'focus pocket must not be aria-hidden in the dive surface').not.toBe('true')
    })

    /**
     * Popstate-wiring coverage (fix 030d0812) — INTENTIONALLY NOT A JOURNEY TEST.
     *
     * The popstate -> applyUrlState({fromHistory}) restore path (the regression fix
     * for the lost popstate/focus/visibility wiring) is covered by the unit suite, not
     * by this Playwright spec, because the built app exposes no DOM field that can
     * discriminate the restore in a back-button journey. Proven via the disposable
     * probe tmp/debug-backbutton.mjs on 2026-07-29:
     *
     *   - The q=coffee deep-link leaves the app in idle/overview surface with an
     *     EMPTY #search-input (id confirmed in SearchInput.svelte:262). `q=` only
     *     sits in the URL; it does NOT set navState.mode='search' or the
     *     body.surface-search class, and steps NO input value. So there is no
     *     app-state field the deep-link populates that a STATE_RESET push clears and
     *     BACK could restore — the URL restore is browser-native (the browser does
     *     it without the handler) and therefore is NOT a discriminator of whether the
     *     popstate handler fired.
     *   - view=map is no better: resetExplorationFocus does not push a distinct
     *     history entry when only view=map is set (URL stays ?view=map&nodemo=1), so
     *     page.goBack() overshoots to about:blank — there is no in-app entry to
     *     restore from.
     *   - The app's only general history.pushState path is EVENTS.STATE_RESET
     *     (lifecycle.resetExplorationFocus -> url-state.ts:478 mode:'push'); mode
     *     changes use replaceState by design, so BACK has no other realistic landing
     *     short of a URL difference that is itself browser-native (non-discriminating).
     *
     * The restore-correctness contract IS verified by the unit suite — the
     * applyUrlState fromHistory branch, restore-token / race-abort controller,
     * anchor/record mapping, and the restoringBrowserHistory re-entry guards
     * (see tests/unit-active url-state-* suites; 3361 pass). A journey test would
     * require either source-level test scaffolding (e.g. a window.__popstateCount__
     * hook) or a product change making q= deep-links activate a visible surface —
     * both out of scope for this split-keyboard-history fix. Revisit if either
     * changes. Keeping this block as a guard against future readers re-trying the
     * same unworkable discriminating-field search.
     */
})
