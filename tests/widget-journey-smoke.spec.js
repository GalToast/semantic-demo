/**
 * Smoke tests — lightweight journey checks that do NOT boot the full WebGL
 * engine. They exercise the placeholder2d (mobile 2D) path, URL deep-links,
 * and CSS-invariant assertions. Kept separate from the main WebGL-heavy spec
 * so `qa:journey:smoke` can run fast (< 1 min) without GPU resource
 * accumulation.
 *
 * Split from tests/widget-journey.spec.js (2026-07-28) to fix flaky
 * timeouts caused by serial WebGL context teardown under heavy load.
 */
import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

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

test.describe('Journey smoke (no WebGL engine)', () => {
    test('W51-mobile-h1: only one H1 visible on mobile (placeholder2d path)', async ({ page }) => {
        // W51 audit #2. On mobile viewport with renderKind=placeholder2d,
        // the App.svelte H1 must be hidden so screen readers see ONE H1,
        // not two (App's "Semantic Explorer — ..." + Placeholder2D's
        // "Semantic Explorer Preview").
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        // Wait for hydration + renderKind=placeholder2d to take effect
        await page.waitForFunction(() => document.body.classList.contains('render-kind-placeholder2d'), null, {
            timeout: 10000,
            polling: 100
        })
        await page.waitForTimeout(500)

        // Count visible H1s in the accessibility tree
        const visibleH1s = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('h1'))
            return all
                .filter((h) => {
                    const r = h.getBoundingClientRect()
                    const cs = getComputedStyle(h)
                    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'
                })
                .map((h) => ({ text: h.textContent.trim().slice(0, 60), visible: true }))
        })
        expect(
            visibleH1s,
            `Expected exactly 1 visible H1 on mobile, got ${visibleH1s.length}: ${JSON.stringify(visibleH1s)}`
        ).toHaveLength(1)
    })

    test('W54 visual audit: placeholder2d Search chip reveals #info-panel + #search-input', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        // Dismiss the first-visit help dialog if it auto-opens; it blocks taps
        // on the mode-chip rail on mobile just like it blocks search input.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // The header/mode chips are visible above the 2D placeholder CTA.
        const searchChip = page.locator('.mode-chip[data-mode="search"]')
        await searchChip.waitFor({ state: 'visible', timeout: 10000 })
        await searchChip.click()

        // Regression: body.render-kind-placeholder2d .info-panel used display:none
        // unconditionally, hiding the search panel in the 2D placeholder path.
        await page.waitForFunction(
            () => {
                const info = document.querySelector('#info-panel')
                const input = document.querySelector('#search-input')
                const r = info?.getBoundingClientRect()
                const ir = input?.getBoundingClientRect()
                return (
                    document.body.classList.contains('surface-search') &&
                    r != null &&
                    r.width > 0 &&
                    r.height > 0 &&
                    ir != null &&
                    ir.width > 0 &&
                    ir.height > 0
                )
            },
            null,
            { timeout: 5000, polling: 100 }
        )
    })

    test('W54 visual audit: map back button returns to overview from ?view=map deep-link', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&view=map`, { waitUntil: 'domcontentloaded' })

        await page.waitForFunction(() => window.__APP_STATE__?.currentView === 'map', null, {
            timeout: 10000,
            polling: 100
        })

        // W61-W54: the deep-link boot settles asynchronously (load-dependent
        // window, ~1-2s under suite load): the navStore mirror and
        // appState.navState transiently disagree on currentView while the
        // URL-state apply + initial-state write race (evidence:
        // tmp/w54-map-boot-race-REPORT.md + tmp/probe-w54*.mjs), and a
        // back-click landing in that window gets its galaxy write reverted by
        // the still-settling machinery. A fixed settle wait is fragile (the
        // window grows under load), and state-based waits cannot see the
        // disagreement (the proxy reads a merged snapshot that looks stable).
        // returnToOverview is idempotent, so retry the click until the view
        // holds — deterministic regardless of the settle window length.
        const backBtn = page.locator('.map-back-btn')
        await backBtn.waitFor({ state: 'visible', timeout: 10000 })
        let galaxyHeld = false
        for (let attempt = 0; attempt < 4 && !galaxyHeld; attempt++) {
            if (attempt > 0) await backBtn.waitFor({ state: 'visible', timeout: 10000 })
            const backBox = await backBtn.boundingBox()
            expect(backBox, 'map back button must have a clickable box').not.toBeNull()
            if (!backBox) break
            // The click handler unmounts MapView synchronously. Playwright's
            // locator.click() waits on the detached target after dispatching
            // the native pointer sequence and can time out despite the click
            // having succeeded. Coordinate input preserves the real hit test
            // without waiting for the removed locator to settle.
            await page.mouse.click(backBox.x + backBox.width / 2, backBox.y + backBox.height / 2)
            galaxyHeld = await page
                .waitForFunction(() => window.__APP_STATE__?.currentView === 'galaxy', null, {
                    timeout: 3000,
                    polling: 100
                })
                .then(() => true)
                .catch(() => false)
        }
        expect(galaxyHeld, 'map back button must return to overview (currentView galaxy)').toBe(true)
        expect(page.url(), 'URL should drop view=map after returning to overview').not.toContain('view=map')
    })

    /**
     * W55 audit regression (visual-audit-continued-2026-07-28.md §
     * "Root-Cause Finding — Mode-chip clicks blocked by first-visit help
     * dialog"): on a clean first-visit desktop session the help dialog
     * (`dialog.help-dialog[open]`, opened via `helpDialog.showModal()` in
     * src/lib/components/header/HelpDialog.svelte:127) sits in the browser
     * top-layer above the header rail and absorbs every pointer event.
     * Real users dismiss it with `Escape`, the **Got it** button, or the
     * W49 document-level pointerdown outside handler — chip clicks then
     * register normally. The MCP visual-audit script did NOT pre-dismiss
     * the dialog and reported false-positive "click did not register"
     * failures on the chip rail. This test pins the canonical pattern so
     * a future regression (e.g. someone removes the W49 pointerdown
     * handler) fails loudly instead of silently re-introducing the
     * false-negative.
     *
     * Pre-conditions:
     *  - Desktop viewport (>= 821px). The help dialog auto-opens only on
     *    `!$viewport.isCompact` (Header CSS contract; mobile uses
     *    renderKind=placeholder2d where the dialog never opens).
     *  - Clean localStorage: ONBOARDING_STORAGE_KEY absent, so the
     *    auto-open `$effect` in HelpDialog.svelte:128-145 fires.
     *  - No deep-link (`?anchor=`, `?record=`, `?view=map`, `?q>=2`) —
     *    HelpDialog skips auto-open on shared-link targets (W47-UI #2).
     *  - engineReady has fired so the `$effect` runs and `showModal()`
     *    is called.
     */
    test('W55 help-dialog: auto-opens on first visit; Escape dismisses; chip click then registers', async ({
        page
    }) => {
        await page.setViewportSize({ width: 1440, height: 900 })

        // Make sure ONBOARDING_STORAGE_KEY is not set so the dialog auto-opens.
        await page.addInitScript(() => {
            try {
                window.localStorage.removeItem('moco_onboarding_seen_v1')
            } catch {
                /* private mode / storage disabled — best-effort */
            }
        })

        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, { waitUntil: 'domcontentloaded' })

        // Click through the splash so engineReady fires and the help dialog
        // can auto-open (HelpDialog.svelte:128-145 $effect on engineReady).
        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Enter 3D scene"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        // Wait for engineReady + the dialog to be [open] in the DOM.
        // The auto-open $effect runs synchronously after engineReady.value flips,
        // so a short wait_for_timeout + the [open] attribute check is sufficient.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        await helpDialog.waitFor({ state: 'attached', timeout: 15000 })
        const isOpenBeforeDismiss = await helpDialog.count()
        expect(
            isOpenBeforeDismiss,
            'W55 pre-condition: help dialog must auto-open on first-visit desktop (clean localStorage, no deep-link)'
        ).toBeGreaterThan(0)

        // The chip rail is laid out behind the modal ::backdrop. Real
        // pointer events on a chip are absorbed by the dialog; verify
        // the chip exists but is logically occluded by the open dialog.
        // We do NOT assert that a click while the dialog is open FAILS —
        // the W49 pointerdown handler closes the dialog on any click
        // outside, which is the desired behavior. Instead we assert the
        // structural fact: the dialog is the top-layer element covering
        // the chip rail, so any chip-touching test MUST dismiss it first.
        const modeChips = page.locator('.mode-chips .mode-chip')
        await modeChips.first().waitFor({ state: 'attached', timeout: 5000 })

        // Dismiss the dialog with Escape (the canonical pattern used
        // by 10+ existing tests in widget-journey.spec.js). After Escape:
        //  - dialog[open] attribute is removed (closed)
        //  - markOnboardingSeen() ran, so localStorage now has the key
        //  - The mode-chip rail is the top interactive surface
        await page.keyboard.press('Escape')
        await helpDialog.waitFor({ state: 'hidden', timeout: 5000 })
        // Wait for the dialog's showModal() top-layer to fully clear
        // before issuing further UI interactions.
        await page.waitForFunction(() => !document.querySelector('dialog[open]'), { timeout: 5000, polling: 100 })
        await page.waitForTimeout(300)

        // Post-dismiss verification: clicking the Search chip now
        // switches navState.mode to 'search' AND surfaces #info-panel +
        // #search-input. This is the canonical positive control — if
        // the chip still does not register, the dismissal logic is
        // broken regardless of how many tests use the pattern.
        const searchChip = page.locator('.mode-chip[data-mode="search"]')
        await searchChip.waitFor({ state: 'visible', timeout: 5000 })
        await searchChip.click()
        // The chip click fires selectMode('search') → writeNavStateMirror,
        // but during initial WebGL scene setup the main thread is blocked
        // by GPU stall warnings ("GL_CLOSE_PATH_NV ... GPU stall due to
        // ReadPixels"), delaying Svelte's reactivity flush. Timeline tests
        // observed the state transition landing anywhere from +7s to +11s
        // after the click — 5s timeouts flake near-constantly.
        await page.waitForFunction(() => window.__APP_STATE__?.navState?.mode === 'search', null, {
            timeout: 20000,
            polling: 100
        })
        // The .surface-search body class is the visual surface-mode
        // contract that downstream panels (info-panel, search-results)
        // read. Verify it transitions in lockstep with navState.mode.
        await page.waitForFunction(() => document.body.classList.contains('surface-search'), null, {
            timeout: 20000,
            polling: 100
        })

        // Regression in the OTHER direction: if the help dialog is still
        // [open] after a successful Escape (e.g. someone wired up a
        // competing dialog-open path), this assertion catches it.
        const stillOpen = await page.locator('dialog.help-dialog[open]').count()
        expect(stillOpen, 'W55 post-condition: Escape must close the help dialog and keep it closed').toBe(0)
    })

    /**
     * W56 regression (reports/w56-vision-faceoff-2026-07-29.md): two pre-existing
     * map-mode layout bugs fixed in commit 66445d0d —
     *   (1) h1.app-title leaked a fragment behind .map-view-header in map mode
     *       → fixed by a `body.surface-map .app-title` sr-only rule in
     *       css/journey_active.css (clip:rect(0,0,0,0), 1px box).
     *   (2) the legend (Categories aside, id=legend-panel + class=legend) showed
     *       a NATIVE unstyled scrollbar because css/layout_base.css targets the
     *       CLASS .legend-panel but the element only carries the ID — fixed by
     *       mirroring the styled scrollbar (8px width) on the .legend class in
     *       src/components/Legend.svelte.
     * Both fixes only manifest visually in the full WebGL map surface (the
     * sr-only needs renderKind=webgl for body.surface-map; the legend is
     * display:none in placeholder2d), so this smoke test guards the RULES'
     * PRESENCE in the loaded stylesheet instead — catching future reverts
     * (css/journey_active.css has build-reversion history) without needing
     * WebGL. The visual behavior is pinned by the W56 vision faceoff
     * (inkling + minimax-m3 nvidia both confirmed the pixels).
     */
    test('W56 map-mode: header sr-only rule + legend styled-scrollbar rule are bundled', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&view=map`, { waitUntil: 'domcontentloaded' })

        // Scan every loaded same-origin stylesheet for the two fix rules.
        // Regexes are loose on purpose: Svelte scopes .legend -> .legend.svelte-XXXX,
        // and browsers re-serialize clip:rect(0,0,0,0) -> clip: rect(0px,0px,0px,0px)
        // in cssText, so exact-match patterns would flake.
        const found = await page.evaluate(() => {
            const result = { srOnlyMapTitle: false, legendScrollbar8px: false }
            const visit = (rules) => {
                for (const r of rules) {
                    const txt = (r.cssText || '').replace(/\s+/g, ' ')
                    if (/surface-map[^{}]*\.app-title/i.test(txt) && /clip:\s*rect\(/i.test(txt)) {
                        result.srOnlyMapTitle = true
                    }
                    if (/\.legend[^{}]{0,40}::-webkit-scrollbar/i.test(txt) && /width:\s*8px/i.test(txt)) {
                        result.legendScrollbar8px = true
                    }
                    if (r.cssRules)
                        try {
                            visit(r.cssRules)
                        } catch {
                            /* cross-origin */
                        }
                }
            }
            for (const ss of Array.from(document.styleSheets)) {
                try {
                    visit(ss.cssRules || [])
                } catch {
                    /* cross-origin skip */
                }
            }
            return result
        })

        expect(
            found.srOnlyMapTitle,
            'W56: body.surface-map .app-title sr-only rule must be bundled (header overlap fix)'
        ).toBe(true)
        expect(
            found.legendScrollbar8px,
            'W56: .legend::-webkit-scrollbar 8px rule must be bundled (native-scrollbar fix)'
        ).toBe(true)
    })
})
