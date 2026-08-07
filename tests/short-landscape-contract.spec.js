import { test, expect } from '@playwright/test'
import { openShortLandscape, setShortLandscapeFocusSearch } from './helpers/short-landscape-helpers.js'

const VIEWPORTS = [
    { width: 667, height: 375 },
    { width: 768, height: 380 }
]

for (const vp of VIEWPORTS) {
    const vpString = `${vp.width}x${vp.height}`

    test.describe(`short-landscape viewport contracts at ${vpString}`, () => {
        test.use({ isMobile: true, hasTouch: true, viewport: vp })

        test(`layout, overflow, and focus-card footprint at ${vpString}`, async ({ page }) => {
            test.setTimeout(90000)
            // These contracts verify geometry and parity, not animation timing.
            // Reduced motion keeps the 8,406-point WebGL scene from spending
            // most of the test budget on idle frames and focus transitions.
            await page.emulateMedia({ reducedMotion: 'reduce' })
            await openShortLandscape(page, vp)

            await test.step('search bar visible and not overflowing', async () => {
                const metrics = await page.evaluate(() => {
                    const inspect = (selector) => {
                        const el = document.querySelector(selector)
                        if (!el) return null
                        const rect = el.getBoundingClientRect()
                        const styles = getComputedStyle(el)
                        const winWidth = window.innerWidth || document.documentElement.clientWidth
                        const winHeight = window.innerHeight || document.documentElement.clientHeight
                        const clampSubpixel = (value) => (value <= 0.5 ? 0 : value)
                        return {
                            visible:
                                styles.display !== 'none' &&
                                styles.visibility !== 'hidden' &&
                                Number(styles.opacity || 1) > 0.01 &&
                                rect.width > 0 &&
                                rect.height > 0,
                            overflow: {
                                right: clampSubpixel(Math.max(0, rect.right - winWidth)),
                                bottom: clampSubpixel(Math.max(0, rect.bottom - winHeight)),
                                left: clampSubpixel(Math.max(0, -rect.left)),
                                top: clampSubpixel(Math.max(0, -rect.top))
                            }
                        }
                    }
                    return {
                        input: inspect('#search-input'),
                        container: inspect('.search-container')
                    }
                })
                expect(metrics.input, 'search input should remain mounted').not.toBeNull()
                expect(metrics.input.visible, 'search input should be visible').toBe(true)
                expect(metrics.container, 'search container should remain mounted').not.toBeNull()
                expect(metrics.container.visible, 'search container should be visible').toBe(true)
                expect(metrics.container.overflow.right, 'search container should not overflow right edge').toBeLessThanOrEqual(0)
            })

            await test.step('info panel visible and not overflowing', async () => {
                const metrics = await page.evaluate(() => {
                    const el = document.querySelector('#info-panel')
                    if (!el) return null
                    const rect = el.getBoundingClientRect()
                    const styles = getComputedStyle(el)
                    const winWidth = window.innerWidth || document.documentElement.clientWidth
                    const winHeight = window.innerHeight || document.documentElement.clientHeight
                    const clampSubpixel = (value) => (value <= 0.5 ? 0 : value)
                    return {
                        visible:
                            styles.display !== 'none' &&
                            styles.visibility !== 'hidden' &&
                            Number(styles.opacity || 1) > 0.01 &&
                            rect.width > 0 &&
                            rect.height > 0,
                        overflow: {
                            right: clampSubpixel(Math.max(0, rect.right - winWidth)),
                            bottom: clampSubpixel(Math.max(0, rect.bottom - winHeight)),
                            left: clampSubpixel(Math.max(0, -rect.left)),
                            top: clampSubpixel(Math.max(0, -rect.top))
                        }
                    }
                })
                expect(metrics, 'info panel should remain mounted').not.toBeNull()
                expect(metrics.visible, 'info panel should be visible').toBe(true)
                expect(metrics.overflow.right, 'info panel should not overflow right edge').toBeLessThanOrEqual(0)
                expect(metrics.overflow.bottom, 'info panel should not overflow bottom').toBeLessThanOrEqual(0)
            })

            await test.step('fixed action chrome stays contained and tappable', async () => {
                const fixedActions = [
                    { selector: '.share-toggle', visible: false },
                    { selector: '.legend-toggle', visible: true },
                    { selector: '.help-toggle', visible: true }
                ]
                for (const { selector, visible } of fixedActions) {
                    // Collect geometry in one browser evaluation. Repeated
                    // locator.evaluate calls can keep retrying against a
                    // Svelte-remounted header while WebGL is settling at
                    // short-landscape sizes, obscuring the actual contract.
                    const metrics = await page.evaluate((actionSelector) => {
                        const el = document.querySelector(actionSelector)
                        if (!el) return null
                        const rect = el.getBoundingClientRect()
                        const styles = getComputedStyle(el)
                        return {
                            visible:
                                styles.display !== 'none' &&
                                styles.visibility !== 'hidden' &&
                                Number(styles.opacity || 1) > 0.01 &&
                                rect.width > 0 &&
                                rect.height > 0,
                            overflow: {
                                right: Math.max(0, rect.right - (window.innerWidth || document.documentElement.clientWidth)),
                                bottom: Math.max(0, rect.bottom - (window.innerHeight || document.documentElement.clientHeight)),
                                left: Math.max(0, -rect.left),
                                top: Math.max(0, -rect.top)
                            },
                            pointerEvents: styles.pointerEvents,
                            width: rect.width,
                            height: rect.height
                        }
                    }, selector)
                    if (!metrics) {
                        expect(visible, `${selector} should exist when expected visible`).toBe(false)
                        continue
                    }
                    if (!visible) {
                        expect(
                            ['none', 'hidden'].includes(metrics.pointerEvents) ||
                                metrics.width === 0 ||
                                metrics.height === 0,
                            `${selector} should stay suppressed in idle short landscape`
                        ).toBe(true)
                        continue
                    }
                    expect(metrics.visible, `${selector} should be visible in short landscape`).toBe(true)
                    expect(metrics.overflow.right, `${selector} should not overflow right`).toBeLessThanOrEqual(0.5)
                    expect(metrics.overflow.bottom, `${selector} should not overflow bottom`).toBeLessThanOrEqual(0.5)
                    expect(metrics.overflow.left, `${selector} should not overflow left`).toBeLessThanOrEqual(0.5)
                    expect(metrics.overflow.top, `${selector} should not overflow top`).toBeLessThanOrEqual(0.5)
                    expect(metrics.pointerEvents, `${selector} should remain tappable`).not.toBe('none')
                    expect(metrics.width, `${selector} should retain touch target width`).toBeGreaterThanOrEqual(40)
                    expect(metrics.height, `${selector} should retain touch target height`).toBeGreaterThanOrEqual(40)
                }
            })

            await test.step('no viewport overflow on key elements in focus-search', async () => {
                const parity = await setShortLandscapeFocusSearch(page)
                expect(parity.canonicalActions.length, 'focus-search setup must use canonical app actions').toBeGreaterThan(0)
                expect(parity.bypassAttribute, 'only the documented bypass attr may be direct').toBe('focusPanelMode')
                const legacyPanel = await page.evaluate(() => {
                    const panel = document.querySelector('#info-panel')
                    if (!panel) return null
                    const rect = panel.getBoundingClientRect()
                    const styles = getComputedStyle(panel)
                    return {
                        surface: document.body?.dataset?.panelSurface || null,
                        visible:
                            styles.display !== 'none' &&
                            styles.visibility !== 'hidden' &&
                            Number(styles.opacity || 1) > 0.01 &&
                            rect.width > 0 &&
                            rect.height > 0
                    }
                })
                expect(legacyPanel, 'legacy info panel should remain mounted for a11y/state inspection').not.toBeNull()
                expect(legacyPanel.surface, 'focus-search parity surface should be active').toBe('focus-search')
                expect(
                    legacyPanel.visible,
                    'focus-search should suppress the legacy info panel; FocusCard/JourneyChrome own the surface'
                ).toBe(false)
                const selectors = ['#search-input', '.search-container', '#info-panel']
                for (const selector of selectors) {
                    const overflows = await page.evaluate((elementSelector) => {
                        return Array.from(document.querySelectorAll(elementSelector))
                            .slice(0, 10)
                            .map((el) => {
                                const rect = el.getBoundingClientRect()
                                const styles = getComputedStyle(el)
                                const visible =
                                    styles.display !== 'none' &&
                                    styles.visibility !== 'hidden' &&
                                    Number(styles.opacity || 1) > 0.01 &&
                                    rect.width > 0 &&
                                    rect.height > 0
                                if (!visible) return null
                                const winWidth = window.innerWidth || document.documentElement.clientWidth
                                const winHeight = window.innerHeight || document.documentElement.clientHeight
                                return {
                                    right: Math.max(0, rect.right - winWidth),
                                    bottom: Math.max(0, rect.bottom - winHeight),
                                    left: Math.max(0, -rect.left),
                                    top: Math.max(0, -rect.top)
                                }
                            })
                            .filter(Boolean)
                    }, selector)
                    for (const [i, overflow] of overflows.entries()) {
                        expect(overflow.right, selector + '[' + i + '] should not overflow right').toBeLessThanOrEqual(
                            0
                        )
                        expect(
                            overflow.bottom,
                            selector + '[' + i + '] should not overflow bottom'
                        ).toBeLessThanOrEqual(0)
                        expect(overflow.left, selector + '[' + i + '] should not overflow left').toBeLessThanOrEqual(0)
                        expect(overflow.top, selector + '[' + i + '] should not overflow top').toBeLessThanOrEqual(0)
                    }
                }
            })

            await test.step('focus card leaves graph breathing room', async () => {
                // Reuse the already-ready page. A second live WebGL page adds
                // a context and a full 8,406-point engine for no extra layout
                // coverage, and can starve the first page during parity sync.
                const parity = await setShortLandscapeFocusSearch(page)
                expect(parity.canonicalActions.length, 'focus-search setup must use canonical app actions').toBeGreaterThan(0)
                expect(parity.bypassAttribute, 'only the documented bypass attr may be direct').toBe('focusPanelMode')
                await page.evaluate(() => {

                    const stage = document.querySelector('#focus-stage')
                    const card = document.querySelector('.focus-stage-card')
                    if (stage) {
                        stage.hidden = false
                        stage.classList.add('active')
                        stage.setAttribute('aria-hidden', 'false')
                        stage.setAttribute('aria-expanded', 'true')
                    }
                    if (card) {
                        card.style.height = ''
                    }
                })

                const footprint = await page.evaluate(() => {
                    const el = document.querySelector('.focus-stage-card')
                    if (!el) return null
                    const rect = el.getBoundingClientRect()
                    const style = getComputedStyle(el)
                    return {
                        bottom: rect.bottom,
                        height: rect.height,
                        maxHeight: style.maxHeight,
                        position: style.position,
                        topStyle: style.top,
                        bottomStyle: style.bottom,
                        transform: style.transform,
                        top: rect.top,
                        viewportHeight: window.innerHeight || document.documentElement.clientHeight
                    }
                })

                expect(footprint, 'canonical focus card should render').not.toBeNull()
                expect(footprint.bottom, 'focus card should stay inside short-landscape viewport').toBeLessThanOrEqual(
                    footprint.viewportHeight
                )
                expect(
                    footprint.height,
                    'focus card must not consume the focus-neighborhood canvas in short landscape'
                ).toBeLessThanOrEqual(170)
                expect(
                    footprint.top,
                    `focus card should leave visible canvas above it for neighborhood nodes and threads (top=${footprint.top}, bottom=${footprint.bottom}, height=${footprint.height}, position=${footprint.position}, topStyle=${footprint.topStyle}, bottomStyle=${footprint.bottomStyle}, transform=${footprint.transform})`
                ).toBeGreaterThanOrEqual(190)

                const composition = await page.evaluate(() => {
                    const rectFor = (selector) => {
                        const element = document.querySelector(selector)
                        if (!element) return null
                        const rect = element.getBoundingClientRect()
                        const style = getComputedStyle(element)
                        if (
                            style.display === 'none' ||
                            style.visibility === 'hidden' ||
                            Number(style.opacity || 1) <= 0.01 ||
                            rect.width <= 0 ||
                            rect.height <= 0
                        ) return null
                        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom }
                    }
                    const overlaps = (left, right) => Boolean(
                        left && right && left.right > right.x && right.right > left.x &&
                        left.bottom > right.y && right.bottom > left.y
                    )
                    const card = rectFor('#focus-card-selected')
                    const journey = rectFor('#journey-chrome')
                    const compass = rectFor('#journey-compass')
                    const infoPanel = rectFor('#info-panel')
                    const overlay = rectFor('.placeholder-overlay')
                    const toggle = rectFor('#focus-pocket-list-toggle')
                    return {
                        card,
                        journey,
                        compass,
                        infoPanel,
                        overlay,
                        toggle,
                        cardJourneyOverlap: overlaps(card, journey),
                        cardCompassOverlap: overlaps(card, compass),
                        cardInfoPanelOverlap: overlaps(card, infoPanel)
                    }
                })

                expect(composition.card, 'canonical focus card should render').not.toBeNull()
                expect(composition.cardJourneyOverlap, 'focus card must not overlap journey chrome').toBe(false)
                expect(composition.cardCompassOverlap, 'focus card must not overlap journey compass').toBe(false)
                expect(composition.cardInfoPanelOverlap, 'focus card must not overlap legacy info panel').toBe(false)
                expect(composition.overlay, 'active focus surfaces must suppress the idle preview overlay').toBeNull()
                if (composition.toggle) {
                    expect(composition.toggle.bottom, 'focus list toggle must remain inside viewport').toBeLessThanOrEqual(vp.height)
                    expect(composition.toggle.right, 'focus list toggle must remain inside viewport').toBeLessThanOrEqual(vp.width)
                }
                if (composition.toggle) {
                    expect(
                        composition.toggle.bottom - composition.toggle.y,
                        'focus list toggle should retain a 44px touch target'
                    ).toBeGreaterThanOrEqual(44)
                }
            })
        })
    })
}
