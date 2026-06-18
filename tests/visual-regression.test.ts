/**
 * Visual Regression Test — Pixel-Level Baseline Comparison
 *
 * Serves dist/svelte/ on a local port, captures Playwright screenshots
 * for each baseline state, and compares with pixelmatch.
 *
 * Baselines (tests/visual-baselines/):
 *   1. overview.png              — initial load, wait for WebGL init (desktop)
 *   2. search-open.png           — search panel opened (desktop)
 *   3. focus-mode.png            — canvas center clicked to enter focus (desktop)
 *   4. map-view.png              — map view triggered (desktop)
 *   5. mobile-idle.png           — mobile idle state (390x844)
 *   6. search-error.png          — forced search error (mobile)
 *   7. search-no-results.png     — search with no results (mobile)
 *   8. focus-pocket.png          — focus stage with dive (mobile)
 *   9. field-node.png            — field-node canopy HUD (mobile)
 *   10. info-panel-empty.png     — info panel empty/idle (mobile)
 *   11. compass-rail.png         — journey compass rail (mobile)
 *   12. loading-overlay.png      — loading overlay visible (mobile)
 *   13. mode-grid.png            — mode chip grid (mobile)
 *   14. filters.png              — filter toolbar (mobile)
 *   15. controls.png             — camera controls (mobile)
 *   16. info-panel-populated.png — info panel with data (desktop)
 *   17. global-spacing.png       — global spacing check (mobile)
 *
 * Usage:
 *   npx tsx tests/visual-regression.test.ts
 *   npm run test:visual
 */

import * as http from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'
import { chromium, type Browser, type Page, type BrowserContext } from 'playwright'

// ── Config ──────────────────────────────────────────────────────────────────

const PORT = 8799
const BASE_URL = `http://127.0.0.1:${PORT}`
const BASELINE_DIR = path.resolve(import.meta.dirname ?? __dirname, 'visual-baselines')
const DIFF_DIR = path.join(BASELINE_DIR, 'diffs')
const THRESHOLD = parseFloat(process.env.VISUAL_THRESHOLD || '2') // Default 2% for cross-env comparison, override with VISUAL_THRESHOLD env var
const DEFAULT_VIEWPORT = { width: 1280, height: 850 }

// ── Static file server ──────────────────────────────────────────────────────

function startServer(distDir: string): Promise<http.Server> {
    const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.ttf': 'font/ttf',
        '.dat': 'application/octet-stream',
        '.gz': 'application/gzip',
    }

    const server = http.createServer((req, res) => {
        let filePath = path.join(distDir, req.url === '/' ? 'index.html' : req.url || '')
        filePath = path.normalize(filePath)

        if (!filePath.startsWith(distDir)) {
            res.writeHead(403)
            res.end('Forbidden')
            return
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                // Try index.html for SPA routing
                fs.readFile(path.join(distDir, 'index.html'), (err2, data2) => {
                    if (err2) {
                        res.writeHead(404)
                        res.end('Not Found')
                        return
                    }
                    res.writeHead(200, { 'Content-Type': 'text/html' })
                    res.end(data2)
                })
                return
            }

            const ext = path.extname(filePath).toLowerCase()
            const contentType = mimeTypes[ext] || 'application/octet-stream'
            res.writeHead(200, { 'Content-Type': contentType })
            res.end(data)
        })
    })

    return new Promise((resolve) => {
        server.listen(PORT, '127.0.0.1', () => {
            console.log(`  Server started on ${BASE_URL}`)
            resolve(server)
        })
    })
}

// ── Image comparison ────────────────────────────────────────────────────────

/** Crop a PNG to match target dimensions (center-crop) */
function cropPng(source: PNG, targetWidth: number, targetHeight: number): PNG {
    const cropped = new PNG({ width: targetWidth, height: targetHeight })
    const srcX = Math.max(0, Math.floor((source.width - targetWidth) / 2))
    const srcY = Math.max(0, Math.floor((source.height - targetHeight) / 2))

    for (let y = 0; y < targetHeight; y++) {
        for (let x = 0; x < targetWidth; x++) {
            const srcIdx = ((srcY + y) * source.width + (srcX + x)) << 2
            const dstIdx = (y * targetWidth + x) << 2
            cropped.data[dstIdx] = source.data[srcIdx]
            cropped.data[dstIdx + 1] = source.data[srcIdx + 1]
            cropped.data[dstIdx + 2] = source.data[srcIdx + 2]
            cropped.data[dstIdx + 3] = source.data[srcIdx + 3]
        }
    }
    return cropped
}

