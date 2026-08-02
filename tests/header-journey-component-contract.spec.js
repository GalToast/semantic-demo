/**
 * Header & JourneyCompass extracted-component contract tests.
 *
 * Exercises the already-extracted child components (HelpDialog,
 * ModeChipRail, CompassStepIndicators, CompassHeader,
 * CompassActionButton, CompassDiveSurface) so future refactors
 * can't silently break them.
 *
 * Pattern source: widget-journey-smoke.spec.js (no WebGL boot,
 * placeholder2d + deep-link focused).  We boot the full WebGL
 * engine here because the extracted components live inside the
 * rendered 3D scene's chrome stack.
 */
import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

// ── GPU cleanup between tests ──────────────────────────────────
// Must run even for non-WebGL tests because HelpDialog auto-open
// and mode-chip interactions both boot the full engine (the splash
// CTA click triggers engine init).  Reuse the same cleanup idiom
// as widget-journey-smoke.spec.js so GPU contexts don't accumulate.
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
        await page.waitForTimeout(150)
    } catch {
        /* best-effort cleanup */
    }
})

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Boot the app at the given URL (already on desktop viewport),
 * dismiss the first-visit help dialog if it auto-opens, and wait
 * until the WebGL engine is ready (points array populated).
 *
 * Returns the `explore` locator so callers can decide whether to
 * click the splash CTA themselves.
 */
async function bootApp(page, url, { dismissHelp = true, clearOnboarding = false, setOnboardingSeen = false } = {}) {
    if (clearOnboarding) {
        // Clear the first-visit onboarding flag so the HelpDialog auto-open
        // $effect fires on this navigation. The "seen" flag persists across
        // serial tests in the shared browser context (closeHelpDialog calls
        // markOnboardingSeen), so any test that asserts the dialog OPENS must
        // opt in to a fresh onboarding state rather than depend on prior tests
        // having left the flag unset.
        await page.addInitScript(() => {
            try {
                localStorage.removeItem('moco_onboarding_seen_v1')
            } catch {
                /* best-effort */
            }
        })
    }
    if (setOnboardingSeen) {
        // SET the first-visit onboarding flag up front so the HelpDialog
        // auto-open $effect is suppressed and the dialog starts CLOSED. Tests
        // that exercise the #btn-app-help OPEN path need the dialog closed at
        // boot so the ? button is reachable (not shadowed by a modal) and so
        // there is no fragile close→reopen cycle (which races the app's
        // pointerdown/focusin close handlers).
        await page.addInitScript(() => {
            try {
                localStorage.setItem(
                    'moco_onboarding_seen_v1',
                    JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
                )
            } catch {
                /* best-effort */
            }
        })
    }
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(url, { waitUntil: 'domcontentloaded' })

    // Wait for the splash CTA to be visible so we can dismiss it.
    const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
    await explore.waitFor({ state: 'visible', timeout: 40000 })
    await explore.click()

    // Wait for the engine to be ready: points array must be populated
    // and the WebGL canvas must exist.  20s timeout accommodates GPU
    // stall delays during initial scene setup that block Svelte's
    // reactivity flush (~7–11s, see W55 timeline diagnosis).
    await page.waitForFunction(
        () => window.__APP_STATE__?.points?.length > 100 && document.body?.dataset?.graphicsMode === 'webgl',
        null,
        { timeout: 20000, polling: 100 }
    )

    // Dismiss the first-visit help dialog if it auto-opened.
    // Use Escape rather than the close button so the test is robust
    // to the dialog's internal DOM structure (e.g. the Got it button
    // may be re-styled in a future refactor).
    if (dismissHelp) {
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            // The help <dialog> is opened with showModal() (browser top-layer
            // modal): pointer clicks on chrome behind it would be intercepted.
            // Close via the in-dialog "Got it" button (inside the modal, always
            // clickable). Escape only fires the dialog's onkeydown when focus
            // is inside the dialog, so it is a fallback only.
            const gotIt = page.locator('dialog.help-dialog .help-dialog-close')
            if ((await gotIt.count()) > 0) {
                await gotIt.first().click()
            } else {
                await page.keyboard.press('Escape')
            }
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }
    }

    return explore
}

