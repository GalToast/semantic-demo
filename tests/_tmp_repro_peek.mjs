// Temporary exploratory inspector — do NOT commit.
import { chromium } from 'playwright'

const url = 'http://127.0.0.1:8796/dist/svelte/index.html?nodemo=1&q=coffee&mode=dormant&surface=search'

const browser = await chromium.launch({
    headless: true,
    args: [
        '--no-sandbox',
        '--use-gl=angle',
        '--enable-unsafe-swiftshader',
        '--enable-webgl-software-rendering',
        '--ignore-gpu-blocklist'
    ]
})

function dump(page) {
    return page.evaluate(() => {
        const r = (el) => el ? { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height), top: Math.round(el.getBoundingClientRect().top), bottom: Math.round(el.getBoundingClientRect().bottom) } : null
        const cs = (el) => el ? getComputedStyle(el) : null
        const byId = (id) => document.getElementById(id)
        const bySel = (s) => document.querySelector(s)
        const infoPanel = byId('info-panel')
        const searchContainer = bySel('.search-container.has-query')
        const results = bySel('#search-results.active') || bySel('.search-results-wrapper.active')
        const btn = bySel('.search-show-more-btn')
        const items = Array.from(document.querySelectorAll('.search-result-item'))
        const cta = bySel('[data-testid="splash-cta"], button[aria-label="Open full 3D experience"]')
        return {
            viewport: { w: window.innerWidth, h: window.innerHeight },
            bodySurface: document.body.dataset.panelSurface,
            bodyDetail: document.body.dataset.panelSurfaceDetail,
            bodyClasses: Array.from(document.body.classList),
            renderKind: document.body.dataset.renderKind,
            graphicsMode: document.body.dataset.graphicsMode,
            infoPanel: { rect: r(infoPanel), classes: infoPanel?.className, display: cs(infoPanel)?.display, csMaxH: cs(infoPanel)?.maxHeight, pos: cs(infoPanel)?.position },
            searchContainer: { rect: r(searchContainer), classes: searchContainer?.className, display: cs(searchContainer)?.display, overflow: cs(searchContainer)?.overflow },
            results: { rect: r(results), classes: results?.className, display: cs(results)?.display, maxH: cs(results)?.maxHeight, overflowY: cs(results)?.overflowY },
            btn: { rect: r(btn), classes: btn?.className, csPos: cs(btn)?.position, display: cs(btn)?.display, csMinH: cs(btn)?.minHeight },
            resultCount: items.length,
            firstItem: { rect: r(items[0]) },
            ctaPresent: !!cta,
            ctaRect: cta ? { x: cta.getBoundingClientRect().x, y: cta.getBoundingClientRect().y, w: cta.getBoundingClientRect().width, h: cta.getBoundingClientRect().height } : null
        }
    })
}

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleScale: 1, deviceScaleFactor: 2, isMobile: true })
const page = await ctx.newPage()
await page.goto(url, { waitUntil: 'domcontentloaded' })

// wait for results to load
await page.waitForFunction(() => document.querySelectorAll('.search-result-item').length > 0, { timeout: 30000, polling: 200 }).catch(() => {})
await page.waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {})

process.stdout.write('=== AFTER LOAD (before CTA) ===\n')
process.stdout.write(JSON.stringify(await dump(page), null, 2) + '\n')
await page.screenshot({ path: 'tmp/_peek_aftersnap.png', animations: 'disabled' }).catch(() => {})

// Try clicking splash CTA if present
const cta = await page.$('[data-testid="splash-cta"], button[aria-label="Open full 3D experience"], button:has-text("Enter 3D Scene")')
if (cta) {
    process.stdout.write('=== CLICKING CTA ===\n')
    await cta.click().catch(() => {})
    await page.waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(1500)
    process.stdout.write('=== AFTER CTA CLICK ===\n')
    process.stdout.write(JSON.stringify(await dump(page), null, 2) + '\n')
    await page.screenshot({ path: 'tmp/_peek_aftercta.png', animations: 'disabled' }).catch(() => {})
} else {
    process.stdout.write('=== NO CTA FOUND ===\n')
}
await browser.close()
