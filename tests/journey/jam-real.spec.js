// JAM-R. Real-WebSocket path against the live jam (8083).
//
// Every JAM-1..7 test calls mockRadio(), which swaps window.WebSocket for a
// fake that records sends and never connects. Those tests pin the CLIENT
// contract — the messages the radio sends, the fetch shapes, the DOM. They
// never prove the real server accepts them.
//
// This test does: real WebSocket to 127.0.0.1:8083, real handshake, real
// uiReady + note_on, and verifies the server streams audio back. It needs
// the live stack (LM 8796 + decode 8797 + jam 8083) and skips cleanly when
// any of them is down, so it is safe to run in any environment.

import { test, expect } from '@playwright/test'

const TEST_BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8841'

test.describe('Jam view — real WebSocket path', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            // Record every real WebSocket message the page sends.
            window.__realSent = []
            const RealWS = window.WebSocket
            window.WebSocket = class extends RealWS {
                constructor(url, protocols) {
                    super(url, protocols)
                    const orig = this.send.bind(this)
                    this.send = (data) => {
                        window.__realSent.push(typeof data === 'string' ? data : '[blob]')
                        return orig(data)
                    }
                }
            }
        })
    })

    test.afterEach(async ({ page }) => {
        try { await page.close() } catch { /* already gone */ }
        try { await page.context().close() } catch { /* already gone */ }
    })

    test('JAM-R. Real handshake + note_on + audio stream from the live jam', async ({ page }) => {
        // Skip if the live stack is not up — this test is environment-gated.
        const up = await page.evaluate(async () => {
            try {
                const r = await fetch('http://127.0.0.1:8083/', { method: 'GET' })
                return r.ok
            } catch {
                return false
            }
        })
        if (!up) {
            test.skip(true, 'live jam (8083) is not up — skipping real-WS test')
            return
        }

        await page.goto(`${TEST_BASE_URL}/dist/svelte/index.html?jam=1`, { waitUntil: 'domcontentloaded' })
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]'),
            { timeout: 30000 }
        )

        // Expose an audio-frame counter on the window before connecting, so
        // the real server's stream is observable without touching the graph.
        await page.evaluate(() => { window.__audioFrames = 0 })

        // Play connects the radio at summit defaults (state 4 + tone band).
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        await page.waitForFunction(() => window.__realSent.length >= 2, { timeout: 30000 })

        const sent = await page.evaluate(() => window.__realSent)
        expect(sent.some((m) => m.includes('"uiReady"')), 'radio must send uiReady').toBe(true)
        expect(
            sent.some((m) => m.includes('"note_on"') && m.includes('"state":4')),
            'radio must hold the summit chord at state 4'
        ).toBe(true)

        // The server streams audio frames back. JAM-R's whole point: prove
        // the real server answers the real client, not a mock.
        await page.waitForFunction(
            () => (window.__audioFrames || 0) > 0,
            { timeout: 30000 }
        )
        const audioFrames = await page.evaluate(() => window.__audioFrames || 0)
        console.log(`[JAM-R] audio frames received: ${audioFrames}`)
        expect(audioFrames, 'the live jam must stream at least one audio frame').toBeGreaterThan(0)
        expect(sent.length, 'radio must send at least uiReady + chord').toBeGreaterThanOrEqual(2)
    })
})
