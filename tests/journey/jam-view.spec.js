/**
 * JamView journey: the standalone live-jam surface (?jam=1).
 *
 * Unlike sonic.spec.js (dial inside the explorer focus panel), this covers
 * the full-screen music app: transport, state dial, band/prog/MIDI/vocal
 * controls, summit restore. No WebGL boots here — JamView mounts instead
 * of the engine-gated shell. WS + fetch mocked in-page; no server needed.
 */
import { test, expect } from '@playwright/test'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8841'

async function mockRadio(page) {
    await page.addInitScript(() => {
        window.__ws = { url: null, sent: [], closed: 0 }
        class FakeWebSocket {
            constructor(url) {
                window.__ws.url = url
                this.readyState = 0
                setTimeout(() => {
                    this.readyState = 1
                    if (this.onopen) this.onopen()
                }, 10)
            }
            send(data) {
                window.__ws.sent.push(String(data))
            }
            close() {
                window.__ws.closed += 1
                this.readyState = 3
            }
        }
        FakeWebSocket.OPEN = 1
        window.WebSocket = FakeWebSocket
    })
}

async function gotoJam(page) {
    await page.goto(`${BASE_URL}/dist/svelte/index.html?jam=1&nodemo=1`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!document.querySelector('[data-testid="jam-view"]'), { timeout: 30000 })
}

test.describe('Jam view', () => {
    test('JAM-1. Standalone surface renders transport and dial', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        await expect(page.locator('#jam-play')).toBeVisible()
        await expect(page.locator('.jam-title')).toContainText('Live Jam')
        // Idle state asks for play.
        await expect(page.locator('.jam-status')).toContainText('Radio idle')
    })

    test('JAM-2. Play connects the radio at summit defaults', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => {
                const el = document.querySelector('[data-testid="jam-view"]')
                return el && el.getAttribute('data-live') === 'true'
            },
            { timeout: 30000 }
        )
        const sent = await page.evaluate(() => window.__ws.sent)
        const noteOns = sent.filter((m) => m.includes('"note_on"'))
        expect(noteOns.length, 'radio must hold the chord').toBeGreaterThanOrEqual(5)
        expect(
            noteOns.every((m) => m.includes('"state":4')),
            'chord armed at summit state'
        ).toBe(true)
        // Summit pair: no untested marker.
        await expect(page.locator('.jam-unmeasured')).toHaveCount(0)
    })

    test('JAM-3. State dial cycles and marks untested combos', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        await page.evaluate(() => document.querySelector('#jam-state').click())
        await expect(page.locator('#jam-state')).toContainText('5')
        await expect(page.locator('.jam-unmeasured')).toHaveCount(1)
        // Summit restore returns to the measured pair.
        await page.evaluate(() => document.querySelector('#jam-summit').click())
        await expect(page.locator('#jam-state')).toContainText('4')
        await expect(page.locator('.jam-unmeasured')).toHaveCount(0)
    })

    test('JAM-4. Band and prog toggles send the right messages', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        await page.waitForFunction(() => window.__ws.sent.length >= 5, { timeout: 30000 })
        // Band toggle flips the preset UI (the POST shape itself is covered
        // by SONIC-6/9 against the shared steer functions).
        await page.evaluate(() => document.querySelector('#jam-band').click())
        await expect(page.locator('#jam-band')).toHaveAttribute('aria-pressed', 'true')
        await page.evaluate(() => document.querySelector('#jam-prog').click())
        await page.waitForFunction(() => window.__ws.sent.some((m) => m.includes('"prog_play"')), {
            timeout: 30000
        })
        const msgs = await page.evaluate(() => window.__ws.sent)
        expect(
            msgs.some((m) => m.includes('"prog_set"')),
            'prog toggle sends prog_set'
        ).toBe(true)
    })
})
