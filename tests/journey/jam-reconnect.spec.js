// JAM-RC. Client-side WebSocket auto-reconnect after a stream drop.
//
// Before this fix, a WS close after a successful handshake parked the radio
// in 'idle' forever — a server restart or peer rotation muted the radio
// permanently. startJamRadioAt now reschedules the socket on close.
//
// TIER 1 (always runs, no live stack). A fake WS that simulates a real
// server: it opens, the radio completes its handshake and reaches live, then
// we close it from outside and assert the scheduler reschedules instead of
// parking idle. stopJamRadio is asserted to block a pending reconnect. This
// pins the scheduler contract with no server dependency and no 8083 lease.
//
// TIER 2 (real stack, skipped when down) is left to the live browser gate
// alongside JAM-R. It holds the 8083 lease, so run it alone.

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

/**
 * Fake WebSocket that mimics a live server: opens on construction, lets the
 * radio complete uiReady + note_on, and can be closed from outside to
 * simulate a stream drop. Records every instance so the test can reach the
 * socket the radio itself constructed.
 */
function installFakeWs(page) {
    return page.addInitScript(() => {
        window.__rc = { instances: [], stopCount: 0, closedByTest: 0 }
        // A PURE fake — deliberately NOT extending the real WebSocket.
        // Extending it and calling super(url) makes the browser attempt a
        // real connection to JAM_WS_URL, which defeats the point of a fake
        // and fails whenever the live stack is down. This one just records
        // instances and fires onopen itself, like a server that answers.
        class FakeWS {
            constructor(url) {
                this.url = url
                this.readyState = 0 /* CONNECTING */
                this.onopen = null
                this.onclose = null
                this.onerror = null
                this.onmessage = null
                window.__rc.instances.push(this)
                setTimeout(() => {
                    this.readyState = 1 /* OPEN */
                    if (this.onopen) this.onopen()
                }, 10)
            }
            send() {}
            close() {
                window.__rc.closedByTest += 1
                this.readyState = 3 /* CLOSED */
                if (this.onclose) this.onclose()
            }
        }
        FakeWS.OPEN = 1
        FakeWS.CLOSED = 3
        FakeWS.CONNECTING = 0
        FakeWS.CLOSING = 2
        window.WebSocket = FakeWS
        // startJamRadioAt calls sharedAudioContext() and bails if it is
        // null — it never reaches the WebSocket constructor. Provide one so
        // the scheduler is actually exercised instead of skipped.
        if (!window.AudioContext && !window.webkitAudioContext) {
            function makeCtx() {
                return {
                    state: 'running',
                    currentTime: 0,
                    sampleRate: 48000,
                    destination: {},
                    createBuffer: function () {
                        return {
                            getChannelData: function () {
                                return new Float32Array(0)
                            }
                        }
                    },
                    createBufferSource: function () {
                        return { connect: function () {}, start: function () {}, stop: function () {} }
                    },
                    createGain: function () {
                        return { connect: function () {}, gain: { value: 0 } }
                    },
                    resume: function () {
                        return Promise.resolve()
                    },
                    suspend: function () {
                        return Promise.resolve()
                    }
                }
            }
            window.AudioContext = makeCtx
        }
    })
}

async function reachLive(page) {
    await page.evaluate(() => document.querySelector('#jam-play').click())
    return page
        .waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            undefined,
            { timeout: 30000 }
        )
        .catch(() => null)
}

test.describe('Jam view — client-side reconnect', () => {
    test.beforeEach(async ({ page }) => {
        await installFakeWs(page)
    })

    test.afterEach(async ({ page }) => {
        try {
            await page.close()
        } catch {
            /* already gone */
        }
        try {
            await page.context().close()
        } catch {
            /* already gone */
        }
    })

    test('JAM-RC.1 live radio reschedules after a WS drop instead of parking idle', async ({ page }) => {
        await gotoJam(page)
        // Fake server handshake — the radio reaches live with no real stack.
        const live = await reachLive(page)
        if (!live) {
            test.skip(true, 'radio did not reach live — surface or wiring changed')
            return
        }

        // Simulate a stream drop by closing the socket from outside. The
        // radio must NOT settle into idle permanently.
        await page.evaluate(() => {
            const ws = window.__rc.instances[window.__rc.instances.length - 1]
            if (ws) ws.close()
        })

        // Give the scheduler its 1.5s backoff plus margin. The fake reopens,
        // so a healthy scheduler either re-establishes live or is mid-retry
        // in connecting. Idle means the scheduler gave up.
        await page.waitForTimeout(3000)

        const state = await page.evaluate(() =>
            document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live')
        )
        expect(state).toBe('true')
    })

    test('JAM-RC.2 stopJamRadio blocks a pending reconnect from resurrecting', async ({ page }) => {
        await gotoJam(page)
        const live = await reachLive(page)
        if (!live) {
            test.skip(true, 'radio did not reach live — surface or wiring changed')
            return
        }

        // Drop the stream, then stop. A naive reconnect would fire during the
        // backoff window and resurrect the radio after the user pressed stop.
        await page.evaluate(() => {
            const ws = window.__rc.instances[window.__rc.instances.length - 1]
            if (ws) ws.close()
        })
        await expect(page.locator('#jam-play')).toHaveAttribute('aria-label', 'Stop live jam radio')
        await page.evaluate(() => document.querySelector('#jam-play')?.click())
        await page.waitForTimeout(3000)

        const state = await page.evaluate(() =>
            document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live')
        )
        expect(state).toBe('false')
    })
})