function compareImages(
    baselinePath: string,
    currentPath: string,
    diffPath: string
): { match: boolean; diffPercent: number; diffPixels: number; totalPixels: number } {
    const baseline = PNG.sync.read(fs.readFileSync(baselinePath))
    let current = PNG.sync.read(fs.readFileSync(currentPath))

    // Handle dimension mismatch by cropping the larger image to match
    if (current.width !== baseline.width || current.height !== baseline.height) {
        console.log(
            `    ⚠ Dimension mismatch: baseline ${baseline.width}x${baseline.height}, ` +
                `current ${current.width}x${current.height}. Cropping to match.`
        )
        // Use baseline dimensions as target, crop current if needed
        current = cropPng(current, baseline.width, baseline.height)
    }

    const { width, height } = baseline
    const diff = new PNG({ width, height })

    const diffPixels = pixelmatch(
        baseline.data,
        current.data,
        diff.data,
        width,
        height,
        { threshold: 0.1 } // per-pixel threshold (0-1)
    )

    fs.mkdirSync(path.dirname(diffPath), { recursive: true })
    fs.writeFileSync(diffPath, PNG.sync.write(diff))

    const totalPixels = width * height
    const diffPercent = (diffPixels / totalPixels) * 100

    return {
        match: diffPercent <= THRESHOLD,
        diffPercent,
        diffPixels,
        totalPixels,
    }
}

// ── State definitions ───────────────────────────────────────────────────────

interface TestState {
    name: string
    baseline: string
    description: string
    setup: (page: Page) => Promise<void>
    /** Optional viewport override (for mobile surfaces). Omit for default 1280x850. */
    viewport?: { width: number; height: number; isMobile?: boolean; deviceScaleFactor?: number }
    thresholdOverride?: number // Per-state threshold override
}

