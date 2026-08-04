/**
 * deep-link-focus-card-hit-journey.spec.js
 *
 * Regression coverage for the deep-link focus card hit-testing bug (2026-08-04):
 * opening a shared business link (`?record=<lead_id>`) boots the focus card, but
 * the focus transition could leave `focusTransitionMode` stuck at `entering`
 * (parity never returned to idle after the settle timer), and on top of that the
 * repo's known serial-GPU-rAF stalls (headless SwiftShader) break locator-click
 * actionability for the focus card's "View on Map" button.
 *
 * The state-machine fix ensures `focusTransitionMode` returns to 'idle' after the
 * settle window. This spec proves the button stays clickable (real coordinate
 * click, CDP-channel polling per tests/widget-journey.spec.js `pollFor`) and that
 * clicking it flips the app to the map view.
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://[::1]:5173'
const DEEP_LINK_URL = `${BASE_URL}/?view=galaxy&q=coffee&record=519&nodemo=1`

const SEMANTIC_HEALTH_STUB = {
    ok: true,
    state: 'healthy',
    provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
}

// CDP-channel polling: page.evaluate + waitForTimeout on fixed interval, immune
// to the headless WebGL rAF stalls documented in tests/widget-journey.spec.js.
async function pollFor(page, predicate, timeoutMs, intervalMs = 100) {
    const start = Date.now()
    for (;;) {
        const v = await page.evaluate(predicate).catch(() => false)
        if (v) return true
        if (Date.now() - start > timeoutMs) return false
        await page.waitForTimeout(intervalMs)
    }
}

test.beforeEach(async ({ page }) => {
    await page.route('**/api.php?action=semantic_lane_health**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEMANTIC_HEALTH_STUB) })
    )
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
        window.__PLAYWRIGHT__ = true
        try {
            localStorage.setItem('moco_onboarding_v1', JSON.stringify({ seen: true, seenAt: new Date().toISOString() }))
            sessionStorage.setItem(
                'moco_mycelium_demo_session_v1',
                JSON.stringify({ seen: true, seenAt: new Date().toISOString() })
            )
        } catch {
            /* localStorage may be unavailable */
        }
    })
})

test('?record deep link: focus card mounts, settles to idle, and its action button stays clickable', async ({
    page
}) => {
    const consoleErrors = []
    page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 160))
    })

    await page.goto(DEEP_LINK_URL, { waitUntil: 'domcontentloaded' })

    // 1. The focus card must mount (local dataset, so record=519 resolves to an
    //    index even without network stubs). The mount can be delayed by serial
    //    GPU stalls in headless — poll on the CDP channel instead of relying on
    //    rAF-driven waitForFunction.
    const cardMounted = await pollFor(
        page,
        () => !!document.querySelector('#focus-card-selected, #fc-card-selected'),
        30000
    )
    expect(cardMounted, 'focus card must mount from the deep link').toBe(true)

    // 2. The focus transition must settle back to idle (the regression: parity's
    //    focus-transition-* class and data-focus-transition used to stay stuck at
    //    'entering' forever after the deep-link focus pass).
    const settledIdle = await pollFor(
        page,
        () => {
            const cls = document.body.className
            const entering = cls.includes('focus-transition-entering') || cls.includes('phase-arriving')
            return !entering && document.body.dataset.focusTransition === 'idle'
        },
        30000
    )
    expect(
        settledIdle,
        `focusTransition should settle to idle (data=${JSON.stringify({
            trans: undefined,
            cls: undefined
        })} — see lastState)`
    ).toBe(true)

    // 3. The "View on Map" button must be clickable and flip the view. Use real
    //    coordinate clicks (per W54 pattern) and re-poll the view itself across
    //    subsequent dead frames rather than trusting a single click.
    const btn = page.locator('#fc-btn-selected-map')
    expect(await btn.count(), 'View on Map button present').toBeGreaterThan(0)

    let clicked = false
    for (let i = 0; i < 10 && !clicked; i++) {
        const box = await btn.boundingBox().catch(() => null)
        if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
            clicked = await pollFor(
                page,
                () => {
                    const st = window.__APP_STATE__ ?? window.__TEST_STATE__
                    return (
                        document.body.dataset.activeView === 'map' ||
                        (st && (st.navState?.currentView === 'map' || st.currentView === 'map'))
                    )
                },
                8000
            )
        }
        if (!clicked) await page.waitForTimeout(4000)
    }

    expect(consoleErrors, 'should not accumulate page errors').toEqual([])
    expect(clicked, 'View on Map click should flip the app to the map view').toBe(true)
})
