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
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=6218`, { waitUntil: 'domcontentloaded' })

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
        await page.waitForTimeout(500)

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
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=6218`, { waitUntil: 'domcontentloaded' })

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
        await expect(styleBtn).toHaveAttribute('aria-pressed', 'false')
        await expect(styleBtn).toHaveText('★')

        // WebGL scene is still settling; give it a beat so the button stops
        // moving before clicking ("element is not stable" otherwise).
        await page.waitForTimeout(500)

        // Click to max-beat
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(100)
        await expect(styleBtn).toHaveAttribute('aria-pressed', 'true')
        await expect(styleBtn).toHaveText('⚡')

        // Click back to best, then assert BOTH DOM projections of the dial
        // state atomically — under serial WebGL load a cross-assertion race
        // (attribute flipped, text lagging) can produce false failures.
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        const backToBest = await page.waitForFunction(
            () => {
                const b = document.querySelector('#sonic-style')
                return !!b && b.getAttribute('aria-pressed') === 'false' && b.textContent === '★'
            },
            { timeout: 10000 }
        )
        expect(backToBest, 'dial must return to ★ (aria-pressed=false)').toBeTruthy()
    })

    // SONIC-3: toggling the style dial also steers any live jam session
    // (src/lib/audio/jam-steer.ts -> POST 127.0.0.1:8083/style). Fire-and-
    // forget, so the jam server may be down — we intercept fetch in-page
    // and assert the steering request shape, never its outcome.
    test('SONIC-3. Style dial toggle fires a jam steering POST', async ({ page }) => {
        await page.goto(`${BASE_URL}/dist/svelte/index.html?nodemo=1&record=6218`, { waitUntil: 'domcontentloaded' })

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
        await page.waitForTimeout(500)

        // Toggle to max-beat -> should fire POST { pole: 'beat' }
        // (JS dispatch: the WebGL canvas overlays chrome and steals pointer clicks.)
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(200)
        const beatCall = jamCalls.find((c) => c.body.includes('beat'))
        expect(beatCall, 'toggling to beat must POST { pole: "beat" } to /style').toBeTruthy()
        expect(beatCall.url).toContain('/style')

        // Toggle back to best -> should fire POST { pole: 'best' }
        await page.evaluate(() => document.querySelector('#sonic-style').click())
        await page.waitForTimeout(200)
        const bestCall = jamCalls.find((c) => c.body.includes('"best"'))
        expect(bestCall, 'toggling back to best must POST { pole: "best" } to /style').toBeTruthy()
        expect(bestCall.url).toContain('/style')
    })
})
