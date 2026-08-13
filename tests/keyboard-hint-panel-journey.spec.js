import { test, expect } from '@playwright/test'
import { BASE_URL } from './helpers/3d-interaction-helpers.js'

/**
 * Keyboard hint panel journey — Phase B wave 2 regression guard.
 *
 * Guards the deterministic, user-visible behavior of the `#keyboard-hint-panel`
 * after the three Phase B fixes that touched `src/lib/keyboard/`:
 *
 *   - B4 KH-MAC-LABEL (commit 4573f3c0): the keys-table literal at
 *     `keyboard-help.ts:105` was `Ctrl+1-6` only, but the handler at
 *     `global-shortcuts.ts:78` accepts `e.ctrlKey || e.metaKey` — so
 *     Cmd+1-6 already worked on Mac but the hint misled Mac users.
 *     Now reads `Ctrl/Cmd+1-6`. Verified here by reading the rendered
 *     panel text after the first open.
 *
 *   - B2 teardown (commit 6ad96301): `closePanel()` previously cleared
 *     its timer + toggled `aria-hidden`, but never removed the panel
 *     from `document.body` — so the panel DOM subtree leaked for the
 *     entire app lifetime, and the early-return guard at
 *     `keyboard-help.ts:84` then made re-creation a no-op. Now
 *     `closePanel()` calls `panel.remove()`. Verified here by asserting
 *     `document.getElementById('keyboard-hint-panel') === null` after
 *     clicking the panel's own close button.
 *
 *   - GS-ESCAPE-FIELDGUARD (commit f31a81a5) + GS-ISFORMFIELD-CONTROLTAGS
 *     (commit 4c5f84a4) are NOT exercised here because that requires a
 *     focused form field + Ctrl+Digit hotkey dispatch which has its own
 *     journey concern; the unit-test contract still covers them.
 *
 * COVERED HERE SINCE Wave-3 fix commit `c4201964` (KH-HELPBTN-SECOND-
 * CLICK-RACE): the pre-Wave-3 narrative below is retained for context.
 * Originally filed not-covered-because-broken; the race symptom below is
 * now FIXED + ASSERTED via PHASE 4-6 (lines ~188-268 below).
 *
 *   Pre-fix history: the re-attach from commit 2de47f08 + the second-click
 *   reopen flow双双 fail via a Svelte-5-event-delegation + capture-phase
 *   addEventListener race: on the SECOND click of `#btn-keyboard-help`,
 *   the capture-phase handler added by `initKeyboardShortcutsHint`
 *   (keyboard-help.ts:326) fires first and `openPanel()`s the panel,
 *   then Svelte 5's delegated `onclick={openKeyboardHelp}` from
 *   Header.svelte fires at the document level, calls `init` (no-op) +
 *   `toggleKeyboardShortcutsHint()`, which sees the panel as `visible`
 *   (just-added `.visible` by the capture-phase listener) and calls
 *   `closePanel()` — concluding the click on a CLOSED panel. This was
 *   the original KH-HELPBTN-SECOND-CLICK-RACE symptom.
 *
 *   Wave-3 (commit `c4201964`): added `e.stopImmediatePropagation()` in
 *   keyboard-help.ts:~388 AFTER the capture handler's `panel == null`
 *   early-return guard. Per W3C DOM spec, `stopPropagation()` does NOT
 *   block same-element bubble listeners; only `stopImmediatePropagation`
 *   does. First-click + post-close paths bypass the call (early-return on
 *   panel==null) so Svelte 5's bubble `openKeyboardHelp` runs init+toggle.
 *   On 2nd+ clicks the capture handler wins, silencing Svelte's bubble
 *   listener → single toggle → panel reopens/closes deterministically.
 *   PHASE 4 asserts second-click REOPEN, PHASE 5 asserts third-click
 *   CLOSE, PHASE 6 asserts fourth-click REOPEN — full 4-click cycle.
 *   Focused contract: `tests/unit-active/w7-keyboard-help-kh-second-click-race.test.ts` (commit c9b9db4b).
 *
 * See `docs/subagent-bench-phase-b-findings-2026-07-24.md` for the bug
 * tickets + `tmp/bugsweep-find/_MASTER_BUG_LIST.md` for verification status.
 */
