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

async function gotoJam(page, query = 'jam=1') {
    await page.goto(`${BASE_URL}/dist/svelte/index.html?${query}&nodemo=1`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !!document.querySelector('[data-testid="jam-view"]'), { timeout: 30000 })
    await expect(page.locator('#semantic-explorer')).toHaveCount(0)
    await expect(page.locator('canvas')).toHaveCount(0)
    const engineAssets = await page.evaluate(() =>
        performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((name) => /three|canvas|engine/i.test(name))
    )
    expect(engineAssets, 'JamView must not fetch the explorer engine').toEqual([])
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

    test('JAM-1b. view=jam is the same engine-free surface', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page, 'view=jam')
        await expect(page.getByTestId('jam-view')).toBeVisible()
        await expect(page.locator('#jam-play')).toBeVisible()
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

    test('JAM-5. Denied microphone keeps the jam usable', async ({ page }) => {
        await mockRadio(page)
        await page.addInitScript(() => {
            const denied = () => Promise.reject(new Error('permission denied'))
            const media = navigator.mediaDevices
            if (media) {
                Object.defineProperty(media, 'getUserMedia', { configurable: true, value: denied })
            } else {
                Object.defineProperty(navigator, 'mediaDevices', {
                    configurable: true,
                    value: { getUserMedia: denied }
                })
            }
        })
        await gotoJam(page)
        await page.locator('#jam-play').click()
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        await expect(page.locator('#jam-vocal')).toBeVisible()
        await page.locator('#jam-vocal').click()
        await expect(page.locator('#jam-vocal')).toHaveAttribute('aria-label', 'Microphone unavailable')
        await expect(page.locator('#jam-play')).toBeVisible()
    })

    test('JAM-6. Text vibe input sends /style_text', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        await page.waitForFunction(() => window.__ws.sent.length >= 5, { timeout: 30000 })
        // Mock fetch so the POST is observable without a live jam.
        await page.evaluate(() => {
            window.__styleCalls = []
            const orig = window.fetch
            window.fetch = async (url, opts) => {
                if (typeof url === 'string' && url.includes('/style_text')) {
                    window.__styleCalls.push({ url, opts })
                    return { ok: true, status: 200, json: async () => ({ ok: true, anchor: 'funky' }) }
                }
                return orig(url, opts)
            }
        })
        await page.fill('#jam-style', 'funky techno')
        await page.evaluate(() => document.querySelector('#jam-style-send').click())
        await page.waitForFunction(() => window.__styleCalls && window.__styleCalls.length > 0, {
            timeout: 30000,
        })
        const calls = await page.evaluate(() => window.__styleCalls)
        expect(calls.length).toBe(1)
        const body = JSON.parse(calls[0].opts.body)
        expect(body.text).toBe('funky techno')
        await expect(page.locator('.jam-style-anchor')).toContainText('matched: funky')
    })
})