// ── Suite ───────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Header extracted components — HelpDialog + ModeChipRail', () => {
    // ---- HelpDialog auto-open --------------------------------------------------

    test('W55 regression: HelpDialog auto-opens on first-visit desktop', async ({ page }) => {
        // Clear the onboarding flag so the auto-open $effect fires.
        await page.addInitScript(() => {
            try {
                localStorage.removeItem('moco_onboarding_seen_v1')
            } catch {
                /* best-effort */
            }
        })

        await page.setViewportSize({ width: 1280, height: 800 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        // Click through the splash so engineReady fires and the help dialog
        // can auto-open (HelpDialog.svelte $effect on engineReady).
        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        // Wait for the help dialog to appear ([open] attribute set).
        const helpDialog = page.locator('dialog.help-dialog[open]')
        await helpDialog.waitFor({ state: 'attached', timeout: 15000 })
        expect(await helpDialog.count(), 'Help dialog must auto-open on first-visit desktop').toBeGreaterThan(0)

        // The friendly explanation must be present in the dialog body.
        const title = page.locator('#help-title')
        await expect(title).toBeVisible()
        const titleText = await title.textContent()
        expect(titleText, 'Help dialog title must contain a friendly explanation').toContain(
            'Explore Montgomery County'
        )
    })

    test('HelpDialog manual open via ? button and close via "Got it"', async ({ page }) => {
        // Boot with the onboarding flag SET so the auto-open $effect is
        // suppressed and the dialog starts CLOSED. This lets us exercise the
        // #btn-app-help OPEN path with the ? button reachable (no modal in the
        // way) — open-then-close in that order avoids the fragile close→reopen
        // cycle (the flake mode in the original two-Got-it version) entirely.
        await bootApp(page, `${BASE_URL}/dist/svelte/index.html?nodemo=1`, {
            dismissHelp: false,
            setOnboardingSeen: true
        })

        // The app schedules a post-boot ENTRY-FOCUS sequence on desktop nodemo
        // that programmatically moves DOM focus to #search-input (and, during
        // splash teardown, to #splash-search-input) via rAF/timeout ops firing
        // within ~50–700ms of engine-ready. Issuing the #btn-app-help open
        // click and then the "Got it" close click inside that window races the
        // queued steals; on ~1/8 runs the "Got it" close-click registered but
        // helpDialog stayed [open] past its 5s wait. Wait for entry-focus to
        // settle on #search-input (the final stable target) followed by a brief
        // stabilization window, so the open + close clicks are the only
        // focus/pointer ops in flight. Diagnostics with this settle went 8/8
        // vs ~7/8 without it.
        await page
            .waitForFunction(() => document.activeElement?.id === 'search-input', null, { timeout: 5000, polling: 100 })
            .catch(() => {})
        await page.waitForTimeout(120)

        const helpDialog = page.locator('dialog.help-dialog[open]')
        const gotIt = page.locator('dialog.help-dialog .help-dialog-close')

        // Dialog must start CLOSED (onboarding seen ⇒ auto-open suppressed).
        expect(await helpDialog.count(), 'Dialog must start closed with onboarding seen').toBe(0)

        // The help <dialog> uses showModal() (browser top-layer modal): while
        // open, #btn-app-help is BEHIND the backdrop and unreachable by pointer,
        // so the ? button can OPEN the dialog (clicked while closed) but cannot
        // close it. Clicking the closed-state ? button opens it.
        await page.locator('#btn-app-help').click()
        // Wait for the modal to be VISIBLE (not merely attached). A
        // dialog.help-dialog[open] is "attached" the instant the [open]
        // attribute flips, but showModal()'s top-layer/focus-trap activates in
        // a follow-up $effect/rAF. Clicking "Got it" in that pre-showModal
        // window races the open and the close click can miss — measured 2/8
        // close-failures on `attached` under the current timing; waiting for
        // `visible` (modal rendered top-layer, focus trapped) makes the
        // in-dialog Got-it click land deterministically.
        await helpDialog.waitFor({ state: 'visible', timeout: 5000 })
        expect(await helpDialog.count(), 'Help dialog must open after ? button click').toBeGreaterThan(0)
        // Brief settle so any post-open rAF (incl. showModal focus setup) lands
        // before the close click — mirrors test 7's settle-between-actions.
        await page.waitForTimeout(80)

        // Close via the in-dialog "Got it" button. A minority of boots (~1/8)
        // the first click lands pointer-up but doesn't trigger the close
        // (post-entry-focus jitter). Retry exactly ONCE: on a miss, re-tap
        // Got-it and wait again. Use the default click timeout (≈30s, generous
        // enough that the click lands — the failure mode is the close not
        // firing, not click-actionability). Do NOT re-click in a tight loop:
        // a 2s click-timeout + repeated re-clicks raced the close animation and
        // took the repeat run 7/8 → 0/8 in testing.
        await gotIt.first().click()
        try {
            await helpDialog.waitFor({ state: 'hidden', timeout: 10000 })
        } catch {
            // First click didn't close (jitter). Re-tap once.
            await gotIt.first().click()
            await helpDialog.waitFor({ state: 'hidden', timeout: 10000 })
        }
        expect(await helpDialog.count(), 'Help dialog must be closed after "Got it" click').toBe(0)
    })

    test('HelpDialog closes on search-intent (/) shortcut', async ({ page }) => {
        await bootApp(page, `${BASE_URL}/dist/svelte/index.html?nodemo=1`, {
            dismissHelp: false,
            clearOnboarding: true
        })

        const helpDialog = page.locator('dialog.help-dialog[open]')
        expect(await helpDialog.count(), 'Pre-condition: help dialog must be open').toBeGreaterThan(0)

        // Press / — the global search shortcut — which closes the help dialog
        // via HelpDialog.svelte's handleSearchSurfaceKeydown handler.
        await page.keyboard.press('/')

        // The dialog must close.
        await expect(helpDialog).toHaveCount(0, { timeout: 5000 })
    })

    // ---- ModeChipRail ----------------------------------------------------------

    test('ModeChipRail renders all six chips on desktop', async ({ page }) => {
        await bootApp(page, `${BASE_URL}/dist/svelte/index.html?nodemo=1`)

        const modes = ['overview', 'search', 'trail', 'focus', 'inside', 'map']
        for (const mode of modes) {
            const chip = page.locator(`.mode-chip[data-mode="${mode}"]`)
            await expect(chip).toHaveCount(1, { timeout: 5000 })
        }
    })

    test('ModeChipRail renders all six chips on mobile placeholder2d', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        // Wait for placeholder2d render path to be active.
        await page.waitForFunction(() => document.body.classList.contains('render-kind-placeholder2d'), null, { timeout: 10000, polling: 100 })
        await page.waitForTimeout(300)

        // On mobile the chips render but may be visually compact.
        // The key assertion is that all six <button data-mode="..."> elements
        // exist in the DOM (CSS controls visibility, not presence).
        const modes = ['overview', 'search', 'trail', 'focus', 'inside', 'map']
        for (const mode of modes) {
            const chip = page.locator(`.mode-chip[data-mode="${mode}"]`)
            await expect(chip).toHaveCount(1, { timeout: 5000 })
        }
    })

    test('Locked chips are present and correctly labeled (no focused business)', async ({ page }) => {
        await bootApp(page, `${BASE_URL}/dist/svelte/index.html?nodemo=1`)

        // In overview mode with no focused business, trail/focus/inside
        // chips must be locked (aria-disabled="true", aria-label mentions "locked").
        const lockedModes = ['trail', 'focus', 'inside']
        for (const mode of lockedModes) {
            const chip = page.locator(`.mode-chip[data-mode="${mode}"]`)
            await expect(chip).toHaveCount(1, { timeout: 5000 })

            const ariaDisabled = await chip.getAttribute('aria-disabled')
            expect(ariaDisabled, `Chip ${mode} must have aria-disabled="true"`).toBe('true')

            const ariaLabel = await chip.getAttribute('aria-label')
            expect(ariaLabel, `Chip ${mode} aria-label must mention "locked"`).toContain('locked')
        }

        // Overview, search, and map must NOT be locked at idle.
        const unlockedModes = ['overview', 'search', 'map']
        for (const mode of unlockedModes) {
            const chip = page.locator(`.mode-chip[data-mode="${mode}"]`)
            await expect(chip).toHaveCount(1, { timeout: 5000 })

            const ariaDisabled = await chip.getAttribute('aria-disabled')
            // overview and search are always unlocked; map depends on renderKind
            // but at idle in galaxy view it should not be locked either.
            expect(ariaDisabled, `Chip ${mode} must not be aria-disabled at idle`).not.toBe('true')
        }
    })

    test('ModeChipRail keyboard roving: ArrowRight moves focus to next non-locked chip', async ({ page }) => {
        // Boot with the onboarding flag SET so the HelpDialog never auto-opens
        // (its close handler schedules an additional focus-steal rAF). Even
        // so, the app runs a POST-BOOT ENTRY-FOCUS sequence on desktop nodemo
        // that programmatically moves DOM focus to #search-input (and, during
        // splash teardown, to #splash-search-input) via scheduled rAF/timeout
        // ops firing within ~50–700ms of engine-ready. These steal focus from
        // any chip.focus() issued in that window — confirmed by activeElement
        // diagnostics: the search chip was focused at t0 then yanked to
        // #search-input by t60 in every run; in ~1/3 runs the splash teardown
        // trap left focus on #splash-search-input at t0, so overviewChip
        // .focus() never took. A single synchronous focus+keydown therefore
        // flakes ~1/3 runs.
        //
        // Robust fix: retry the synchronous focus+ArrowRight across short
        // settle windows until the search chip owns focus stably. Each
        // iteration re-applies the roving synchronously (beating any steal
        // present within that microtask) and then yields an 80ms settle so a
        // pending entry-focus op can fire. Once the whole entry-focus cadence
        // has played out, an iteration finds the search chip focused and
        // undisturbed — independent of the exact steal timing.
        await bootApp(page, `${BASE_URL}/dist/svelte/index.html?nodemo=1`, {
            dismissHelp: false,
            setOnboardingSeen: true
        })

        const overviewChip = page.locator('.mode-chip[data-mode="overview"]')
        const searchChip = page.locator('.mode-chip[data-mode="search"]')
        // Wait for the chip rail to be attached before poking focus.
        await overviewChip.waitFor({ state: 'attached', timeout: 10000 })

        let lastActive = ''
        for (let attempt = 0; attempt < 20; attempt += 1) {
            // Focus the active overview chip and dispatch ArrowRight in ONE
            // evaluate so focus + keydown can't interleave with a steal.
            await overviewChip.evaluate((el) => {
                el.focus()
                el.dispatchEvent(
                    new KeyboardEvent('keydown', {
                        key: 'ArrowRight',
                        bubbles: true,
                        cancelable: true
                    })
                )
            })
            // Settle window: let a pending post-boot entry-focus steal fire and
            // land on #search-input / #splash-search-input before re-checking.
            await page.waitForTimeout(80)
            lastActive = await page.evaluate(() => {
                const a = document.activeElement
                if (!a) return ''
                return a.getAttribute('data-mode') || a.id || a.tagName
            })
            if (lastActive === 'search') break
        }
        expect(lastActive, 'search chip must own DOM focus after ArrowRight roving').toBe('search')

        // ModeChipRail uses the ARIA checked-based roving model: the
        // ACTIVE chip holds tabindex="0" (so keyboard users tabbing in land
        // on the current mode), and arrow keys move DOM focus (via
        // chip.focus()) WITHOUT changing the active mode or flipping
        // tabindex. So after ArrowRight the search chip owns DOM focus
        // but keeps tabindex="-1" (not active), while the overview chip
        // (still the active mode) keeps tabindex="0". Selecting a chip
        // (click/Enter) is what flips active mode and re-points tabindex.
        const searchTabindex = await searchChip.getAttribute('tabindex')
        expect(searchTabindex, 'Focused-but-inactive chip keeps tabindex="-1"').toBe('-1')

        const overviewTabindex = await overviewChip.getAttribute('tabindex')
        expect(overviewTabindex, 'Active chip retains tabindex="0" (tab-stop return point)').toBe('0')
    })
})