test.describe('Keyboard hint panel journey', () => {
    test('5h. Keyboard hint panel renders Mac-aware label + cleanly tears down on close', async ({ page }) => {
        // Desktop viewport — `?nodemo=1` bypasses the auto demo choreography.
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1`, {
            waitUntil: 'domcontentloaded'
        })

        // Spy on console messages so a swallowed openKeyboardHelp try/catch
        // error or a Helper.warn failure surfaces in the test failure rather
        // than being silently eaten.
        const consoleMessages = []
        page.on('console', (msg) => consoleMessages.push(`${msg.type()}: ${msg.text()}`))
        page.on('pageerror', (err) => consoleMessages.push(`pageerror: ${err.message}`))

        // Splash dismissal (mirrors the existing journey-test setup pattern).
        const explore = page.locator('[data-testid="splash-cta"], button[aria-label="Open full 3D experience"]').first()
        await explore.waitFor({ state: 'visible', timeout: 40000 })
        await explore.click()

        // Wait for the canvas bootloader to mount points + weather widget.
        await page.waitForFunction(() => (window.__APP_STATE__?.points?.length ?? 0) > 100, null, { timeout: 15000, polling: 100 })
        await page.locator('.weather-widget').waitFor({ state: 'attached', timeout: 30000 })
        await page.waitForTimeout(800)

        // The first-visit help DIALOG (separate from the hint panel) auto-opens
        // after splash dismissal. Dismiss it before exercising the hint panel.
        const helpDialog = page.locator('dialog.help-dialog[open]')
        if ((await helpDialog.count()) > 0) {
            await page.keyboard.press('Escape')
            await helpDialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
            await page.waitForTimeout(200)
        }

        // The `?` button (`#btn-keyboard-help`) renders at Header mount with
        // `aria-label='Open keyboard shortcuts'`, but `initKeyboardShortcutsHint()`
        // is called INSIDE its click handler `openKeyboardHelp` (Header.svelte:63)
        // — so the panel DOM is built on first click, then `toggleKeyboardShortcutsHint()`
        // opens it. Subsequent clicks race against Svelte 5 delegation (see file
        // header) and are deliberately NOT covered by this test.
        const helpBtn = page.locator('#btn-keyboard-help')
        await helpBtn.waitFor({ state: 'visible', timeout: 20000 })

        // ─── PHASE 1: First click — initializes AND opens the panel. ───────$
        // The header click path uses `toggleKeyboardShortcutsHint()` which
        // does NOT auto-dismiss (only the `?` key path auto-closes after 5 s),
        // so the panel stays open until we explicitly close it.
        await helpBtn.click()
        await page.waitForTimeout(500)

        // Diagnostic: if initKeyboardShortcutsHint() silently failed inside
        // openKeyboardHelp's try/catch, surface the swallowed error here so
        // the failure message names what actually happened.
        const afterClickState = await page.evaluate(() => {
            const b = document.getElementById('btn-keyboard-help')
            const p = document.getElementById('keyboard-hint-panel')
            return {
                helpBtnAriaControls: b?.getAttribute('aria-controls'),
                helpBtnAriaExpanded: b?.getAttribute('aria-expanded'),
                panelExistsById: !!p,
                panelInBody: p ? document.body.contains(p) : false,
                panelVisible: p?.classList.contains('visible'),
                panelAriaHidden: p?.getAttribute('aria-hidden'),
                bodyChildIds: Array.from(document.body.children)
                    .map((c) => c.id || c.tagName)
                    .filter((s) => typeof s === 'string' && s.length > 0)
            }
        })
        if (!afterClickState.panelExistsById) {
            throw new Error(
                `Panel NOT created after click. afterClickState=${JSON.stringify(afterClickState)}\n` +
                    `Console messages:\n${consoleMessages.slice(-20).join('\n')}`
            )
        }

        await page.waitForFunction(
            () => {
                const p = document.getElementById('keyboard-hint-panel')
                return !!p && p.classList.contains('visible') && p.getAttribute('aria-hidden') === 'false'
            },
            null,
            { timeout: 10000, polling: 100 }
        )

        const phase1 = await page.evaluate(() => {
            const p = document.getElementById('keyboard-hint-panel')
            return {
                inDom: p ? document.body.contains(p) : false,
                visible: p?.classList.contains('visible') ?? false,
                ariaHidden: p?.getAttribute('aria-hidden') ?? null,
                text: p?.textContent ?? ''
            }
        })
        expect(phase1.inDom, 'panel must be attached to document.body after open').toBe(true)
        expect(phase1.visible, 'panel must have the .visible class after open').toBe(true)
        expect(phase1.ariaHidden, 'panel aria-hidden must become "false" after open').toBe('false')

        // ─── PHASE 2: KH-MAC-LABEL regression. The panel text must now ────$
        // display "Ctrl/Cmd+1-6" (not "Ctrl+1-6" alone) so Mac users see the
        // binding that already works per `global-shortcuts.ts:78`.
        expect(phase1.text, 'panel must now show "Ctrl/Cmd+1-6" so Mac users see the right binding').toContain(
            'Ctrl/Cmd+1-6'
        )
        expect(
            phase1.text.includes('Ctrl+1-6') && !phase1.text.includes('Ctrl/Cmd+1-6'),
            'panel must NOT show the legacy "Ctrl+1-6"-only label that misled Mac users'
        ).toBe(false)

        // ─── PHASE 3: Close via the panel's own close button. ──────────────$
        // closePanel() now calls panel.remove() (B2 teardown fix 6ad96301) so
        // the panel is unmounted from document.body, not just aria-hidden.
        // The close button is created via `document.createElement('button')`
        // inside `initKeyboardShortcutsHint` (keyboard-help.ts:130), so its
        // click handler is a single `addEventListener('click', closePanel)`
        // at keyboard-help.ts:288 — no Svelte 5 delegation race here.
        // Use a CSS selector for the closeBtn since earlier `getByRole('button', …)`
        // polling at this transition moment had AX-tree refresh latency before
        // the element surfaced in Playwright's accessibility snapshot even when
        // the panel itself was reported `visible` by `getByRole`. CSS selector
        // resolves directly off the DOM, sidestepping the role/AX cache layer.
        const closeBtn = page.locator('#keyboard-hint-panel .kh-close')
        await closeBtn.waitFor({ state: 'attached', timeout: 5000 })
        await closeBtn.click()

        await page.waitForTimeout(300)

        const phase2 = await page.evaluate(() => {
            const p = document.getElementById('keyboard-hint-panel')
            return {
                existsById: !!p,
                inDom: p ? document.body.contains(p) : false,
                visible: p?.classList.contains('visible') ?? false,
                parentNodeName: p?.parentNode ? p.parentNode.nodeName : null
            }
        })
        expect(phase2.visible, 'panel must drop the .visible class after close').toBe(false)
        expect(
            phase2.existsById,
            'panel must not be findable via getElementById after close (B2 teardown fix 6ad96301)'
        ).toBe(false)
        // NOTE: the original `aria-hidden === "true"` assertion is dropped —
        // once closePanel() calls panel.remove(), document.getElementById()
        // returns null so reading the attribute is N/A. The teardown removal
        // itself is the regression-guard being asserted above.

        // ─── PHASE 4 (Wave-3 regression guard KH-HELPBTN-SECOND-CLICK-RACE) ─
        // Second click of `#btn-keyboard-help` after closePanel must RE-OPEN
        // the panel. Pre-fix: capture-phase toggle + Svelte 5 delegated
        // onclick={openKeyboardHelp} double-toggle cancels itself → net no-op
        // → panel remains closed. Post-fix: capture-phase toggle wins via
        // e.stopImmediatePropagation() — Svelte same-element bubble listener is
        // silenced → single toggle → panel reopens.
        // Edge case coverage: FIRST reopen (panel removed by PHASE 3 close) is
        // the post-close path where capture handler early-returns → bubble-phase
        // openKeyboardHelp runs init + toggle to recreate AND open the panel.
        await helpBtn.click()
        // Wait for the panel to be reattached + visible (race-fix path runs
        // synchronous init + openPanel closure, but waitForTimeout allows the
        // microtask to deliver DOM mutation).
        await page.waitForTimeout(300)
        await page.waitForFunction(
            () => {
                const p = document.getElementById('keyboard-hint-panel')
                return !!p && p.classList.contains('visible') && p.getAttribute('aria-hidden') === 'false'
            },
            null,
            { timeout: 10000, polling: 100 }
        )
        const phase4 = await page.evaluate(() => {
            const p = document.getElementById('keyboard-hint-panel')
            return {
                inDom: p ? document.body.contains(p) : false,
                visible: p?.classList.contains('visible') ?? false,
                ariaHidden: p?.getAttribute('aria-hidden') ?? null
            }
        })
        expect(phase4.inDom, 'phase4: panel reattached to document.body after reopen').toBe(true)
        expect(phase4.visible, 'phase4: panel must have the .visible class after second-click reopen').toBe(true)
        expect(phase4.ariaHidden, 'phase4: panel aria-hidden must be "false" after second-click reopen').toBe('false')

        // Click #3 — verify toggle cycle continues to work post-fix. The panel
        // was just opened by phase4; a third click must CLOSE it deterministically
        // (capture-phase wins via stopImmediatePropagation, panel.remove() runs, no
        // Svelte bubble reopen).
        await helpBtn.click()
        await page.waitForTimeout(300)
        const phase5 = await page.evaluate(() => {
            const p = document.getElementById('keyboard-hint-panel')
            return {
                exists: !!p,
                visible: p?.classList.contains('visible') ?? false
            }
        })
        // After closePanel(), panel.remove() detaches — phase5.exists is false.
        expect(phase5.exists, 'phase5: third click must close (detach) the panel').toBe(false)

        // Click #4 — verify third-click reopen also works (single toggle cycle).
        await helpBtn.click()
        await page.waitForTimeout(300)
        await page.waitForFunction(
            () => {
                const p = document.getElementById('keyboard-hint-panel')
                return !!p && p.classList.contains('visible')
            },
            null,
            { timeout: 10000, polling: 100 }
        )
        const phase6 = await page.evaluate(() => {
            const p = document.getElementById('keyboard-hint-panel')
            return {
                inDom: p ? document.body.contains(p) : false,
                visible: p?.classList.contains('visible') ?? false
            }
        })
        expect(phase6.inDom, 'phase6: panel reattached again after third-close + fourth-reopen').toBe(true)
        expect(phase6.visible, 'phase6: panel visible after fourth-click reopen').toBe(true)
    })
})
