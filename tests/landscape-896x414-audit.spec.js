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
            await page.waitForLoadState('networkidle')
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
                    const overflow = await el.evaluate((elem) => {
                        const rect = elem.getBoundingClientRect()
                        const winWidth = window.innerWidth || document.documentElement.clientWidth
                        const winHeight = window.innerHeight || document.documentElement.clientHeight
                        return {
                            right: Math.max(0, rect.right - winWidth),
                            bottom: Math.max(0, rect.bottom - winHeight),
                            left: Math.max(0, -rect.left),
                            top: Math.max(0, -rect.top)
                        }
                    })
                    expect(overflow.right, selector + '[' + i + '] right').toBeLessThanOrEqual(0)
                    expect(overflow.bottom, selector + '[' + i + '] bottom').toBeLessThanOrEqual(0)
                    expect(overflow.left, selector + '[' + i + '] left').toBeLessThanOrEqual(0)
                    expect(overflow.top, selector + '[' + i + '] top').toBeLessThanOrEqual(0)
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
                const cRect = await compass.evaluate((el) => {
                    const r = el.getBoundingClientRect()
                    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
                })
                const pRect = await infoPanel.evaluate((el) => {
                    const r = el.getBoundingClientRect()
                    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
                })
                const verticalOverlap = !(cRect.bottom < pRect.top || cRect.top > pRect.bottom)
                const horizontalOverlap = !(cRect.right < pRect.left || cRect.left > pRect.right)
                const overlap = verticalOverlap && horizontalOverlap
                expect(overlap ? 'overlap' : 'no overlap', 'compass and panel at ' + state.name).toBe('no overlap')
            }
        })
    })
}
