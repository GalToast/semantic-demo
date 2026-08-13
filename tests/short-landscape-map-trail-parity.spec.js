import { test, expect } from '@playwright/test'
import { openShortLandscape, setShortLandscapeMapTrail } from './helpers/short-landscape-helpers.js'

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
                pointerEvents: style.pointerEvents
            }
        }
        return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            body: { ...document.body.dataset },
            search: read('.search-container'),
            input: read('#search-input'),
            compass: read('#journey-compass'),
            mapStrip: read('.map-trail-strip'),
            map: read('#map-container')
        }
    })
}

for (const viewport of VIEWPORTS) {
    test.describe(`short-landscape map-trail parity at ${viewport.width}x${viewport.height}`, () => {
        test.use({ isMobile: true, hasTouch: true, viewport })

        test('reaches canonical map-trail surface with map-trail-strip ownership', async ({ page }) => {
            test.setTimeout(90000)
            await page.emulateMedia({ reducedMotion: 'reduce' })
            await openShortLandscape(page, viewport)
            await setShortLandscapeMapTrail(page)

            const layout = await readLayout(page)
            const search = visibleRect(layout.search)
            const input = visibleRect(layout.input)
            const compass = visibleRect(layout.compass)
            const mapStrip = visibleRect(layout.mapStrip)

            expect(layout.body.activeView, 'map view must remain active').toBe('map')
            expect(layout.body.panelSurface, 'canonical map-trail surface must be active').toBe('map-trail')
            expect(layout.body.journeyNavigationOwner, 'map-trail strip must own navigation').toBe('map-trail-strip')

            expect(search, 'map-trail must expose search lane').not.toBeNull()
            expect(input, 'map-trail search input must be usable').not.toBeNull()
            expect(input.pointerEvents, 'map-trail search input must be tappable').not.toBe('none')
            // Map-trail deliberately hides the outer compass shell because the
            // in-map strip owns navigation in this surface.
            expect(mapStrip, 'map-trail strip must be visible').not.toBeNull()

            for (const [name, box] of Object.entries({ search, input, compass, mapStrip })) {
                if (!box) continue
                expect(box.x, `${name} must not overflow left`).toBeGreaterThanOrEqual(-0.5)
                expect(box.y, `${name} must not overflow top`).toBeGreaterThanOrEqual(-0.5)
                expect(box.right, `${name} must not overflow right`).toBeLessThanOrEqual(layout.viewport.width + 0.5)
                expect(box.bottom, `${name} must not overflow bottom`).toBeLessThanOrEqual(layout.viewport.height + 0.5)
            }

            expect(overlaps(search, compass), 'search must not cover journey compass').toBe(false)
            expect(overlaps(search, mapStrip), 'search must not cover map-trail strip').toBe(false)
            expect(overlaps(compass, mapStrip), 'compass must not cover map-trail strip').toBe(false)
        })
    })
}
