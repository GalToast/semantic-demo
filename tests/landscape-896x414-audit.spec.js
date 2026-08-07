import { test, expect } from '@playwright/test'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8795').replace(/\/$/, '')
const APP_PATH = process.env.TEST_APP_PATH || '/index.html'
const SHORT_LANDSCAPE = { width: 896, height: 414 }

const STATES = [
    { name: 'idle', url: '?nodemo=1', panelSurface: 'idle' },
    { name: 'search', url: '?q=coffee', panelSurface: 'search' },
    { name: 'focus', url: '?record=123', panelSurface: 'focus' },
    { name: 'map', url: '?view=map&nodemo=1', panelSurface: 'map-trail' }
]

for (const state of STATES) {
    test.describe('short-landscape (896x414) - ' + state.name, () => {
        test.use({ isMobile: true, hasTouch: true, viewport: SHORT_LANDSCAPE })

        test.beforeEach(async ({ page }) => {
            await page.goto(BASE_URL + APP_PATH + state.url)
            // Replace networkidle with a DOM-settled gate per state (networkidle
            // fires before transitions settle: ?q=coffee results mount after idle,
            // ?record=123 focus applies after data load).
            const settlePredicates = {
                idle: () => document.querySelector('#info-panel') !== null,
                search: () => document.querySelector('.search-result-item') !== null,
                focus: () => document.querySelector('#selected-card') !== null,
                map: () => document.querySelector('#map-container') !== null
            }
            const pred = settlePredicates[state.name]
            if (pred) {
                await page.waitForFunction(pred, null, { timeout: 30000, polling: 100 })
            }
            if (state.panelSurface) {
                await page.evaluate((s) => {
                    document.body.dataset.panelSurface = s
                }, state.panelSurface)
            }
        })

        test('no overflow on key elements at ' + state.name + ' 896x414', async ({ page }) => {
            await page.setViewportSize(SHORT_LANDSCAPE)
            const selectors = ['#info-panel', '.journey-compass', '.search-container', '.controls']
            for (const selector of selectors) {
                const elements = page.locator(selector)
                const count = await elements.count()
                for (let i = 0; i < Math.min(count, 10); i++) {
                    const el = elements.nth(i)
                    const isVisible = await el.isVisible().catch(() => false)
                    if (!isVisible) continue
                    // Poll per-element overflow predicate instead of one-shot rect.
                    const noOverflow = await page.waitForFunction(
                        ({ sel, idx }) => {
                            const elems = document.querySelectorAll(sel)
                            const elem = elems[idx]
                            if (!elem) return false
                            const rect = elem.getBoundingClientRect()
                            const winW = window.innerWidth || document.documentElement.clientWidth
                            const winH = window.innerHeight || document.documentElement.clientHeight
                            return rect.right <= winW && rect.bottom <= winH && rect.left >= 0 && rect.top >= 0
                        },
                        { sel: selector, idx: i },
                        { timeout: 15000, polling: 50 }
                    )
                    expect(noOverflow, selector + '[' + i + '] must not overflow viewport').toBe(true)
                }
            }
        })

        test('journey-compass and info-panel do not overlap at ' + state.name + ' 896x414', async ({ page }) => {
            await page.setViewportSize(SHORT_LANDSCAPE)
            const compass = page.locator('.journey-compass')
            const infoPanel = page.locator('#info-panel')
            const compassVisible = await compass.isVisible().catch(() => false)
            const panelVisible = await infoPanel.isVisible().catch(() => false)
            if (compassVisible && panelVisible) {
                // Poll the settled no-overlap predicate instead of one-shot rects.
                const noOverlap = await page.waitForFunction(
                    () => {
                        const c = document.querySelector('.journey-compass')
                        const p = document.querySelector('#info-panel')
                        if (!c || !p) return false
                        const cR = c.getBoundingClientRect()
                        const pR = p.getBoundingClientRect()
                        const vOverlap = !(cR.bottom < pR.top || cR.top > pR.bottom)
                        const hOverlap = !(cR.right < pR.left || cR.left > pR.right)
                        return !(vOverlap && hOverlap)
                    },
                    null,
                    { timeout: 15000, polling: 50 }
                )
                expect(noOverlap, 'compass and panel must not overlap at ' + state.name).toBe(true)
            }
        })
    })
}