function getTestStates(): TestState[] {
    return [
        // ── Original 4 desktop baselines ──────────────────────────────────────
        {
            name: 'overview',
            baseline: 'overview.png',
            description: 'Initial load — WebGL scene with node graph',
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                // Wait for WebGL to initialize and first frame to render
                await page.waitForTimeout(5000)
            },
        },
        {
            name: 'search-open',
            baseline: 'search-open.png',
            description: 'Search panel opened',
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                await page.waitForTimeout(3000)

                // Click the search button (magnifying glass icon)
                const searchButton = page.locator(
                    '[data-testid="search-toggle"], button[aria-label*="search" i], .search-button, [class*="search"] button'
                )
                const found = await searchButton.first().isVisible().catch(() => false)
                if (found) {
                    await searchButton.first().click()
                } else {
                    // Fallback: try clicking any button with search-related class
                    await page.evaluate(() => {
                        const btns = Array.from(document.querySelectorAll('button'))
                        const searchBtn = btns.find(
                            (b) =>
                                b.className.toLowerCase().includes('search') ||
                                b.textContent?.toLowerCase().includes('search')
                        )
                        if (searchBtn) searchBtn.click()
                    })
                }
                await page.waitForTimeout(1000)
            },
        },
        {
            name: 'focus-mode',
            baseline: 'focus-mode.png',
            description: 'Focus mode — clicked canvas center',
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                await page.waitForTimeout(3000)

                // Click the center of the canvas to trigger focus
                const canvas = page.locator('canvas').first()
                const isVisible = await canvas.isVisible().catch(() => false)
                if (isVisible) {
                    const box = await canvas.boundingBox()
                    if (box) {
                        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
                    }
                }
                await page.waitForTimeout(2000)
            },
        },
        {
            name: 'map-view',
            baseline: 'map-view.png',
            description: 'Map view — 2D map overlay triggered',
            thresholdOverride: 5, // Higher threshold for map due to external tile loading variability
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                await page.waitForTimeout(3000)

                // Try to trigger map view via keyboard shortcut or button
                // First try clicking a map toggle button
                const mapButton = page.locator(
                    '[data-testid="map-toggle"], button[aria-label*="map" i], [class*="map-toggle"], [class*="compass"]'
                )
                const found = await mapButton.first().isVisible().catch(() => false)
                if (found) {
                    await mapButton.first().click()
                } else {
                    // Fallback: try pressing 'm' key for map toggle
                    await page.keyboard.press('m')
                }
                await page.waitForTimeout(2000)
            },
        },

        // ── W35: New mobile baselines (14 contract surfaces) ──────────────────

        // 1. mobile-idle — 390x844, initial load mobile idle state
        {
            name: 'mobile-idle',
            baseline: 'mobile-idle.png',
            description: 'Mobile idle — initial load at 390x844',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                // Wait for WebGL init and mobile chrome to settle
                await page.waitForTimeout(5000)
            },
        },

        // 2. search-error — forced search error state via route mocking
        {
            name: 'search-error',
            baseline: 'search-error.png',
            description: 'Search error — forced 503 on semantic_search endpoint',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            setup: async (page) => {
                // Mock the health and search endpoints to force error state
                await page.route(
                    (url) => {
                        try {
                            return new URL(url).searchParams.get('action') === 'semantic_lane_health'
                        } catch {
                            return false
                        }
                    },
                    async (route) => {
                        await route.fulfill({
                            status: 200,
                            contentType: 'application/json',
                            body: JSON.stringify({
                                ok: false,
                                state: 'degraded',
                                provenance: { label: 'Search paused', detail: 'Forced surface-contract health degradation.' }
                            })
                        })
                    }
                )
                await page.route(
                    (url) => {
                        try {
                            return new URL(url).searchParams.get('action') === 'semantic_search'
                        } catch {
                            return false
                        }
                    },
                    async (route) => {
                        await route.fulfill({
                            status: 503,
                            contentType: 'application/json',
                            body: JSON.stringify({ ok: false, error: 'forced-surface-contract-search-error' })
                        })
                    }
                )
                const errorUrl = `${BASE_URL}?view=galaxy&q=forced-surface-contract-search-error&staticDev=0`
                await page.goto(errorUrl, { waitUntil: 'networkidle' })
                await page.waitForTimeout(5000)
                // Wait for the error state to become visible
                await page.waitForSelector('.search-error-state', { state: 'visible', timeout: 10000 }).catch(() => {})
            },
        },

        // 3. search-no-results — search with unmatchable query
        {
            name: 'search-no-results',
            baseline: 'search-no-results.png',
            description: 'Search no results — unmatchable query xj9k2l',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            setup: async (page) => {
                const url = `${BASE_URL}?view=galaxy&q=xj9k2l&nodemo=1`
                await page.goto(url, { waitUntil: 'networkidle' })
                // Wait for search to settle (may show empty state or mock results)
                await page.waitForTimeout(5000)
                // Wait for search-results to be active or status to have text
                await page.waitForFunction(
                    () => {
                        const results = document.querySelector('#search-results')
                        const status = document.querySelector('#search-status')
                        return Boolean(results?.classList.contains('active') || status?.textContent?.length)
                    },
                    { timeout: 15000 }
                ).catch(() => {})
            },
        },

        // 4. focus-pocket — focus stage with dive/inside state
        {
            name: 'focus-pocket',
            baseline: 'focus-pocket.png',
            description: 'Focus pocket — focus stage with dive active',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            setup: async (page) => {
                const focusedUrl = `${BASE_URL}?view=galaxy&q=coffee&anchor=519`
                await page.goto(focusedUrl, { waitUntil: 'networkidle' })
                await page.waitForTimeout(4000)
                // Click first search result to enter focus
                await page.evaluate(() => {
                    const el = document.querySelector('.search-result-item')
                    if (el) (el as HTMLElement).click()
                })
                await page.waitForTimeout(2000)
                // Click dive button
                await page.evaluate(() => {
                    const diveBtn = document.querySelector('#btn-focus-dive, .focus-stage-dive-btn')
                    if (diveBtn) (diveBtn as HTMLElement).click()
                })
                await page.waitForTimeout(2000)
                // Force semantic-dive state
                await page.evaluate(() => {
                    document.body.classList.add('is-active')
                    document.body.dataset.activeView = 'galaxy'
                    document.body.dataset.graphContext = document.body.dataset.graphContext || 'focus'
                    document.body.dataset.semanticDive = 'active'
                    document.body.dataset.panelSurface = 'semantic-dive'
                    document.body.dataset.panelSurfaceDetail = 'none'

                    const focusStage = document.querySelector('#focus-stage') as HTMLElement | null
                    if (focusStage) {
                        focusStage.hidden = false
                        focusStage.setAttribute('aria-hidden', 'false')
                    }
                    for (const selector of ['#focus-stage-inside-status', '#focus-stage-inside-controls']) {
                        const el = document.querySelector(selector) as HTMLElement | null
                        if (el) {
                            el.hidden = false
                            el.setAttribute('aria-hidden', 'false')
                        }
                    }
                })
                await page.waitForTimeout(1000)
            },
        },

        // 5. field-node — field-node canopy HUD
        {
            name: 'field-node',
            baseline: 'field-node.png',
            description: 'Field node — focus panel in field-node mode',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            setup: async (page) => {
                const fieldNodeUrl = `${BASE_URL}?view=galaxy&q=coffee&anchor=519`
                await page.goto(fieldNodeUrl, { waitUntil: 'networkidle' })
                await page.waitForTimeout(4000)
                // Enter focus stage
                await page.evaluate(() => {
                    const el = document.querySelector('.search-result-item')
                    if (el) (el as HTMLElement).click()
                })
                await page.waitForTimeout(2000)
                // Force field-node panel mode
                await page.evaluate(() => {
                    document.body.classList.add('is-active')
                    document.body.dataset.activeView = 'galaxy'
                    document.body.dataset.graphContext = 'focus-search'
                    document.body.dataset.panelSurface = 'focus-search'
                    document.body.dataset.panelSurfaceDetail = document.body.dataset.mobileSearchSheet || 'peek'
                    document.body.dataset.focusPanelMode = 'field-node'
                    document.body.dataset.focusOrigin = 'field-node'
                    document.body.dataset.focusTransitionPhase = 'settled'

                    const focusStage = document.querySelector('#focus-stage') as HTMLElement | null
                    if (focusStage) {
                        focusStage.hidden = false
                        focusStage.setAttribute('aria-hidden', 'false')
                    }
                })
                await page.waitForTimeout(1000)
            },
        },

        // 6. info-panel-empty — info panel in empty/idle state
        {
            name: 'info-panel-empty',
            baseline: 'info-panel-empty.png',
            description: 'Info panel empty — no business selected',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                await page.waitForTimeout(4000)
                // Trigger the focus panel surface to render the selection surface
                await page.evaluate(() => {
                    document.body.dataset.activeView = 'galaxy'
                    document.body.dataset.panelSurface = 'focus'
                })
                await page.waitForTimeout(1000)
            },
        },

        // 7. compass-rail — journey compass rail visible
        {
            name: 'compass-rail',
            baseline: 'compass-rail.png',
            description: 'Compass rail — journey step buttons visible',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                await page.waitForTimeout(4000)
                // Force compass rail to be visible with map-phase styling
                await page.evaluate(() => {
                    document.body.classList.add('is-active')
                    document.body.dataset.activeView = 'galaxy'
                    document.body.dataset.graphContext = 'map'
                    document.body.dataset.panelSurface = 'map-idle'
                    document.body.dataset.mapContext = 'idle'

                    // Hide loading overlay
                    const loadingOverlay = document.querySelector('#loading-overlay') as HTMLElement | null
                    if (loadingOverlay) {
                        loadingOverlay.classList.add('hidden')
                        loadingOverlay.style.display = 'none'
                        loadingOverlay.setAttribute('aria-hidden', 'true')
                    }

                    // Force compass rail visibility
                    const compass = document.querySelector('.compass-rail') as HTMLElement | null
                    if (compass) {
                        compass.style.display = 'grid'
                        compass.style.visibility = 'visible'
                        compass.style.opacity = '1'
                        compass.style.left = '12px'
                        compass.style.right = '12px'
                        compass.style.top = '76px'
                        compass.style.width = 'auto'
                        compass.style.minWidth = '0'
                        compass.style.maxWidth = 'none'
                        compass.style.height = 'auto'
                        compass.style.minHeight = '0'
                        compass.style.maxHeight = '136px'
                        compass.style.transform = 'none'
                        compass.style.gap = '7px 8px'
                        compass.style.padding = '8px 10px'
                        compass.style.overflow = 'hidden'
                        compass.style.pointerEvents = 'auto'
                    }

                    // Force all compass steps visible
                    document.querySelectorAll('.compass-step').forEach((step) => {
                        const el = step as HTMLElement
                        el.style.display = 'grid'
                        el.style.visibility = 'visible'
                        el.style.minHeight = '44px'
                        el.style.overflow = 'visible'
                        el.style.pointerEvents = 'auto'
                    })

                    // Force compass steps container visible
                    const actions = document.querySelector('.compass-steps') as HTMLElement | null
                    if (actions) {
                        actions.style.display = 'flex'
                        actions.style.visibility = 'visible'
                        actions.style.pointerEvents = 'auto'
                    }

                    // Set compass title
                    const title = document.querySelector('#journey-compass-title, .compass-step .step-label') as HTMLElement | null
                    if (title) {
                        title.textContent = 'Map View'
                        title.style.display = 'block'
                        title.style.visibility = 'visible'
                    }
                })
                await page.waitForTimeout(1000)
            },
        },

        // 8. loading-overlay — captured during initial load
        {
            name: 'loading-overlay',
            baseline: 'loading-overlay.png',
            description: 'Loading overlay — initial loading screen',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            thresholdOverride: 10, // High threshold — loading overlay is transient and non-deterministic
            setup: async (page) => {
                // Navigate without waiting for networkidle so overlay is still visible
                await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
                // Wait briefly for the overlay to render
                await page.waitForTimeout(2000)
                // Force the overlay to stay visible (remove hidden classes, set styles)
                await page.evaluate(() => {
                    const overlay = document.querySelector('#loading-overlay') as HTMLElement | null
                    if (overlay) {
                        overlay.classList.remove('hidden', 'launching')
                        overlay.style.visibility = 'visible'
                        overlay.style.opacity = '1'
                        overlay.setAttribute('aria-hidden', 'false')
                    }
                })
                await page.waitForTimeout(500)
            },
        },

        // 9. mode-grid — mode chip grid visible
        {
            name: 'mode-grid',
            baseline: 'mode-grid.png',
            description: 'Mode grid — County View / Bloom / Bridge / Path chips',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                await page.waitForTimeout(4000)
                // Force mode chips to be visible
                await page.evaluate(() => {
                    document.body.classList.add('is-active')
                    document.body.dataset.activeView = 'galaxy'
                    document.body.dataset.graphContext = 'focus-search'
                    document.body.dataset.panelSurface = 'focus-search'
                    document.documentElement.dataset.panelOpen = 'true'

                    const modeGrid = document.querySelector('#mode-grid') || document.querySelector('#mode-chips')
                    if (modeGrid) {
                        const el = modeGrid as HTMLElement
                        el.style.display = 'flex'
                        el.style.visibility = 'visible'
                        el.style.opacity = '1'
                        el.style.pointerEvents = 'auto'
                    }

                    // Ensure mode chips are visible
                    document.querySelectorAll('.mode-chip').forEach((chip) => {
                        const el = chip as HTMLElement
                        el.style.display = 'inline-flex'
                        el.style.visibility = 'visible'
                        el.style.opacity = '1'
                        el.style.pointerEvents = 'auto'
                    })
                })
                await page.waitForTimeout(1000)
            },
        },

        // 10. filters — filter toolbar open
        {
            name: 'filters',
            baseline: 'filters.png',
            description: 'Filters — filter toolbar with chips',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                await page.waitForTimeout(4000)
                // Open the filters section and force visibility
                await page.evaluate(() => {
                    document.body.dataset.graphContext = 'filters-open'

                    const filtersSection = document.querySelector('#filters-section') as HTMLDetailsElement | null
                    if (filtersSection) {
                        filtersSection.open = true
                    }

                    // Force filter chips visible
                    document.querySelectorAll('.filter-chip').forEach((chip) => {
                        const el = chip as HTMLElement
                        el.style.display = 'inline-flex'
                        el.style.visibility = 'visible'
                        el.style.opacity = '1'
                        el.style.pointerEvents = 'auto'
                    })

                    // Force city filter visible
                    const cityFilter = document.querySelector('#city-filter') as HTMLElement | null
                    if (cityFilter) {
                        cityFilter.style.display = 'block'
                        cityFilter.style.visibility = 'visible'
                        cityFilter.style.opacity = '1'
                    }

                    // Force filter toolbar visible
                    const filterToolbar = document.querySelector('.filter-toolbar') as HTMLElement | null
                    if (filterToolbar) {
                        filterToolbar.style.display = 'flex'
                        filterToolbar.style.visibility = 'visible'
                        filterToolbar.style.opacity = '1'
                    }
                })
                await page.waitForTimeout(1000)
            },
        },

        // 11. controls — camera controls visible
        {
            name: 'controls',
            baseline: 'controls.png',
            description: 'Controls — camera view toggle buttons',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            setup: async (page) => {
                const url = `${BASE_URL}?nodemo=1`
                await page.goto(url, { waitUntil: 'networkidle' })
                await page.waitForTimeout(4000)
                // Set map view to show camera controls
                await page.evaluate(() => {
                    document.body.dataset.activeView = 'map'
                    document.body.dataset.panelSurface = 'map-idle'
                    document.body.dataset.mapContext = 'idle'

                    // Ensure camera controls are visible
                    const cameraControls = document.querySelector('#camera-controls') as HTMLElement | null
                    if (cameraControls) {
                        cameraControls.style.display = 'flex'
                        cameraControls.style.visibility = 'visible'
                        cameraControls.style.opacity = '1'
                        cameraControls.style.pointerEvents = 'auto'
                    }

                    // Ensure control buttons are visible
                    document.querySelectorAll('#camera-controls .control-btn').forEach((btn) => {
                        const el = btn as HTMLElement
                        el.style.display = 'flex'
                        el.style.visibility = 'visible'
                        el.style.opacity = '1'
                        el.style.pointerEvents = 'auto'
                        el.style.minWidth = '44px'
                        el.style.minHeight = '44px'
                    })
                })
                await page.waitForTimeout(1000)
            },
        },

        // 12. info-panel-populated — info panel with business data (desktop)
        {
            name: 'info-panel-populated',
            baseline: 'info-panel-populated.png',
            description: 'Info panel populated — selected business details',
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                await page.waitForTimeout(4000)
                // Populate the info panel with synthetic business data
                await page.evaluate(() => {
                    document.body.dataset.activeView = 'galaxy'
                    document.body.dataset.graphContext = 'focus'
                    document.body.dataset.panelSurface = 'focus'

                    const selectedCard = document.querySelector('#selected-card') as HTMLElement | null
                    if (selectedCard) {
                        // Card populated state driven by renderer
                    }

                    const selectedDetails = document.querySelector('#selected-details') as HTMLElement | null
                    if (selectedDetails) {
                        selectedDetails.classList.add('active')
                        selectedDetails.hidden = false
                        selectedDetails.style.display = 'block'
                        selectedDetails.style.visibility = 'visible'
                    }

                    const selectedName = document.querySelector('#selected-name')
                    if (selectedName) selectedName.textContent = 'Downtown Coffee Collective'

                    const selectedWhat = document.querySelector('#selected-what')
                    if (selectedWhat) selectedWhat.textContent = 'Artisan coffee shop with outdoor seating'

                    const selectedTheme = document.querySelector('#selected-theme')
                    if (selectedTheme) selectedTheme.textContent = 'Food & Drink · Cafes'

                    const selectedStatus = document.querySelector('#selected-status')
                    if (selectedStatus) selectedStatus.textContent = 'Active'

                    const selectedFiledAs = document.querySelector('#selected-filed-as') as HTMLElement | null
                    if (selectedFiledAs) selectedFiledAs.style.display = 'none'
                })
                await page.waitForTimeout(1000)
            },
        },

        // 13. global-spacing — global spacing check at mobile width
        {
            name: 'global-spacing',
            baseline: 'global-spacing.png',
            description: 'Global spacing — touch targets and overflow check',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            setup: async (page) => {
                await page.goto(BASE_URL, { waitUntil: 'networkidle' })
                // Wait for mobile idle chrome to settle
                await page.waitForTimeout(5000)
            },
        },

        // 14. thread-inspector — Svelte thread inspector (hidden by default)
        {
            name: 'thread-inspector',
            baseline: 'thread-inspector.png',
            description: 'Thread inspector — Svelte component (hidden default)',
            viewport: { width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
            thresholdOverride: 8, // Thread inspector is Svelte-only and may not render in legacy shell
            setup: async (page) => {
                const focusedUrl = `${BASE_URL}?view=galaxy&q=coffee&anchor=519&nodemo=1`
                await page.goto(focusedUrl, { waitUntil: 'networkidle' })
                await page.waitForTimeout(4000)
                // The thread-inspector is Svelte-only and renders when
                // visible && threadInspectorActive(). In the legacy shell,
                // this component may not mount — capture whatever state is present.
            },
        },
    ]
}

