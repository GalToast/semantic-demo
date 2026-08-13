import { test, expect } from '@playwright/test'
import { setupMockSearch } from './helpers/mock-semantic-search.js'

const BASE_URL = (process.env.TEST_BASE_URL || 'http://127.0.0.1:8796').replace(/\/$/, '')
const APP_PATH = process.env.TEST_APP_PATH || '/dist/svelte/index.html'
const SHORT_LANDSCAPE = { width: 896, height: 414 }

const STATES = [
    { name: 'idle', url: '?nodemo=1&webgl=1', surface: 'idle' },
    { name: 'search', url: '?q=coffee&nodemo=1&webgl=1', surface: 'search' },
    { name: 'focus', url: '?nodemo=1&webgl=1', surface: 'focus', bridge: true },
    { name: 'map', url: '?view=map&nodemo=1&webgl=1', surface: 'map' }
]

for (const state of STATES) {
    test.describe('short-landscape (896x414) - ' + state.name, () => {
        test.use({ isMobile: true, hasTouch: true, viewport: SHORT_LANDSCAPE })

        test.beforeEach(async ({ page }) => {
            await page.setViewportSize(SHORT_LANDSCAPE)
            await page.addInitScript(() => {
                window.__PLAYWRIGHT__ = true
                try {
                    sessionStorage.removeItem('semantic-explorer.engineReady')
                } catch {
                    // storage may be unavailable
                }
            })
            await setupMockSearch(page)
            await page.goto(BASE_URL + APP_PATH + state.url, {
                waitUntil: 'domcontentloaded',
                timeout: 15000
            })

            // Stable app identity + launch settle.
            await page.waitForFunction(
                ({ name }) => {
                    const appState = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
                    const applyingUrlState = appState.applyingUrlState ?? appState.navState?.applyingUrlState
                    const commonReady = (
                        Array.isArray(appState.points) &&
                        appState.points.length > 0 &&
                        document.body?.dataset?.testReady === 'true' &&
                        applyingUrlState === false &&
                        document.body?.dataset?.loadingPhase === 'launch'
                    )
                    const identityReady = name === 'map'
                        ? document.querySelector('#map-container')
                        : document.querySelector('#search-input') && document.querySelector('#info-panel')

                    // The map deep-link can be fully rendered while the scene
                    // reveal flag is still owned by the overview transition.
                    // Its own surface identity and map container are the
                    // relevant readiness contract for this audit.
                    const panelSurface = document.body?.dataset?.panelSurface || ''
                    const mapReady =
                        name === 'map' &&
                        document.body?.dataset?.activeView === 'map' &&
                        (panelSurface === 'map' || panelSurface.startsWith('map-')) &&
                        document.querySelector('#map-container')

                    return commonReady && identityReady && (name === 'map' ? mapReady : appState.sceneRevealActive === false)
                },
                { name: state.name },
                { timeout: 30000 }
            )

            // Use canonical nav bridge for focus instead of fake body.dataset
            // mutation or an unreachable ?record=N deep-link.
            if (state.bridge) {
                await page.evaluate(() => {
                    const pts = (window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}).points || []
                    const idx = pts.length ? 0 : null
                    if (idx !== null) {
                        window.__navActions__?.focusOnNode?.(idx, { skipUrlSync: true })
                    }
                })
            }

            // Wait for the target surface.
            const surfacePredicates = {
                idle: () => ['idle', 'overview'].includes(document.body?.dataset?.panelSurface || ''),
                search: () => ['search', 'focus-search'].includes(document.body?.dataset?.panelSurface || ''),
                focus: () => ['focus', 'focus-search'].includes(document.body?.dataset?.panelSurface || ''),
                map: () => {
                    const surface = document.body?.dataset?.panelSurface || ''
                    return surface === 'map' || surface.startsWith('map-')
                }
            }
            await page.waitForFunction(surfacePredicates[state.name], null, { timeout: 20000 })
        })

        test('no overflow on key elements at ' + state.name + ' 896x414', async ({ page }) => {
            const selectors = ['#info-panel', '#journey-compass', '.search-container', '#camera-controls']
            const extraSelectors = {
                idle: [],
                search: [],
                focus: ['#focus-stage', '#selected-card', '#focus-card-selected'],
                map: ['#map-container']
            }
            const allSelectors = [...selectors, ...(extraSelectors[state.name] || [])]

            const snapshot = await page.evaluate(
                ({ sels }) => {
                    const winW = window.innerWidth || document.documentElement.clientWidth
                    const winH = window.innerHeight || document.documentElement.clientHeight
                    const items = []
                    for (const sel of sels) {
                        const elems = document.querySelectorAll(sel)
                        for (let i = 0; i < Math.min(elems.length, 10); i++) {
                            const el = elems[i]
                            const styles = getComputedStyle(el)
                            if (styles.display === 'none' || styles.visibility === 'hidden' || styles.opacity === '0') continue
                            const r = el.getBoundingClientRect()
                            items.push({
                                selector: sel,
                                index: i,
                                left: Math.round(r.left),
                                top: Math.round(r.top),
                                right: Math.round(r.right),
                                bottom: Math.round(r.bottom),
                                width: Math.round(r.width),
                                height: Math.round(r.height),
                                overflowX: styles.overflowX,
                                overflowY: styles.overflowY,
                                inViewport: r.right <= winW && r.bottom <= winH && r.left >= 0 && r.top >= 0
                            })
                        }
                    }
                    return { winW, winH, items }
                },
                { sels: allSelectors }
            )

            for (const item of snapshot.items) {
                expect(
                    item.inViewport,
                    `${item.selector}[${item.index}] must not overflow viewport; rect=${JSON.stringify({ left: item.left, top: item.top, right: item.right, bottom: item.bottom })} win=${snapshot.winW}x${snapshot.winH}`
                ).toBe(true)
            }
        })

        test('journey-compass and info-panel do not overlap at ' + state.name + ' 896x414', async ({ page }) => {
            const compass = page.locator('#journey-compass')
            const infoPanel = page.locator('#info-panel')
            const compassVisible = await compass.isVisible({ timeout: 5000 }).catch(() => false)
            const panelVisible = await infoPanel.isVisible({ timeout: 5000 }).catch(() => false)

            if (compassVisible && panelVisible) {
                const result = await page.evaluate(() => {
                    const c = document.querySelector('#journey-compass')
                    const p = document.querySelector('#info-panel')
                    if (!c || !p) return { overlap: false, reason: 'missing' }
                    const cR = c.getBoundingClientRect()
                    const pR = p.getBoundingClientRect()
                    const vOverlap = !(cR.bottom < pR.top || cR.top > pR.bottom)
                    const hOverlap = !(cR.right < pR.left || cR.left > pR.right)
                    return { overlap: vOverlap && hOverlap, compass: cR, panel: pR }
                })

                expect(result.overlap, 'compass and panel must not overlap at ' + state.name).toBe(false)
            }
        })
    })
}
