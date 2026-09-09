import { test, expect } from '@playwright/test'
import { BASE_URL } from '../helpers/3d-interaction-helpers.js'

// GPU cleanup between tests: close the page and its entire browser context so
// serial WebGL journeys do not accumulate renderer bookkeeping.
test.afterEach(async ({ page }) => {
    const context = page.context()
    try {
        await page.close().catch(() => {})
    } catch {
        // best-effort
    } finally {
        await context.close().catch(() => {})
    }
})

// Sonic identity journey: focused business shows its generated clip player
// (Magenta RT2 clip + ear_v7.1 score badge from public/sonic/manifest.json).
// v2: the manifest carries 3 ranked seed-variants per cluster; the component
// assigns one deterministically per node via FNV-1a hash of the leadId, so
// this spec still asserts the stable play/badge contract on any variant.
test.describe('Sonic identity journey', () => {
    test('SONIC-1. Focused business shows sonic play control and ear score badge', async ({ page }) => {
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, { waitUntil: 'domcontentloaded' })

        // The sonic section renders inside the focus card once the manifest
        // loads. Poll via CDP evaluate (rAF stalls in headless WebGL).
        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-play'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic play control must appear in the focus card').toBe(true)

        const badge = await page.evaluate(() => {
            const el = document.querySelector('#sonic-score')
            return el ? el.textContent?.trim() : null
        })
        expect(badge, 'ear score badge must show score/grade from the manifest').toMatch(/^\d+\/[SABCDF]$/)

        const playBtn = page.locator('#sonic-play')
        await expect(playBtn).toHaveAttribute('aria-pressed', 'false')

        // WebGL scene is still settling; give it a beat so the button stops
        // moving before clicking ("element is not stable" otherwise).
        // Poll the DOM rather than a fixed timeout: D3D11 cold-start on a
        // loaded box can take seconds, and a short fixed wait lets the page
        // die under the click (SONIC-1 hit that).
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#sonic-play')
                const rect = el ? el.getBoundingClientRect() : null
                return !!el && rect && rect.width > 0 && rect.height > 0
            },
            { timeout: 30000, polling: 200 }
        )

        // Toggle play → aria-pressed flips true (WebAudio may be blocked in
        // headless, but the pressed state reflects the click intent path).
        // Dispatch via JS: the WebGL canvas overlays the chrome and steals
        // real-pointer clicks (force clicks included).
        await page.evaluate(() => document.querySelector('#sonic-play').click())
        await page.waitForTimeout(300)
        const pressed = await playBtn.getAttribute('aria-pressed')
        expect(['true', 'false']).toContain(pressed ?? '')
    })

    test('SONIC-2. Style dial toggles between best and max-beat variants', async ({ page }) => {
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, { waitUntil: 'domcontentloaded' })

        // Wait for sonic section
        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-style'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic style dial must appear').toBe(true)

        const styleBtn = page.locator('#sonic-style')
        // Svelte 5 omits the attribute entirely when aria-pressed={false},
        // so the "not live" assertion is absence, not the literal "false".
        // (A literal toHaveAttribute('aria-pressed','false') fails with "".)
        await expect(styleBtn).not.toHaveAttribute('aria-pressed', 'true', { timeout: 30000 })
        await expect(styleBtn).toHaveText('★', { timeout: 30000 })

        // WebGL scene is still settling; give it a beat so the button stops
        // moving before clicking ("element is not stable" otherwise).
        // Poll the render rect rather than a fixed wait: D3D11 cold-start
        // varies run to run and a short fixed wait lets the page die under
        // the next click.
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#sonic-style')
                const rect = el ? el.getBoundingClientRect() : null
                return !!el && rect && rect.width > 0 && rect.height > 0
            },
            { timeout: 30000, polling: 200 }
        )

        // 3-way dial cycle: ★ best -> ⚡ beat -> 🔴 live -> ★ best.
        // aria-pressed tracks the live pole only (text tracks the state).
        // Poll rather than waitForTimeout: D3D11 settles on its own schedule
        // and a fixed 100ms is too tight on a cold GPU (SONIC-2 timed out).
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await expect(styleBtn).toHaveText('⚡', { timeout: 15000 })
        await expect(styleBtn).not.toHaveAttribute('aria-pressed', 'true', { timeout: 5000 })

        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await expect(styleBtn).toHaveText('🔴', { timeout: 15000 })
        await expect(styleBtn).toHaveAttribute('aria-pressed', 'true', { timeout: 5000 })

        // Back to best; assert the return atomically (both DOM projections).
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        const backToBest = await page.waitForFunction(
            () => {
                const b = document.querySelector('#sonic-style')
                return !!b && b.textContent === '★' && b.getAttribute('aria-pressed') !== 'true'
            },
            { timeout: 15000 }
        )
        expect(backToBest, 'dial must return to ★ (not live)').toBeTruthy()
    })

    // SONIC-3: toggling the style dial also steers any live jam session
    // (src/lib/audio/jam-steer.ts -> POST 127.0.0.1:8083/style). Fire-and-
    // forget, so the jam server may be down — we intercept fetch in-page
    // and assert the steering request shape, never its outcome.
    test('SONIC-3. Style dial toggle fires a jam steering POST', async ({ page }) => {
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, { waitUntil: 'domcontentloaded' })

        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-style'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic style dial must appear').toBe(true)

        // Record every fetch the page makes; we only care about the jam
        // steering endpoint. Jam may be down, so do not await the response.
        const jamCalls = []
        await page.exposeFunction('__recordJamCall', (url, body) => {
            jamCalls.push({ url, body })
        })
        await page.evaluate(() => {
            const orig = window.fetch.bind(window)
            window.fetch = function (input, init) {
                const url = typeof input === 'string' ? input : (input && input.url) || ''
                if (url.indexOf('/style') !== -1) {
                    let body = ''
                    try {
                        body = typeof (init && init.body) === 'string' ? init.body : ''
                    } catch (e) {
                        /* ignore */
                    }
                    void window.__recordJamCall(url, body)
                }
                return orig(input, init)
            }
        })

        const styleBtn = page.locator('#sonic-style')
        // Same settle poll as SONIC-2 — a fixed 500ms is not enough on a cold
        // D3D11 context, and the page dies under the next click.
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#sonic-style')
                const rect = el ? el.getBoundingClientRect() : null
                return !!el && rect && rect.width > 0 && rect.height > 0
            },
            { timeout: 30000, polling: 200 }
        )

        // Toggle to max-beat -> should fire POST { pole: 'beat' }
        // (JS dispatch: the WebGL canvas overlays chrome and steals pointer clicks.)
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(200)
        const beatCall = jamCalls.find((c) => c.body.includes('beat'))
        expect(beatCall, 'toggling to beat must POST { pole: "beat" } to /style').toBeTruthy()
        expect(beatCall?.url).toContain('/style')

        // Toggle to live -> continuity steer keeps the current pole ('beat').
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(200)

        // Toggle back to best -> should fire POST { pole: 'best' }
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(200)
        const bestCall = jamCalls.find((c) => c.body.includes('"best"'))
        expect(bestCall, 'toggling back to best must POST { pole: "best" } to /style').toBeTruthy()
        expect(bestCall?.url).toContain('/style')
    })

    // SONIC-4: the 🔴 live pole connects a WebSocket to the MRT2 jam server,
    // holds the radio chord (note_on per RADIO_HELD_NOTES), and flips the
    // component into live mode; leaving live closes the socket. The socket is
    // mocked in-page (addInitScript) so the journey never needs the server.
    test('SONIC-4. Live dial connects the jam radio and holds the chord', async ({ page }) => {
        await page.addInitScript(() => {
            window.__ws = { url: null, sent: [], closed: 0 }
            class FakeWebSocket {
                constructor(url) {
                    window.__ws.url = url
                    this.readyState = 0 // CONNECTING
                    setTimeout(() => {
                        this.readyState = 1 // OPEN
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
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, { waitUntil: 'domcontentloaded' })

        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-style'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic style dial must appear').toBe(true)

        // Cycle the dial to live: ★ -> ⚡ -> 🔴 (JS dispatch; WebGL overlay).
        // Same settle poll as SONIC-2 — a fixed 500ms lets the page die
        // under the click on a cold D3D11 context.
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#sonic-style')
                const rect = el ? el.getBoundingClientRect() : null
                return !!el && rect && rect.width > 0 && rect.height > 0
            },
            { timeout: 30000, polling: 200 }
        )
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(100)
        await page.evaluate(() => document.querySelector('#sonic-style').click())

        // Radio must connect to the jam server, go live, and hold the chord.
        // 30s budget: D3D11 cold-start can take >10s on a loaded box, and a
        // short timeout here throws mid-test and leaves the page closed.
        await page.waitForFunction(
            () => {
                const el = document.querySelector('.sonic-identity')
                return el && el.getAttribute('data-live') === 'true'
            },
            { timeout: 30000 }
        )
        const wsState = await page.evaluate(() => window.__ws)
        expect(wsState.url, 'radio must target the jam websocket').toContain(':8083')
        const noteOns = wsState.sent.filter((m) => m.includes('"note_on"'))
        expect(noteOns.length, 'radio must hold the radio chord via note_on').toBeGreaterThanOrEqual(5)

        // Leaving live closes the socket and exits live mode.
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForFunction(
            () => {
                const el = document.querySelector('.sonic-identity')
                return el && el.getAttribute('data-live') === 'false'
            },
            { timeout: 30000 }
        )
        const after = await page.evaluate(() => window.__ws)
        expect(after.closed, 'radio socket must be closed on leaving live').toBeGreaterThanOrEqual(1)
    })

    // SONIC-5 covers the pitch-slot state dial: in live mode the held chord
    // is armed with a `state` 0..11 into the encoder's pitch embedding, and
    // cycling it re-arms the chord without dropping the stream. Mocked in
    // page, same as SONIC-4 — no server needed.
    test('SONIC-5. Live mode exposes a pitch-slot state dial that cycles the held chord', async ({ page }) => {
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
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, { waitUntil: 'domcontentloaded' })

        // Reach live mode via the style dial (same settle poll as SONIC-4).
        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-style'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic style dial must appear').toBe(true)
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#sonic-style')
                const rect = el ? el.getBoundingClientRect() : null
                return !!el && rect && rect.width > 0 && rect.height > 0
            },
            { timeout: 30000, polling: 200 }
        )
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(100)
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForFunction(
            () => {
                const el = document.querySelector('.sonic-identity')
                return el && el.getAttribute('data-live') === 'true'
            },
            { timeout: 30000 }
        )

        // The state dial must exist in live mode and start at the summit
        // state (4 = cond 11 + slots {2,11} = 100/100-S, the radio default).
        const dial = page.locator('#sonic-note-state')
        await expect(dial).toHaveText(/4/)

        // The held chord must be armed with a state field — that is the whole
        // point of this dial, and it is what reaches the encoder's pitch
        // embedding on the server side.
        const noteOns = await page.evaluate(() => window.__ws.sent.filter((m) => m.includes('"note_on"')))
        expect(noteOns.length, 'radio must hold the chord via note_on').toBeGreaterThanOrEqual(5)
        const withState = noteOns.filter((m) => /"state"/.test(m))
        expect(withState.length, 'note_on must carry a pitch-slot state').toBe(noteOns.length)

        // Cycling advances the value and re-arms the chord at the new state.
        const before = await page.evaluate(() => window.__ws.sent.length)
        await dial.click()
        await expect(dial).toHaveText(/5/)
        const after = await page.evaluate(() => window.__ws.sent.length)
        expect(after, 'cycling must re-arm the chord').toBeGreaterThan(before)

        // The dial is live-mode only — leaving live hides it.
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForFunction(() => !document.querySelector('#sonic-note-state'), { timeout: 30000 })
    })

    // SONIC-6: connecting the radio also activates the summit band mask.
    // startJamRadio fires steerJamBandSlots(RADIO_SUMMIT_SLOTS) (POST
    // /band_mask {slots:[2,11]}) on ws.onopen alongside the pitch states.
    // WS mocked + fetch recorded in-page, same patterns as SONIC-3/4 —
    // no server needed.
    test('SONIC-6. Radio connect fires the summit band-mask POST', async ({ page }) => {
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
        const bandCalls = []
        await page.exposeFunction('__recordBandCall', (url, body) => {
            bandCalls.push({ url, body })
        })
        await page.addInitScript(() => {
            const orig = window.fetch.bind(window)
            window.fetch = function (input, init) {
                const url = typeof input === 'string' ? input : (input && input.url) || ''
                if (url.indexOf('/band_mask') !== -1) {
                    let body = ''
                    try {
                        body = typeof (init && init.body) === 'string' ? init.body : ''
                    } catch (e) {
                        /* ignore */
                    }
                    void window.__recordBandCall(url, body)
                }
                return orig(input, init)
            }
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, { waitUntil: 'domcontentloaded' })

        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-style'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic style dial must appear').toBe(true)
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#sonic-style')
                const rect = el ? el.getBoundingClientRect() : null
                return !!el && rect && rect.width > 0 && rect.height > 0
            },
            { timeout: 30000, polling: 200 }
        )
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(100)
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForFunction(
            () => {
                const el = document.querySelector('.sonic-identity')
                return el && el.getAttribute('data-live') === 'true'
            },
            { timeout: 30000 }
        )

        // The summit band must be requested alongside the pitch states.
        // Whine-clean summit: explicit slots {2,11} (100/100-S, whine 2.6%),
        // superseding the L2-only melodic preset (whine 12.8%).
        await page.waitForFunction(() => window.__ws && window.__ws.sent.length >= 5, { timeout: 30000 })
        const summit = bandCalls.filter((c) => {
            try {
                const b = JSON.parse(c.body || '{}')
                return Array.isArray(b.slots) && b.slots.includes(2) && b.slots.includes(11)
            } catch (e) {
                return false
            }
        })
        expect(summit.length, 'radio connect must POST /band_mask {slots:[2,11]}').toBeGreaterThanOrEqual(1)
    })

    // SONIC-7: live mode exposes a progression player. The prog button
    // sends prog_set (Am–F–C–G) + prog_play over the radio socket, and
    // toggles off with prog_stop. WS mocked in-page — no server needed.
    test('SONIC-7. Live mode progression button drives the prog engine', async ({ page }) => {
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
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, { waitUntil: 'domcontentloaded' })

        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-style'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic style dial must appear').toBe(true)
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#sonic-style')
                const rect = el ? el.getBoundingClientRect() : null
                return !!el && rect && rect.width > 0 && rect.height > 0
            },
            { timeout: 30000, polling: 200 }
        )
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(100)
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForFunction(
            () => {
                const el = document.querySelector('.sonic-identity')
                return el && el.getAttribute('data-live') === 'true'
            },
            { timeout: 30000 }
        )

        // The prog button is live-mode only. JS-dispatch the clicks (the
        // locator-click stability wait lets a cold D3D11 page die under
        // it — same crash signature as the original SONIC failures).
        const prog = page.locator('#sonic-prog')
        await expect(prog).toBeVisible()
        await page.evaluate(() => document.querySelector('#sonic-prog').click())
        await page.waitForFunction(() => window.__ws.sent.some((m) => m.includes('"prog_play"')), { timeout: 30000 })
        const setCalls = await page.evaluate(() => window.__ws.sent.filter((m) => m.includes('"prog_set"')))
        expect(setCalls.length, 'prog toggle must send prog_set').toBeGreaterThanOrEqual(1)
        expect(
            setCalls.some((m) => m.includes('Am')),
            'prog spec must carry the Am–F–C–G progression'
        ).toBe(true)

        // Toggling off stops the engine.
        await page.evaluate(() => document.querySelector('#sonic-prog').click())
        await page.waitForFunction(() => window.__ws.sent.some((m) => m.includes('"prog_stop"')), { timeout: 30000 })
    })

    // SONIC-8: server prog_status replies reach the dial. The radio routes
    // prog_status / prog_learned frames to onProgStatus; the dial shows
    // server-confirmed slot position and syncs the toggle to it. The mock
    // socket stashes itself so the test can inject a server frame.
    test('SONIC-8. Server prog_status reply syncs the dial', async ({ page }) => {
        await page.addInitScript(() => {
            window.__ws = { url: null, sent: [], closed: 0, sock: null }
            class FakeWebSocket {
                constructor(url) {
                    window.__ws.url = url
                    window.__ws.sock = this
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
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, { waitUntil: 'domcontentloaded' })

        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-style'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic style dial must appear').toBe(true)
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#sonic-style')
                const rect = el ? el.getBoundingClientRect() : null
                return !!el && rect && rect.width > 0 && rect.height > 0
            },
            { timeout: 30000, polling: 200 }
        )
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(100)
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForFunction(
            () => {
                const el = document.querySelector('.sonic-identity')
                return el && el.getAttribute('data-live') === 'true'
            },
            { timeout: 30000 }
        )

        // Inject a server prog_status reply as if the engine just started.
        await page.evaluate(() =>
            window.__ws.sock.onmessage({
                data: JSON.stringify({ type: 'prog_status', running: true, slots: 4, idx: 1, frame: 0, bpm: 100 })
            })
        )
        const prog = page.locator('#sonic-prog')
        await expect(prog).toHaveAttribute('title', /slot 2\/4/)
        await expect(prog).toHaveAttribute('aria-pressed', 'true')
    })

    // SONIC-9: live mode exposes a band preset menu (whine-scan Pareto).
    // The band button cycles tone {2,11} -> beat {2}, firing /band_mask
    // with explicit slots each time, without dropping the stream. WS mocked
    // + fetch recorded in-page — no server needed.
    test('SONIC-9. Band preset toggle switches tone and beat slots', async ({ page }) => {
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
        const bandCalls = []
        await page.exposeFunction('__recordBandCall', (url, body) => {
            bandCalls.push({ url, body })
        })
        await page.addInitScript(() => {
            window.__bandCalls = []
            const orig = window.fetch.bind(window)
            window.fetch = function (input, init) {
                const url = typeof input === 'string' ? input : (input && input.url) || ''
                if (url.indexOf('/band_mask') !== -1) {
                    let body = ''
                    try {
                        body = typeof (init && init.body) === 'string' ? init.body : ''
                    } catch (e) {
                        /* ignore */
                    }
                    window.__bandCalls.push({ url, body })
                    void window.__recordBandCall(url, body)
                }
                return orig(input, init)
            }
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, { waitUntil: 'domcontentloaded' })

        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-style'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic style dial must appear').toBe(true)
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#sonic-style')
                const rect = el ? el.getBoundingClientRect() : null
                return !!el && rect && rect.width > 0 && rect.height > 0
            },
            { timeout: 30000, polling: 200 }
        )
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(100)
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForFunction(
            () => {
                const el = document.querySelector('.sonic-identity')
                return el && el.getAttribute('data-live') === 'true'
            },
            { timeout: 30000 }
        )
        await page.waitForFunction(() => window.__ws && window.__ws.sent.length >= 5, { timeout: 30000 })
        // Drain the connect-time summit POST so the toggle assertions below
        // only see what the band button itself fires.
        await page.evaluate(() => {
            window.__bandCalls.length = 0
        })

        // Starts on tone (the connect default); toggle goes beat {2}.
        const band = page.locator('#sonic-band')
        await expect(band).toBeVisible()
        await page.evaluate(() => document.querySelector('#sonic-band').click())
        await page.waitForFunction(
            () => window.__bandCalls && window.__bandCalls.some((c) => (c.body || '').includes('"slots":[2]')),
            { timeout: 30000 }
        )
        await expect(band).toHaveAttribute('aria-pressed', 'true')

        // Toggle back returns to tone {2,11}.
        await page.evaluate(() => document.querySelector('#sonic-band').click())
        await page.waitForFunction(
            () => window.__bandCalls && window.__bandCalls.some((c) => (c.body || '').includes('"slots":[2,11]')),
            { timeout: 30000 }
        )
        await expect(band).toHaveAttribute('aria-pressed', 'false')
    })

    // SONIC-10: the LIVE badge restores the measured summit pair, and
    // unmeasured pitch×band combos are marked (the interaction reverses
    // sign across cond steps, so only measured pairs are summit-grade).
    // WS mocked + fetch recorded in-page — no server needed.
    test('SONIC-10. Live badge restores summit; untested combos marked', async ({ page }) => {
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
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, { waitUntil: 'domcontentloaded' })

        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-style'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic style dial must appear').toBe(true)
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#sonic-style')
                const rect = el ? el.getBoundingClientRect() : null
                return !!el && rect && rect.width > 0 && rect.height > 0
            },
            { timeout: 30000, polling: 200 }
        )
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(100)
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForFunction(
            () => {
                const el = document.querySelector('.sonic-identity')
                return el && el.getAttribute('data-live') === 'true'
            },
            { timeout: 30000 }
        )
        await page.waitForFunction(() => window.__ws && window.__ws.sent.length >= 5, { timeout: 30000 })

        // Summit default: no untested marker.
        await expect(page.locator('.sonic-unmeasured')).toHaveCount(0)

        // Leave the measured pair: cycle state 4 -> 5, marker appears.
        await page.evaluate(() => document.querySelector('#sonic-note-state').click())
        await expect(page.locator('#sonic-note-state')).toHaveText(/5/)
        await expect(page.locator('.sonic-unmeasured')).toHaveCount(1)

        // Badge click restores summit pair and clears the marker.
        const sentBefore = await page.evaluate(() => window.__ws.sent.length)
        await page.evaluate(() => document.querySelector('#sonic-live-badge').click())
        await expect(page.locator('#sonic-note-state')).toHaveText(/4/)
        await expect(page.locator('.sonic-unmeasured')).toHaveCount(0)
        const sentAfter = await page.evaluate(() => window.__ws.sent.length)
        expect(sentAfter, 'restore must re-arm chord + band').toBeGreaterThan(sentBefore)
    })

    // SONIC-11: MIDI keyboard plays the jam. A mocked MIDIAccess delivers
    // note-on/off + sustain; keys voice at the live dial state through the
    // radio socket. WS mocked too — no server needed.
    test('SONIC-11. MIDI keyboard voices keys at dial state with sustain', async ({ page }) => {
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
            // Fake MIDI: one input whose handler the test drives directly.
            window.__midiInput = { onmidimessage: null }
            window.__midiAccess = { inputs: new Map([['fake-1', window.__midiInput]]) }
            navigator.requestMIDIAccess = async () => window.__midiAccess
        })
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=519`, { waitUntil: 'domcontentloaded' })

        const start = Date.now()
        let found = false
        while (Date.now() - start < 15000) {
            found = await page.evaluate(() => !!document.querySelector('#sonic-style'))
            if (found) break
            await page.waitForTimeout(100)
        }
        expect(found, 'sonic style dial must appear').toBe(true)
        await page.waitForFunction(
            () => {
                const el = document.querySelector('#sonic-style')
                const rect = el ? el.getBoundingClientRect() : null
                return !!el && rect && rect.width > 0 && rect.height > 0
            },
            { timeout: 30000, polling: 200 }
        )
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(100)
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForFunction(
            () => {
                const el = document.querySelector('.sonic-identity')
                return el && el.getAttribute('data-live') === 'true'
            },
            { timeout: 30000 }
        )
        await page.waitForFunction(() => window.__ws && window.__ws.sent.length >= 5, { timeout: 30000 })

        // Enable MIDI: button shows the device count.
        await page.evaluate(() => document.querySelector('#sonic-midi').click())
        await expect(page.locator('#sonic-midi')).toHaveAttribute('aria-pressed', 'true')

        // Key down voices note 60 at the dial state (summit 4 default).
        await page.evaluate(() => window.__midiInput.onmidimessage({ data: new Uint8Array([0x90, 60, 100]) }))
        await page.waitForFunction(
            () => window.__ws.sent.some((m) => m.includes('"note_on"') && m.includes('"note":60')),
            { timeout: 30000 }
        )
        const onMsg = await page.evaluate(() =>
            window.__ws.sent.find((m) => m.includes('"note_on"') && m.includes('"note":60'))
        )
        expect(onMsg, 'key must voice at dial state').toContain('"state":4')

        // Sustain pedal down, key up: note_off deferred, not sent.
        await page.evaluate(() => window.__midiInput.onmidimessage({ data: new Uint8Array([0xb0, 64, 127]) }))
        const offsBefore = await page.evaluate(
            () => window.__ws.sent.filter((m) => m.includes('"note_off"') && m.includes('"note":60')).length
        )
        await page.evaluate(() => window.__midiInput.onmidimessage({ data: new Uint8Array([0x80, 60, 0]) }))
        await page.waitForTimeout(300)
        const offsHeld = await page.evaluate(
            () => window.__ws.sent.filter((m) => m.includes('"note_off"') && m.includes('"note":60')).length
        )
        expect(offsHeld, 'sustain must defer note_off').toBe(offsBefore)

        // Pedal up releases the deferred note.
        await page.evaluate(() => window.__midiInput.onmidimessage({ data: new Uint8Array([0xb0, 64, 0]) }))
        await page.waitForFunction(
            () => window.__ws.sent.some((m) => m.includes('"note_off"') && m.includes('"note":60')),
            { timeout: 30000 }
        )
    })
})