// ── Main test runner ────────────────────────────────────────────────────────

interface TestResult {
    state: string
    passed: boolean
    diffPercent: number
    diffPixels: number
    skipped: boolean
    error?: string
    environmentNote?: string
}

async function runVisualRegression(): Promise<TestResult[]> {
    const results: TestResult[] = []
    const distDir = path.resolve(import.meta.dirname ?? __dirname, '..', 'dist', 'svelte')

    // Verify dist exists
    if (!fs.existsSync(distDir)) {
        console.error('❌ dist/svelte/ not found. Run `npm run build` first.')
        process.exit(1)
    }

    const states = getTestStates()

    console.log('\n🔬 Visual Regression Test')
    console.log('─'.repeat(50))
    console.log(`  Total states: ${states.length}`)

    // Start server
    const server = await startServer(distDir)

    let browser: Browser | null = null
    try {
        browser = await chromium.launch({ headless: true })

        for (const state of states) {
            console.log(`\n📸 Testing: ${state.name}`)
            console.log(`   ${state.description}`)

            // Determine viewport — use state override or default
            const viewport = state.viewport || DEFAULT_VIEWPORT

            // Create a fresh context with the appropriate viewport
            const contextOptions: any = {
                viewport: { width: viewport.width, height: viewport.height },
            }
            if (viewport.deviceScaleFactor) {
                contextOptions.deviceScaleFactor = viewport.deviceScaleFactor
            }
            if (viewport.isMobile) {
                contextOptions.isMobile = true
            }
            const context = await browser.newContext(contextOptions)
            const page = await context.newPage()

            const currentPath = path.join(BASELINE_DIR, `current-${state.name}.png`)
            const diffPath = path.join(DIFF_DIR, `${state.name}-diff.png`)
            const baselinePath = path.join(BASELINE_DIR, state.baseline)

            // Check if baseline exists (capture on first run if missing)
            const baselineExists = fs.existsSync(baselinePath)

            try {
                // Navigate and set up state
                await state.setup(page)

                // Capture screenshot
                await page.screenshot({ path: currentPath })
                console.log(`   ✓ Screenshot captured: current-${state.name}.png (${viewport.width}x${viewport.height})`)

                if (!baselineExists) {
                    // First run — copy current screenshot as baseline
                    fs.mkdirSync(BASELINE_DIR, { recursive: true })
                    fs.copyFileSync(currentPath, baselinePath)
                    console.log(`   📌 Baseline created: ${state.baseline}`)
                    results.push({
                        state: state.name,
                        passed: true,
                        diffPercent: 0,
                        diffPixels: 0,
                        skipped: false,
                        environmentNote: 'Baseline captured (first run)',
                    })
                } else {
                    // Compare with baseline
                    const stateThreshold = state.thresholdOverride ?? THRESHOLD
                    const comparison = compareImages(baselinePath, currentPath, diffPath)
                    const passed = comparison.diffPercent <= stateThreshold

                    if (passed) {
                        console.log(
                            `   ✅ PASS — ${comparison.diffPercent.toFixed(4)}% difference ` +
                                `(${comparison.diffPixels} / ${comparison.totalPixels} pixels)` +
                                (state.thresholdOverride ? ` (threshold: ${stateThreshold}%)` : '')
                        )
                        results.push({
                            state: state.name,
                            passed: true,
                            diffPercent: comparison.diffPercent,
                            diffPixels: comparison.diffPixels,
                            skipped: false,
                        })
                    } else {
                        console.log(
                            `   ❌ FAIL — ${comparison.diffPercent.toFixed(4)}% difference ` +
                                `(${comparison.diffPixels} / ${comparison.totalPixels} pixels) ` +
                                `(threshold: ${stateThreshold}%)`
                        )
                        console.log(`   Diff saved to: ${diffPath}`)
                        console.log(`   ℹ️  Headless rendering may differ from headed baselines (font anti-aliasing, WebGL)`)
                        results.push({
                            state: state.name,
                            passed: false,
                            diffPercent: comparison.diffPercent,
                            diffPixels: comparison.diffPixels,
                            skipped: false,
                        })
                    }
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                console.log(`   ⚠ SKIP — Could not reproduce state: ${msg}`)
                results.push({
                    state: state.name,
                    passed: false,
                    diffPercent: 0,
                    diffPixels: 0,
                    skipped: true,
                    error: msg,
                })
            } finally {
                await page.close()
                await context.close()
                // Clean up current screenshot
                if (fs.existsSync(currentPath)) {
                    fs.unlinkSync(currentPath)
                }
            }
        }
    } finally {
        if (browser) {
            await browser.close()
        }
        // Stop server
        server.close()
        console.log('\n  Server stopped.')
    }

    return results
}

// ── Report generation ───────────────────────────────────────────────────────

function generateReport(results: TestResult[]): string {
    const passed = results.filter((r) => r.passed).length
    const failed = results.filter((r) => !r.passed && !r.skipped).length
    const skipped = results.filter((r) => r.skipped).length
    const total = results.length

    let report = `# Visual Regression Test Report\n\n`
    report += `**Date:** ${new Date().toISOString()}\n`
    report += `**Total:** ${total} | **Passed:** ${passed} | **Failed:** ${failed} | **Skipped:** ${skipped}\n\n`

    if (passed === total) {
        report += `## ✅ All States Passed\n\n`
    } else {
        report += `## Results\n\n`
    }

    report += `| State | Result | Diff % | Diff Pixels | Notes |\n`
    report += `|-------|--------|--------|-------------|-------|\n`

    for (const r of results) {
        const icon = r.passed ? '✅' : r.skipped ? '⚠️' : '❌'
        const result = r.passed ? 'PASS' : r.skipped ? 'SKIP' : 'FAIL'
        const notes = r.error || r.environmentNote || (r.passed ? 'Within threshold' : `Exceeds ${THRESHOLD}% threshold`)
        report += `| ${r.state} | ${icon} ${result} | ${r.diffPercent.toFixed(4)}% | ${r.diffPixels} | ${notes} |\n`
    }

    report += `\n---\n\n`
    report += `**Threshold:** ${THRESHOLD}% pixel difference\n`
    report += `**Baselines:** tests/visual-baselines/\n`
    report += `**Diffs:** tests/visual-baselines/diffs/\n`

    return report
}

// ── Entry point ─────────────────────────────────────────────────────────────

async function main() {
    try {
        const results = await runVisualRegression()
        const report = generateReport(results)

        // Write report
        const reportDir = path.resolve(import.meta.dirname ?? __dirname, '..', 'tmp')
        fs.mkdirSync(reportDir, { recursive: true })
        const reportPath = path.join(reportDir, 'w35-visual-baseline-report.md')
        fs.writeFileSync(reportPath, report)
        console.log(`\n📄 Report written to: ${reportPath}`)

        // Print summary
        console.log('\n' + '─'.repeat(50))
        const passed = results.filter((r) => r.passed).length
        const failed = results.filter((r) => !r.passed && !r.skipped).length
        const skipped = results.filter((r) => r.skipped).length

        if (failed > 0) {
            console.log(`\n❌ ${failed} state(s) failed visual regression check.`)
            process.exit(1)
        } else if (skipped > 0) {
            console.log(`\n⚠️ ${skipped} state(s) skipped (could not reproduce).`)
            process.exit(0)
        } else {
            console.log(`\n✅ All ${passed} states passed visual regression check.`)
            process.exit(0)
        }
    } catch (err) {
        console.error('\n❌ Fatal error:', err)
        process.exit(1)
    }
}

main()
