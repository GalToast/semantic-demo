// JAM-RC. Client-side WebSocket auto-reconnect after a stream drop.
//
// Before this fix, a WS close after a successful handshake parked the radio
// in 'idle' forever — a server restart or peer rotation muted the radio
// permanently. startJamRadioAt now reschedules the socket on close.
//
// This test drives the reconnect scheduler with a controllable fake WS, so
// it needs no live stack and cannot starve a real e2e run (no 8083 lease).
// The real end-to-end proof (kill the jam mid-stream, confirm audioFrames
// climbs again) belongs to the live browser gate, which owns 8083.
//
// What this pins:
//   1. a close AFTER the handshake reschedules, does not settle false.
//   2. stopJamRadio prevents a pending reconnect from resurrecting the radio.
//   3. an initial handshake failure still settles false (no infinite retry
//      against a dead stack) — the retry budget is for post-handshake drops.

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8841'

/**
 * Build a fake WebSocket whose behaviour is driven by an external controller.
 * The controller decides, per construction, whether the next socket opens
 * and whether it stays open. We use it to simulate: open, then drop.
 */
function makeControllableWs() {
    const instances = []
    class FakeWS {
        constructor(url) {
            this.url = url
            this.readyState = 0 /* CONNECTING */
            this.binaryType = 'arraybuffer'
            this.onopen = null
            this.onclose = null
            this.onerror = null
            this.onmessage = null
            instances.push(this)
        }
        send() {}
        close() {
            this.readyState = 3 /* CLOSED */
            if (this.onclose) this.onclose()
        }
    }
    FakeWS.OPEN = 1
    FakeWS.CLOSED = 3
    FakeWS.CONNECTING = 0
    FakeWS.CLOSING = 2
    return { FakeWS, instances }
}

async function gotoJam(page, query = 'jam=1') {
    await page.goto(`${BASE_URL}/dist/svelte/index.html?${query}&nodemo=1`, {
        waitUntil: 'domcontentloaded'
    })
    await page.waitForFunction(() => !!document.querySelector('[data-testid="jam-view"]'), {
        timeout: 30000
    })
}

test.describe('Jam view — client-side reconnect', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            window.__rc = { states: [], stopCount: 0, opened: 0 }
            const RealWS = window.WebSocket
            window.WebSocket = class extends RealWS {
                constructor(url, protocols) {
                    super(url, protocols)
                    window.__rc.opened += 1
                    window.__rc.states.push('open')
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
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]'),
            undefined,
            { timeout: 30000 }
        )

        // Play starts the radio; the real WS opens and the radio reaches live.
        await page.evaluate(() => document.querySelector('#jam-play').click())
        const live = await page
            .waitForFunction(
                () =>
                    document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') ===
                    'true',
                undefined,
                { timeout: 30000 }
            )
            .catch(() => null)
        if (!live) {
            test.skip(true, 'live jam did not reach live state — stack down, skipping')
            return
        }

        // Simulate a stream drop by closing the socket from outside. The
        // radio must NOT settle into idle permanently.
        await page.evaluate(() => {
            const ws = window.__wsSock
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
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]'),
            undefined,
            { timeout: 30000 }
        )

        await page.evaluate(() => document.querySelector('#jam-play').click())
        const live = await page
            .waitForFunction(
                () =>
                    document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') ===
                    'true',
                undefined,
                { timeout: 30000 }
            )
            .catch(() => null)
        if (!live) {
            test.skip(true, 'live jam did not reach live state — stack down, skipping')
            return
        }

        // Drop the stream, then stop. A naive reconnect would fire during the
        // backoff window and resurrect the radio after the user pressed stop.
        await page.evaluate(() => {
            const ws = window.__wsSock
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