import { test, expect } from '@playwright/test'
import { openShortLandscape, setShortLandscapeFocusSearch } from './helpers/short-landscape-helpers.js'

const VIEWPORTS = [
    { width: 896, height: 414 },
    { width: 844, height: 390 }
]

function visibleRect(snapshot) {
    if (!snapshot) return null
    if (snapshot.display === 'none' || snapshot.visibility === 'hidden') return null
    if (Number(snapshot.opacity || 1) <= 0.01 || snapshot.width <= 0 || snapshot.height <= 0) return null
    return snapshot
}

function overlaps(a, b) {
    return Boolean(a && b && !(a.right <= b.x || b.right <= a.x || a.bottom <= b.y || b.bottom <= a.y))
}

async function enterMapSurface(page, surface) {
    await setShortLandscapeFocusSearch(page)
    await page.evaluate((targetSurface) => {
        const actions = window.__navActions__ ?? window.__APP_ACTIONS__ ?? {}
        actions.setSurface?.(targetSurface)
        actions.refreshCompositionState?.()
        actions.switchView?.('map')
        actions.refreshCompositionState?.()
    }, surface)
    await page.waitForFunction(
        (expectedSurface) =>
            document.body.dataset.activeView === 'map' &&
            document.body.dataset.panelSurface === expectedSurface &&
            document.body.dataset.journeyNavigationOwner === 'map-trail-strip',
        surface,
        { timeout: 15000 }
    )
    await page.waitForTimeout(100)
}

async function readLayout(page) {
    return page.evaluate(() => {
        const read = (selector) => {
            const element = document.querySelector(selector)
            if (!element) return null
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element)
            return {
                x: rect.x,
                y: rect.y,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                display: style.display,
                visibility: style.visibility,
                opacity: style.opacity,
                pointerEvents: style.pointerEvents,
                position: style.position
            }
        }
        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            body: { ...document.body.dataset },
            search: read('.search-container'),
            input: read('#search-input'),
            compass: read('.journey-compass'),
            mapStrip: read('.map-trail-strip'),
            map: read('#map-container')
        }
    })
}

for (const viewport of VIEWPORTS) {
    test.describe(`short-landscape focus/map parity at ${viewport.width}x${viewport.height}`, () => {
        test.use({ isMobile: true, hasTouch: true, viewport })

        for (const surface of ['map-focus', 'map-focus-search']) {
            test(`keeps ${surface} search and compass in separate columns`, async ({ page }) => {
                test.setTimeout(90000)
                await page.emulateMedia({ reducedMotion: 'reduce' })
                await openShortLandscape(page, viewport)
                await enterMapSurface(page, surface)

                const layout = await readLayout(page)
                const search = visibleRect(layout.search)
                const input = visibleRect(layout.input)
                const compass = visibleRect(layout.compass)
                const mapStrip = visibleRect(layout.mapStrip)

                expect(layout.body.activeView, 'map view must remain active').toBe('map')
                expect(layout.body.panelSurface, 'map focus surface must remain canonical').toBe(surface)
                expect(search, 'map focus must expose its search lane').not.toBeNull()
                expect(input, 'map focus search input must remain usable').not.toBeNull()
                expect(input.pointerEvents, 'map focus search input must remain tappable').not.toBe('none')
                expect(compass, 'map focus must expose the compass at wide short-landscape').not.toBeNull()

                for (const [name, box] of Object.entries({ search, input, compass, mapStrip })) {
                    if (!box) continue
                    expect(box.x, `${name} must not overflow left`).toBeGreaterThanOrEqual(-0.5)
                    expect(box.y, `${name} must not overflow top`).toBeGreaterThanOrEqual(-0.5)
                    expect(box.right, `${name} must not overflow right`).toBeLessThanOrEqual(layout.viewport.width + 0.5)
                    expect(box.bottom, `${name} must not overflow bottom`).toBeLessThanOrEqual(layout.viewport.height + 0.5)
                }

                expect(overlaps(search, compass), `${surface} search must not cover the journey compass`).toBe(false)
                expect(overlaps(search, mapStrip), `${surface} search must not cover the map trail title`).toBe(false)
            })
        }
    })
}
