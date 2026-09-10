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
                window.__wsSock = this
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
    // Engine-free means no WebGL/engine canvas. #jam-wave is JamView's own
    // 2D waveform visualizer (d29b55d9f) — any OTHER canvas means the
    // explorer engine booted.
    await expect(page.locator('canvas:not(#jam-wave)')).toHaveCount(0)
    const engineAssets = await page.evaluate(() =>
        performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            // jam-engine-*.js is JamView's own Web Audio chain (shared audio
            // context + master analyser tap, d29b55d9f) — legitimate here.
            // Anything else matching three/canvas/engine means the explorer
            // engine booted.
            .filter((name) => /three|canvas|engine/i.test(name) && !/jam-engine/i.test(name))
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
        await page.evaluate(() => document.querySelector('#jam-advanced-toggle').click())
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
        await page.evaluate(() => document.querySelector('#jam-advanced-toggle').click())
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
            timeout: 30000
        })
        const calls = await page.evaluate(() => window.__styleCalls)
        expect(calls.length).toBe(1)
        const body = JSON.parse(calls[0].opts.body)
        expect(body.text).toBe('funky techno')
        await expect(page.locator('.jam-style-anchor')).toContainText('matched: funky')
    })

    test('JAM-7. Style-morph slider sends /style_interp', async ({ page }) => {
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
            window.__interpCalls = []
            const orig = window.fetch
            window.fetch = async (url, opts) => {
                if (typeof url === 'string' && url.includes('/style_interp')) {
                    window.__interpCalls.push({ url, opts })
                    return { ok: true, status: 200 }
                }
                return orig(url, opts)
            }
        })
        // range inputs don't take .fill(); set value + dispatch input event.
        const setMorph = async (v) => {
            await page.evaluate((n) => {
                const el = document.getElementById('jam-morph')
                if (el) {
                    el.value = String(n)
                    el.dispatchEvent(new Event('input', { bubbles: true }))
                }
            }, v)
        }
        await setMorph(0.5)
        await page.waitForTimeout(250)
        await expect(page.locator('#jam-morph-val')).toHaveText('0.60')
        await page.waitForFunction(() => window.__interpCalls && window.__interpCalls.length > 0, {
            timeout: 5000
        })
        const calls = await page.evaluate(() => window.__interpCalls)
        expect(calls.length).toBe(1)
        const body = JSON.parse(calls[0].opts.body)
        expect(body.t).toBe(0.6)
        // Measured poison zone [0.76, 0.80] snaps to the nearest safe edge —
        // 0.78 sits past its midpoint, so it routes to the t=0.82 summit.
        // SINGLE MORPH TRUTH: the thumb always equals the sent value, no
        // lying readout. (Measured 12-point map, closes #224.)
        await setMorph(0.78)
        await page.waitForTimeout(250)
        const calls2 = await page.evaluate(() => window.__interpCalls)
        expect(JSON.parse(calls2[calls2.length - 1].opts.body).t).toBe(0.82)
        await expect(page.locator('#jam-morph-val')).toHaveText('0.82')
    })

    test('JAM-8. Idle surface is pre-configurable; keyboard drives transport and dial', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        // Controls render before connecting (disabled) — the surface is
        // configurable first, play second. Lab dials hide behind Advanced;
        // musician voices + summit stay visible.
        for (const sel of [
            '#jam-voice-summit',
            '#jam-voice-clean',
            '#jam-voice-beat',
            '#jam-advanced-toggle',
            '#jam-prog',
            '#jam-midi',
            '#jam-vocal',
            '#jam-morph',
            '#jam-style'
        ]) {
            await expect(page.locator(sel)).toBeVisible()
        }
        // Lab dials are hidden until Advanced opens.
        await expect(page.locator('#jam-state')).toHaveCount(0)
        await page.evaluate(() => document.querySelector('#jam-advanced-toggle').click())
        await expect(page.locator('#jam-state')).toBeVisible()
        await expect(page.locator('#jam-band')).toBeVisible()
        await expect(page.locator('#jam-frames')).toContainText('0 audio frames')
        // Space starts the radio without a pointer.
        await page.keyboard.press('Space')
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        // Bracket keys step the dial both ways.
        await page.keyboard.press(']')
        await expect(page.locator('#jam-state')).toContainText('5')
        await page.keyboard.press('[')
        await expect(page.locator('#jam-state')).toContainText('4')
        // Space stops it again.
        await page.keyboard.press('Space')
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') !== 'true',
            { timeout: 30000 }
        )
        // Space on the FOCUSED play button must single-toggle both ways —
        // a native keyup-click plus the keydown handler would net to zero.
        await page.evaluate(() => document.querySelector('#jam-play').focus())
        await page.keyboard.press('Space')
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        await page.keyboard.press('Space')
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') !== 'true',
            { timeout: 30000 }
        )
        // Arrow keys step the morph slider (JAM-8b). Values route through
        // the measured-zone clamp: both steps land on the 0.60 lowAnchor
        // (below-span input snaps there), so this pins the clamp routing,
        // not the step direction.
        await page.keyboard.press('ArrowRight')
        await expect(page.locator('#jam-morph-val')).toHaveText('0.60')
        await page.keyboard.press('ArrowLeft')
        await expect(page.locator('#jam-morph-val')).toHaveText('0.60')
        // The waveform canvas is present and renders off the master analyser.
        await expect(page.locator('#jam-wave')).toBeVisible()
        await expect(page.locator('#jam-wave')).toHaveAttribute('width')
    })

    test('JAM-9. Measured preset chips send raw slots at summit state', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        await page.waitForFunction(() => window.__ws.sent.length >= 5, { timeout: 30000 })
        await page.evaluate(() => document.querySelector('#jam-advanced-toggle').click())
        // Mock fetch so the POST is observable without a live jam.
        await page.evaluate(() => {
            window.__maskCalls = []
            const orig = window.fetch
            window.fetch = async (url, opts) => {
                if (typeof url === 'string' && url.includes('/band_mask')) {
                    window.__maskCalls.push({ url, opts })
                    return { ok: true, status: 200 }
                }
                return orig(url, opts)
            }
        })
        // Step off summit first so the preset's state pin is actually proven.
        await page.keyboard.press(']')
        await expect(page.locator('#jam-state')).toContainText('5')
        // Clean-tone preset: raw slots {2,7,11}, dial pinned to summit state.
        await page.evaluate(() => document.querySelector('#jam-preset-clean').click())
        await page.waitForFunction(() => window.__maskCalls && window.__maskCalls.length > 0, {
            timeout: 10000
        })
        const calls = await page.evaluate(() => window.__maskCalls)
        expect(JSON.parse(calls[calls.length - 1].opts.body)).toEqual({ slots: [2, 7, 11] })
        await expect(page.locator('#jam-state')).toContainText('4')
        // Beat preset sends its own raw slots.
        await page.evaluate(() => document.querySelector('#jam-preset-beat').click())
        await page.waitForFunction(() => window.__maskCalls.length >= 2, { timeout: 10000 })
        const calls2 = await page.evaluate(() => window.__maskCalls)
        expect(JSON.parse(calls2[calls2.length - 1].opts.body)).toEqual({ slots: [2, 11, 9] })
    })

    test('JAM-10. Progression editor sends a custom spec; typos stay client-side', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        await page.waitForFunction(() => window.__ws.sent.length >= 5, { timeout: 30000 })
        // Custom spec + tempo go out on the wire verbatim.
        await page.fill('#jam-prog-spec', 'Em 4 | C 4 | G 4 | D 4')
        await page.fill('#jam-prog-bpm', '120')
        await page.evaluate(() => document.querySelector('#jam-prog').click())
        await page.waitForFunction(() => window.__ws.sent.some((m) => m.includes('Em 4 | C 4 | G 4 | D 4')), {
            timeout: 10000
        })
        const sent = await page.evaluate(() => window.__ws.sent)
        const sets = sent.filter((m) => m.includes('"prog_set"'))
        expect(sets.length).toBe(1)
        expect(JSON.parse(sets[0]).bpm).toBe(120)
        // Stop, then a typo: no new prog_set, inline error instead.
        await page.evaluate(() => document.querySelector('#jam-prog').click())
        await page.fill('#jam-prog-spec', 'zzz')
        await page.evaluate(() => document.querySelector('#jam-prog').click())
        await expect(page.locator('.jam-prog-error')).toContainText("Couldn't parse")
        const sent2 = await page.evaluate(() => window.__ws.sent)
        expect(sent2.filter((m) => m.includes('"prog_set"')).length).toBe(1)
    })

    test('JAM-11. Settings survive reload; live with zero frames says so', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        // Configure, then reload: the rig remembers itself.
        await page.fill('#jam-prog-spec', 'Em 4 | C 4 | G 4 | D 4')
        await page.fill('#jam-prog-bpm', '132')
        await page.evaluate(() => document.activeElement?.blur?.())
        await page.keyboard.press(']')
        await page.evaluate(() => document.querySelector('#jam-advanced-toggle').click())
        await expect(page.locator('#jam-state')).toContainText('5')
        await page.reload()
        await page.waitForFunction(() => !!document.querySelector('[data-testid="jam-view"]'), { timeout: 30000 })
        await expect(page.locator('#jam-prog-spec')).toHaveValue('Em 4 | C 4 | G 4 | D 4')
        await expect(page.locator('#jam-prog-bpm')).toHaveValue('132')
        // The dial state survives too — open Advanced to see it.
        await page.evaluate(() => document.querySelector('#jam-advanced-toggle').click())
        await expect(page.locator('#jam-state')).toContainText('5')
        // Connect: the mocked socket never sends audio, so the waiting
        // hint must be visible instead of a silent meter.
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        await expect(page.locator('#jam-waiting')).toBeVisible()
        await expect(page.locator('#jam-frames')).toContainText('0 audio frames')
    })

    test('JAM-12. Mobile viewport has no overflow and stays usable', async ({ page }) => {
        await mockRadio(page)
        await page.setViewportSize({ width: 390, height: 844 })
        await gotoJam(page)
        const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        )
        expect(overflow).toBeLessThanOrEqual(1)
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        await page.evaluate(() => document.querySelector('#jam-advanced-toggle').click())
        for (const sel of ['#jam-preset-clean', '#jam-prog-spec', '#jam-midi', '#jam-vocal', '#jam-morph']) {
            await expect(page.locator(sel)).toBeVisible()
        }
    })

    test('JAM-13. Master volume slider persists across reload', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        await expect(page.locator('#jam-volume')).toBeVisible()
        await page.evaluate(() => {
            const el = document.getElementById('jam-volume')
            if (el) {
                el.value = '0.5'
                el.dispatchEvent(new Event('input', { bubbles: true }))
            }
        })
        await page.reload()
        await page.waitForFunction(() => !!document.querySelector('[data-testid="jam-view"]'), { timeout: 30000 })
        await expect(page.locator('#jam-volume')).toHaveValue('0.5')
    })

    test('JAM-14. Session record produces a downloadable take', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        const supported = await page.evaluate(() => typeof MediaRecorder !== 'undefined')
        test.skip(!supported, 'no MediaRecorder in this browser')
        await expect(page.locator('#jam-record')).toBeVisible()
        await page.evaluate(() => document.querySelector('#jam-record').click())
        await expect(page.locator('#jam-record')).toHaveAttribute('aria-pressed', 'true')
        // Feed real PCM through the app's own message path so the tap has
        // samples to capture (0.1s 440Hz stereo-interleaved int16, x3).
        const pcmB64 = await page.evaluate(() => {
            const n = 4800
            const bytes = new Uint8Array(n * 2)
            const view = new DataView(bytes.buffer)
            for (let i = 0; i < n; i++) {
                view.setInt16(i * 2, Math.floor(12000 * Math.sin((2 * Math.PI * 440 * i) / 48000)), true)
            }
            let bin = ''
            bytes.forEach((b) => {
                bin += String.fromCharCode(b)
            })
            return btoa(bin) // eslint-disable-line no-undef
        })
        await page.evaluate((b64) => {
            const sock = window.__wsSock
            for (let k = 0; k < 3; k++) sock.onmessage({ data: JSON.stringify({ type: 'audio', data: b64 }) })
        }, pcmB64)
        await expect(page.locator('#jam-frames')).toContainText('3 audio frames')
        await page.waitForTimeout(1500)
        await page.evaluate(() => document.querySelector('#jam-record').click())
        await expect(page.locator('#jam-download')).toBeVisible({ timeout: 10000 })
        const href = await page.locator('#jam-download').getAttribute('href')
        expect(href && href.startsWith('blob:')).toBe(true)
    })

    test('JAM-15. Metrics frames render stream health', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        await expect(page.locator('#jam-health')).toHaveCount(0)
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        await page.evaluate(() => {
            window.__wsSock.onmessage({
                data: JSON.stringify({ type: 'metrics', frameMs: 12.5, droppedFrames: 3, bufferAvail: 2, bufferCap: 8 })
            })
        })
        await expect(page.locator('#jam-health')).toBeVisible()
        await expect(page.locator('.jam-health-text')).toContainText('buf 2/8')
        await expect(page.locator('.jam-health-text')).toContainText('3 dropped')
        await expect(page.locator('.jam-health-text')).toContainText('12.5ms/frame')
    })

    test('JAM-16. A stream gone silent surfaces a stall warning', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        // One metrics frame proves the stream was alive, then silence:
        // past the stall threshold the UI must say so.
        await page.evaluate(() => {
            window.__wsSock.onmessage({
                data: JSON.stringify({ type: 'metrics', frameMs: 10, droppedFrames: 0, bufferAvail: 4, bufferCap: 8 })
            })
        })
        await expect(page.locator('#jam-health')).toBeVisible()
        await expect(page.locator('#jam-stalled')).toHaveCount(0)
        await page.waitForTimeout(8500)
        await expect(page.locator('#jam-stalled')).toBeVisible()
    })

    test('JAM-17. Steering failures surface — 409 lease says "another session"', async ({ page }) => {
        await mockRadio(page)
        // The jam server is reachable but holds the measurement lease.
        await page.addInitScript(() => {
            const orig = window.fetch
            window.fetch = async (url, opts) => {
                if (typeof url === 'string' && url.includes('/band_mask')) {
                    return new globalThis.Response(null, { status: 409 })
                }
                return orig(url, opts)
            }
        })
        await gotoJam(page)
        await expect(page.locator('.jam-notice')).toHaveCount(0)
        await page.evaluate(() => document.querySelector('#jam-play').click())
        await page.waitForFunction(
            () => document.querySelector('[data-testid="jam-view"]')?.getAttribute('data-live') === 'true',
            { timeout: 30000 }
        )
        // The connect-time summit mask POST hits 409 — the UI must say so in
        // musician words instead of silently no-oping.
        await expect(page.locator('.jam-notice')).toContainText('Another session owns the live stream', {
            timeout: 10000
        })
    })

    test('JAM-18. Connection screen applies and remembers a server address', async ({ page }) => {
        await mockRadio(page)
        await gotoJam(page)
        await expect(page.locator('#jam-host')).toBeVisible()
        await expect(page.locator('.jam-endpoints')).toContainText('ws://127.0.0.1:8083')
        await page.fill('#jam-host', '192.168.1.20:8083')
        await page.evaluate(() => document.querySelector('#jam-host-apply').click())
        // Endpoints update live; the override survives a reload.
        await expect(page.locator('.jam-endpoints')).toContainText('ws://192.168.1.20:8083')
        await expect(page.locator('.jam-endpoints')).toContainText('http://192.168.1.20:8083')
        await page.reload()
        await page.waitForFunction(() => !!document.querySelector('[data-testid="jam-view"]'), { timeout: 30000 })
        await expect(page.locator('.jam-endpoints')).toContainText('ws://192.168.1.20:8083')
        // Recent hosts offer one-tap return.
        await expect(page.locator('.jam-recent').first()).toContainText('192.168.1.20:8083')
        // Garbage is rejected inline, not applied.
        await page.fill('#jam-host', 'not a host!!')
        await page.evaluate(() => document.querySelector('#jam-host-apply').click())
        await expect(page.locator('.jam-prog-error')).toContainText('doesn’t parse')
        // Reset returns to the default box.
        await page.evaluate(() => document.querySelector('#jam-host-reset').click())
        await expect(page.locator('.jam-endpoints')).toContainText('ws://127.0.0.1:8083')
    })
})
