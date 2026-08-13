// Temporary inspection script — do NOT commit.
import { chromium } from 'playwright'

const url = 'http://127.0.0.1:8796/dist/svelte/index.html?nodemo=1&q=coffee&mode=dormant&surface=search'
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })
const page = await ctx.newPage()
await page.goto(url, { waitUntil: 'domcontentloaded' })

const ok = () => page.waitForFunction(
    () => {
        const l = document.querySelector('#search-result-list')
        return l && l.querySelectorAll(':scope > *').length > 0
    }, { timeout: 30000, polling: 100 }
).catch(() => {})

await ok()
await page.waitForFunction(() => new Promise((r) => requestAnimationFrame(() => r(true))), { timeout: 3000 }).catch(() => {})
await page.waitForTimeout(800)
await page.screenshot({ path: 'tmp/_peek_inspect.png', fullPage: false, animations: 'disabled' }).catch(() => {})

const info = await page.evaluate(() => {
    const bySel = (s) => document.querySelector(s)
    const r = (el) => el ? { x: Math.round(el.getBoundingClientRect().x), y: Math.round(el.getBoundingClientRect().y), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height), top: Math.round(el.getBoundingClientRect().top), bottom: Math.round(el.getBoundingClientRect().bottom) } : null
    const cs = (el) => el ? getComputedStyle(el) : null
    const infoPanel = bySel('#info-panel.info-panel')
    const searchContainer = bySel('.search-container.has-query')
    const searchResults = bySel('#search-results.active, .search-results-wrapper.active')
    const btn = bySel('.search-show-more-btn')
    const items = Array.from(document.querySelectorAll('.search-result-item'))
    const firstItem = items[0]
    const label = bySel('.search-label')
    // dump ALL search-result-item rects
    const allItems = items.map((el) => ({ cls: el.className, rect: r(el), display: cs(el)?.display, minH: cs(el)?.minHeight }))
    return {
        viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
        bodyDetail: document.body.dataset.panelSurfaceDetail,
        bodySurface: document.body.dataset.panelSurface,
        bodyClasses: Array.from(document.body.classList),
        infoPanel: { rect: r(infoPanel), classes: infoPanel?.className, csHeight: cs(infoPanel)?.height, csMaxH: cs(infoPanel)?.maxHeight, display: cs(infoPanel)?.display, pos: cs(infoPanel)?.position },
        searchContainer: { rect: r(searchContainer), classes: searchContainer?.className, overflow: cs(searchContainer)?.overflow, pos: cs(searchContainer)?.position, display: cs(searchContainer)?.display },
        searchResults: { rect: r(searchResults), classes: searchResults?.className, overflowY: cs(searchResults)?.overflowY, maxH: cs(searchResults)?.maxHeight, display: cs(searchResults)?.display, pos: cs(searchResults)?.position, flex: cs(searchResults)?.flex },
        label: { rect: r(label), display: cs(label)?.display },
        btn: { rect: r(btn), classes: btn?.className, csPos: cs(btn)?.position, csMinH: cs(btn)?.minHeight, csBottom: cs(btn)?.bottom, display: cs(btn)?.display },
        firstItem: { rect: r(firstItem), display: cs(firstItem)?.display },
        resultCount: items.length,
        allItems,
        docScroll: document.documentElement.scrollHeight,
        docClient: document.documentElement.clientHeight
    }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
