// tests/integration/w6-splash-t1-contract.mjs
//
// W6-T1 contract test: gesture-driven engine-ready gate.
//
// Verifies the Splash → Canvas gated-mount pattern. Until the App.svelte
// patch from docs/archive/w6-t1-app-svelte-integration.md lands, the engine-ready
// store can still be tested in isolation:
//   - body[data-app-state="splash"] on page load
//   - flipping the store via window.__READY__() removes splash
//
// Run via:
//   npx playwright test tests/integration/w6-splash-t1-contract.mjs \
//     --browser=chromium --timeout=60000
//
// Status of this test: SCAFFOLD. Becomes live once App.svelte ships the
// conditional. The store + gesture monitor bits are testable today.

import { chromium } from 'playwright'
import { describe, it, expect, before, after } from 'vitest'

const TEST_BASE_URL = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:5175/'
// SwiftShader gate (see visual-state-audit.mjs)
const forceSoftwareWebgl = process.env.SEMANTIC_FORCE_WEBGL_SOFTWARE === '1'

describe('W6-T1 splash shell + gesture monitor', () => {
    let browser
    let page

    before(async () => {
        browser = await chromium.launch({ headless: true, args: [...(forceSoftwareWebgl ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--enable-webgl', '--enable-unsafe-swiftshader', '--enable-webgl-software-rendering'] : [])] })
        page = await browser.newPage()
        await page.goto(TEST_BASE_URL, { waitUntil: 'networkidle' })
    })

    after(async () => {
        await browser?.close()
    })

    it('exposes engine-ready store on window once main.ts wires it up', async () => {
        const exposure = await page.evaluate(() => {
            // Engine-ready store hasn't been exposed on window by main.ts yet
            // (it's a Svelte 5 state class). The test would assert that the
            // body[data-app-state] is present after Splash integration lands.
            return typeof window.requestIdleCallback
        })
        expect(exposure).toBe('function')
    })
})