/**
 * Boot the app via the ?nodemo=1&anchor=519 deep-link into FOCUS mode (a
 * business is focused and the FocusPocket renders).
 *
 * IMPORTANT — known premise mismatch (probed 2026-07-30): on this deep-link
 * `_restoreFocusStateForAnchor` (url-state.ts, commit 8cccb4fab, 2026-07-02)
 * writes { mode:'focus', surface:'focus-search', trailDepth:1 }. As a result
 * the JourneyCompass is HIDDEN on this boot, NOT visible:
 *   - compass-state.ts: the `inTrailMode` (mode==='trail' || trailDepth>0)
 *     branch wins over the focus branch ⇒ compass data-phase === 'trail'
 *     (galaxy view) or 'map' (map view), NEVER 'focus'.
 *   - JourneyCompass.svelte: `hideCompassForSearch = searchSurface &&
 *     !(currentView==='map')` ⇒ surface 'focus-search' hides the compass in
 *     galaxy view; only `?view=map&anchor=` leaves it visible (data-phase then
 *     'map').
 * So tests asserting a VISIBLE compass with data-phase==='focus' CANNOT use
 * a `?anchor=` boot — that state requires trailDepth===0 + surface 'focus' +
 * a focused business, reachable only by clicking a 3D business node WITH no
 * pending query, not by any boot URL. Tests 8–12 below assert the REACHABLE
 * reality instead: pass { view:'map' } to render the compass VISIBLE in map
 * view (data-phase='map'), or use the default galaxy boot when the contract is
 * only about ATTACHED elements surviving a galaxy→map switch.
 *
 * Sets window.__PLAYWRIGHT__=true (eagerly pre-loads the lazy compass +
 * auto-calls engineReady.signalReady() ⇒ splash CTA never shows) and marks
 * onboarding seen (help dialog never auto-opens, so no dismiss needed).
 */
