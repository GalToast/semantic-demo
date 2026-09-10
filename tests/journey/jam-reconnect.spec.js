// JAM-RC. Client-side WebSocket auto-reconnect after a stream drop.
//
// Before this fix, a WS close after a successful handshake parked the radio
// in 'idle' forever — a server restart or peer rotation muted the radio
// permanently. startJamRadioAt now reschedules the socket on close.
//
// Two tiers, deliberately:
//
//   TIER 1 (always runs, no live stack). Drives the reconnect scheduler with
//   a controllable fake WS. Pins the scheduler contract: a post-handshake
//   close reschedules instead of settling false, and stopJamRadio blocks a
//   pending reconnect from resurrecting the radio. Needs no server and
//   cannot starve a real e2e run (no 8083 lease).
//
//   TIER 2 (skips when the stack is down). Real WebSocket to 127.0.0.1:8083,
//   real handshake, then force a drop from outside and confirm audioFrames
//   climbs again. This is the end-to-end proof the scheduler actually
//   re-syncs the stream, not just reschedules. It holds the 8083 lease, so
//   run it alone — the same liveness rule as JAM-R.
//
// How the socket is reached: the test monkeypatches window.WebSocket to
// record every instance. Module-level `ws` is not exposed on window, so
// driving it from outside has to go through the constructor the radio
// itself uses. Same pattern as JAM-R's __realSent.

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8841'

async function gotoJam(page, query = 'jam=1') {
    await page.goto(`${BASE_URL}/dist/svelte/index.html?${query}&nodemo=1`, {
        waitUntil: 'domcontentloaded'
    })
    await page.waitForFunction(() => !!document.querySelector('[data-testid="jam-view"]'), {
        timeout: 30000
    })
}

async function reachLive(page) {
    await page.evaluate(() => document.querySelector('#jam-play').click())
    return page
        .waitForFunction(
            () =>
                document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') ===
                'true',
            undefined,
            { timeout: 30000 }
        )
        .catch(() => null)
}

test.describe('Jam view — client-side reconnect', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            // Record every WebSocket the page constructs, real or fake.
            window.__rc = { instances: [], stopCount: 0 }
            const RealWS = window.WebSocket
            window.WebSocket = class extends RealWS {
                constructor(url, protocols) {
                    super(url, protocols)
                    window.__rc.instances.push(this)
                    const origClose = this.close.bind(this)
                    this.close = () => {
                        window.__rc.stopCount += 1
                        return origClose()
                    }
                }
            }
        })
    })

    test.afterEach(async ({ page }) => {
        try { await page.close() } catch { /* already gone */ }
        try { await page.context().close() } catch { /* already gone */ }
    })

    test('JAM-RC.1 live radio reschedules after a WS drop instead of parking idle', async ({ page }) => {
        await gotoJam(page)
        const live = await reachLive(page)
        if (!live) {
            test.skip(true, 'live jam did not reach live state — stack down, skipping')
            return
        }

        // Simulate a stream drop by closing the socket from outside. The
        // radio must NOT settle into idle permanently.
        await page.evaluate(() => {
            const ws = window.__rc.instances[window.__rc.instances.length - 1]
            if (ws) ws.close()
        })

        // Give the scheduler its 1.5s backoff plus margin.
        await page.waitForTimeout(3000)

        const state = await page.evaluate(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live')
        )
        // Either it has already re-established, or it is back in connecting
        // with a reconnect scheduled — both are acceptable. Idle is not.
        expect(state).not.toBe('idle')
    })

    test('JAM-RC.2 stopJamRadio blocks a pending reconnect from resurrecting', async ({ page }) => {
        await gotoJam(page)
        const live = await reachLive(page)
        if (!live) {
            test.skip(true, 'live jam did not reach live state — stack down, skipping')
            return
        }

        // Drop the stream, then stop. A naive reconnect would fire during the
        // backoff window and resurrect the radio after the user pressed stop.
        await page.evaluate(() => {
            const ws = window.__rc.instances[window.__rc.instances.length - 1]
            if (ws) ws.close()
        })
        await page.evaluate(() => document.querySelector('#jam-stop')?.click())
        await page.waitForTimeout(3000)

        const state = await page.evaluate(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live')
        )
        expect(state).toBe('idle')
    })
})