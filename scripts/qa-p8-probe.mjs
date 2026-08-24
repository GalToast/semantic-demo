// p8-acceptance-probe.mjs — P8 hardware-acceptance, emulation edition.
// Modes:
//   swift : --enable-unsafe-swiftshader (software GL = weak-GPU bucket).
//           Expected: supportsCapableWebGL rejects via caveat -> placeholder2d,
//           no crash, no three fetch.
//   gpu   : --use-angle=d3d11 (real RTX 4050 path) + CPU throttle 4x +
//           mobile viewport = best-emulation of a capable mid-tier phone.
//           Expected: auto-enter -> renderKind webgl, scene-ready, FPS sampled.
// Usage: node tmp/p8-acceptance-probe.mjs <swift|gpu> [url]
import { chromium } from 'playwright'

const mode = process.argv[2] || 'gpu'
const url = process.argv[3] || 'http://127.0.0.1:8800/dist/svelte/index.html?nodemo=1'

const launchArgs = ['--no-sandbox']
if (mode === 'nowebgl2') {
    // Probe requests 'webgl2' specifically; killing webgl2 while leaving
    // webgl1 alive = honest 'GPU lacks the required API version' bucket.
    launchArgs.push('--disable-webgl2', '--disable-gpu')
} else if (mode === 'swift' || mode === 'weakgl') {
    // weakgl: NO unsafe-swiftshader bypass -> webgl2 creation fails outright
    // on GPU-less launch = honest 'no capable GL' simulation.
    if (mode === 'swift') launchArgs.push('--enable-unsafe-swiftshader')
    launchArgs.push('--disable-gpu')
} else {
    launchArgs.push('--use-angle=d3d11', '--enable-webgl')
}

const browser = await chromium.launch({ args: launchArgs })
const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
})
const page = await ctx.newPage()
await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true })
})
// Mid-tier CPU contention simulation
const client = await ctx.newCDPSession(page)
await client.send('Emulation.setCPUThrottlingRate', { rate: mode === 'gpu' ? 4 : 1 })

const t0 = Date.now()
let renderKindAt = null
await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(e => console.log('NAV-ERR', e.message.slice(0, 100)))

// Poll renderKind flip
for (let i = 0; i < 60; i++) {
    const rk = await page.evaluate(() => document.body?.dataset?.renderKind ?? null).catch(() => null)
    if (rk && !renderKindAt) { renderKindAt = { kind: rk, atMs: Date.now() - t0 }; break }
    await page.waitForTimeout(250)
}
if (!renderKindAt) renderKindAt = { kind: 'never-set', atMs: null }

await page.waitForTimeout(mode === 'gpu' ? 25000 : 8000)

const state = await Promise.race([
    page.evaluate(() => {
        const mem = performance.memory
            ? { usedJSHeapMB: Math.round(performance.memory.usedJSHeapSize / 1048576) }
            : {}
        return {
            renderKind: document.body?.dataset?.renderKind ?? null,
            placeholder: !!document.querySelector('.placeholder-2d'),
            hasCanvas: !!document.querySelector('#canvas-container canvas, canvas'),
            sceneReadyAttr: document.body?.dataset?.sceneReady ?? document.documentElement.dataset.sceneReady ?? null,
            ...mem
        }
    }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('MAIN THREAD BLOCKED')), 4000))
]).catch(e => ({ deadlock: e.message }))

// FPS sample over ~3s (only meaningful when canvas is live)
let fps = null
try {
    fps = await page.evaluate(() => new Promise((resolve) => {
        let frames = 0
        const start = performance.now()
        const tick = () => {
            frames++
            if (performance.now() - start < 3000) requestAnimationFrame(tick)
            else resolve(Math.round((frames * 1000) / (performance.now() - start)))
        }
        requestAnimationFrame(tick)
    }))
} catch { fps = 'blocked' }

console.log(JSON.stringify({ mode, url: url.slice(0, 60), renderKindAt, ...state, fpsSample: fps }, null, 1))
await browser.close()