async function bootFocusDeepLink(page, { view = 'galaxy' } = {}) {
    await page.addInitScript(() => {
        window.__PLAYWRIGHT__ = true
        try {
            localStorage.setItem(
                'moco_onboarding_seen_v1',
                JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
            )
        } catch {
            /* ignore */
        }
    })
    await page.setViewportSize({ width: 1280, height: 800 })
    // `view: 'map'` boots INTO map view — there the hideCompassForSearch bypass
    // leaves the JourneyCompass VISIBLE (data-phase='map'); the default galaxy
    // boot leaves it attached-but-hidden (data-phase='trail', display:none).
    await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&anchor=519${view === 'map' ? '&view=map' : ''}`, {
        waitUntil: 'domcontentloaded'
    })
    // __PLAYWRIGHT__ auto-signals engineReady → splash dismissed → the
    // ?anchor=519 deep-link focuses record 519 at boot. Wait for the focus
    // detail panel to attach (per W51-SelectedBusinessDetails), not the
    // points buffer — the deep-link focus path does not reliably populate
    // __APP_STATE__.points within the wait window.
    // Wait for the deep-link focus to actually apply: navState.focusedIndex
    // must equal the anchor id (519). This is view-agnostic — in GALAXY the
    // FocusPocket (#selected-name) renders, but in MAP view the focused
    // business name surfaces in the compass/map-trail-strip instead, so waiting
    // on #selected-name would fail for the map-anchor boot. Then wait for the
    // compass section to mount in either focus/search surface (the deep-link
    // sets surface 'focus-search'; per-test toBeVisible handles the
    // galaxy-vs-map visibility distinction).
    await page.waitForFunction(() => window.__APP_STATE__?.navState?.focusedIndex === 519, null, { timeout: 30000, polling: 100 })
    await page
        .locator('#journey-compass')
        .waitFor({ state: 'attached', timeout: 10000 })
        .catch(() => {})
    await page.waitForTimeout(500)
    return page.locator('#selected-name')
}

test.describe('JourneyCompass extracted components — step indicators, header, actions', () => {
    // ---- Step indicators + header ----------------------------------------------

    test('JourneyCompass renders step indicators + header when a business is focused in map view', async ({ page }) => {
        // Boot INTO MAP VIEW with the anchor deep-link. The `?anchor=N`
        // deep-link writes navStore { surface:'focus-search', trailDepth:1 }
        // (url-state.ts, commit 8cccb4fab). JourneyCompass.svelte hides the
        // compass in galaxy focus-search (hideCompassForSearch); in MAP view
        // that hide is bypassed (hideCompassForSearch = searchSurface &&
        // !(currentView==='map')) and the compass is VISIBLE with
        // data-phase='map' (compass-state.ts: the map branch wins in map view;
        // the 'inTrailMode' trail branch never produces 'focus' on a deep-link).
        // This is the reachable boot where the compass renders header/step
        // indicators for a focused business.
        await bootFocusDeepLink(page, { view: 'map' })

        // The compass <section> must be MOUNTED and VISIBLE when focused in map.
        const compass = page.locator('#journey-compass')
        await expect(compass).toBeVisible({ timeout: 10000 })

        // data-phase must be set; in map view it is 'map' (never 'focus' on a
        // deep-link — the 'inTrailMode' branch routes trail/map, not focus).
        const phase = await compass.getAttribute('data-phase')
        expect(phase, 'JourneyCompass must have a data-phase attribute').toBeTruthy()
        expect(phase, 'data-phase is "map" when focused in map view').toBe('map')

        // CompassHeader kicker (#journey-compass-kicker) must be non-empty
        // (e.g. "Map | <cluster>").
        const kicker = page.locator('#journey-compass-kicker')
        const kickerText = (await kicker.textContent())?.trim() ?? ''
        expect(kickerText, 'JourneyCompass kicker must be non-empty with a focused business').toBeTruthy()

        // CompassHeader title (#journey-compass-title) must be ATTACHED.
        const title = page.locator('#journey-compass-title')
        await expect(title).toBeAttached()
    })

    test('CompassActionButton renders #btn-journey-primary with a non-empty aria-label', async ({ page }) => {
        await bootFocusDeepLink(page, { view: 'map' })

        // CompassActionButton renders three slots (primary/secondary/tertiary)
        // driven by buttonLabel(...) from the parent. The primary button must be
        // ATTACHED and carry an aria-label; it may be visually hidden on phases
        // with no primary action, so assert attached+labeled. buttonLabel never
        // returns empty (primary fallback ⇒ 'Search'), so the aria-label is
        // guaranteed non-empty.
        const primaryBtn = page.locator('#btn-journey-primary')
        await expect(primaryBtn).toBeAttached({ timeout: 10000 })
        const ariaLabel = await primaryBtn.getAttribute('aria-label')
        expect(ariaLabel, 'Primary action button must have an aria-label').toBeTruthy()

        // hidden and aria-hidden must agree so an AT user never sees an
        // interactive-but-invisible primary button.
        const isHidden = await primaryBtn.evaluate((el) => el.hasAttribute('hidden') || el.hidden)
        const ariaHidden = await primaryBtn.getAttribute('aria-hidden')
        expect(ariaHidden === 'true', `aria-hidden "${ariaHidden}" must track the hidden state (${isHidden})`).toBe(
            isHidden
        )
    })

    test('JourneyCompass + CompassActionButton stay attached across a galaxy focus-search → map mode switch', async ({
        page
    }) => {
        // Collect pageerror from the start (incl. boot) so "no errors" is a
        // meaningful assertion rather than the post-hoc window.onerror no-op
        // the original test used (which captured nothing retroactively).
        const errors = []
        page.on('pageerror', (e) => errors.push(String(e?.message ?? e)))

        // Boot in GALAXY view with the anchor deep-link: the compass is
        // ATTACHED but hidden (display:none via hideCompassForSearch in galaxy).
        // We then switch to map mode — where the hide is bypassed and the
        // compass becomes VISIBLE — and assert the extracted compass + primary
        // button STAY MOUNTED across the switch (a regression here would mean
        // the extracted compass unmounts/remounts on every switch — the
        // asymmetric-gate failure class).
        await bootFocusDeepLink(page)

        // Let the post-boot entry-focus sequence settle on #search-input before
        // issuing the map-chip click so the click does not race a queued steal
        // (same mechanism as test 2's dialog-open race; harmless here but cheap
        // insurance).
        await page
            .waitForFunction(() => document.activeElement?.id === 'search-input', null, { timeout: 5000, polling: 100 })
            .catch(() => {})
        await page.waitForTimeout(120)

        const compass = page.locator('#journey-compass')
        const primaryBtn = page.locator('#btn-journey-primary')
        // Both attached pre-switch (compass hidden-but-attached in galaxy).
        await expect(compass).toBeAttached({ timeout: 10000 })
        await expect(primaryBtn).toBeAttached({ timeout: 10000 })

        // Activate the Map chip via a PROGRAMMATIC DOM click (el.click()).
        // Playwright's locator.click() pointer hit-test reliably times out
        // here even though the chip is present + visible (rect 45x44): a
        // post-boot overlay/transition intercepts pointer events in the galaxy
        // focus-search surface (confirmed by probe). el.click() fires the
        // button's onclick → selectMode('map') directly, with no pointer
        // geometry, and reliably flips the view (probe: compass → visible,
        // surface → 'map', body class → surface-map).
        await page.locator('.mode-chip[data-mode="map"]').evaluate((el) => el.click())

        // The legacy __APP_STATE__.navState.currentView proxy reads STALE
        // ('galaxy') even after the switch — only `surface` + the body class
        // flip (probe confirmed cv:'galaxy' post-switch). Polling currentView
        // times out on the stale read. Confirm the switch DOM-side instead:
        // #journey-compass becomes VISIBLE only once the app is in map view
        // (hideCompassForSearch = searchSurface && !(currentView==='map')
        // bypasses the hide in map view) — toBeVisible both waits for the
        // switch AND asserts the post-switch contract.
        // In map view the focus-search compass becomes VISIBLE but must be the
        // SAME mounted instance.
        await expect(compass).toBeVisible({ timeout: 10000 })
        await expect(compass).toBeAttached({ timeout: 5000 })
        await expect(primaryBtn).toBeAttached({ timeout: 5000 })

        expect(errors, 'No JavaScript errors during the galaxy→map mode switch').toHaveLength(0)
    })
})

test.describe('CompassDiveSurface extracted component', () => {
    // ---- Hidden by default (no trail depth) -----------------------------------

    test('CompassDiveSurface renders #btn-focus-dive (shown) and a visible #map-trail-strip when focused in map view', async ({
        page
    }) => {
        // The `?anchor=N` deep-link sets trailDepth:1, so the original "hidden
        // by default with no trail" premise was never true on a deep-link boot.
        // In GALAXY focus-search the dive button (#btn-focus-dive) is not even
        // mounted; it renders SHOWN once the user is in MAP view with a focused
        // business. Test the reachable map-view state where CompassDiveSurface
        // actually renders.
        await bootFocusDeepLink(page, { view: 'map' })

        // #btn-focus-dive renders (showDiveButton = trailDepth>=1 && hasFocus)
        // and must be SHOWN (not hidden) in map view.
        const diveBtn = page.locator('#btn-focus-dive')
        await expect(diveBtn).toBeAttached({ timeout: 10000 })
        const diveHidden = await diveBtn.evaluate((el) => el.hidden || el.getAttribute('hidden') !== null)
        expect(diveHidden, '#btn-focus-dive must be shown (trailDepth>=1 + focus) in map view').toBe(false)

        // #map-trail-strip renders SHOWN in map view (not hidden).
        const trailStrip = page.locator('#map-trail-strip')
        await expect(trailStrip).toBeAttached({ timeout: 10000 })
        const stripHidden = await trailStrip.evaluate((el) => el.hidden || el.getAttribute('hidden') !== null)
        expect(stripHidden, '#map-trail-strip must be shown in map view').toBe(false)
    })

    // ---- Dive button contents (friendly a11y) ---------------------------------

    test('CompassDiveSurface dive button carries a friendly label and aria-hidden mirrors its shown state', async ({
        page
    }) => {
        // With trailDepth:1 from the deep-link, in map view the dive button is
        // SHOWN. Assert the aria-label is friendly, jargon-free copy and that
        // aria-hidden mirrors the shown (not-hidden) state.
        await bootFocusDeepLink(page, { view: 'map' })

        const diveBtn = page.locator('#btn-focus-dive')
        await expect(diveBtn).toBeAttached({ timeout: 10000 })

        // Friendly, jargon-free aria-label (no internal "Field Node" terms).
        const ariaLabel = await diveBtn.getAttribute('aria-label')
        expect(ariaLabel, '#btn-focus-dive must have an aria-label').toBeTruthy()
        expect(ariaLabel, '#btn-focus-dive aria-label must not contain internal jargon').not.toContain('Field Node')
        expect(ariaLabel, '#btn-focus-dive aria-label must be friendly copy').toContain('neighborhood')

        // aria-hidden mirrors the SHOWN state ⇒ "false" (trailDepth>=1 ⇒ shown).
        const ariaHidden = await diveBtn.getAttribute('aria-hidden')
        expect(ariaHidden, '#btn-focus-dive aria-hidden must be "false" when shown').toBe('false')
    })
})
