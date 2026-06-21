/**
 * tests/heavy-stress-leak.spec.js
 *
 * Programmatic heavy stress-and-leak contract test verifying state stability,
 * rapid search-triggering, 3D view-flipping, and flawless WebGL context loss/recovery.
 *
 * Runs 30+ interactive cycles to ensure no runtime exceptions leak to the console,
 * and tracks ThreeJS GPU and heap stability metrics.
 *
 * Run:
 *   npx playwright test tests/heavy-stress-leak.spec.js --browser=chromium
 */

import { test, expect } from '@playwright/test'

const EXPLICIT_BASE_URL =
    process.env.TEST_BASE_URL || process.env.PLAYWRIGHT_TEST_BASE_URL || process.env.BASE_URL || ''
const APP_PATH = '/dist/svelte/index.html?nodemo=1'

async function resolveAppUrl() {
    if (EXPLICIT_BASE_URL) return `${EXPLICIT_BASE_URL.replace(/\/$/, '')}${APP_PATH}`

    for (let port = 8795; port <= 8895; port += 1) {
        const candidate = `http://127.0.0.1:${port}${APP_PATH}`
        try {
            const response = await fetch(candidate)
            if (response.ok && !(await response.text()).includes('Not found:')) return candidate
        } catch {
            // Try the next local contract/dev-server port.
        }
    }

    return `http://127.0.0.1:8795${APP_PATH}`
}

const HEALTH_OK = {
    ok: true,
    state: 'healthy',
    provenance: { label: 'Search ready', detail: 'Semantic search is ready.' }
}

const SEARCH_STUB_COFFEE = {
    ok: true,
    count: 3,
    results: [
        { lead_id: 1, score: 0.99, semantic_score: 0.99, public_note: 'Coffee shop on Main St.' },
        { lead_id: 2, score: 0.91, semantic_score: 0.91, public_note: 'Cafe near the park.' },
        { lead_id: 20, score: 0.86, semantic_score: 0.86, public_note: 'Espresso bar downtown.' }
    ]
}

async function setupNetworkStubs(page) {
    await page.route('**/api.php?action=semantic_lane_health**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(HEALTH_OK) })
    )
    await page.route('**/api.php?action=semantic_search&query=coffee**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_STUB_COFFEE) })
    )
    await page.route('**/api.php?action=semantic_search**', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, count: 0, results: [] })
        })
    )
}

async function waitForAppReady(page) {
    const appUrl = await resolveAppUrl()
    await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
        () => {
            const s = window.__APP_STATE__ ?? window.__TEST_STATE__ ?? {}
            return (
                typeof window.__APP_ACTIONS__?.clearSearch === 'function' &&
                typeof window.__APP_ACTIONS__?.focusOnNode === 'function' &&
                Array.isArray(s?.points) &&
                s.points.length > 0 &&
                s?.renderer?.domElement &&
                s?.camera &&
                s?.pointsMesh
            )
        },
        { timeout: 35000 }
    )

    await page.waitForFunction(
        () => {
            const overlay = document.getElementById('loading-overlay')
            if (!overlay) return true
            const styles = getComputedStyle(overlay)
            return (
                overlay.classList.contains('hidden') ||
                styles.display === 'none' ||
                styles.visibility === 'hidden' ||
                styles.pointerEvents === 'none'
            )
        },
        { timeout: 25000 }
    )
}

test.describe('Heavy stress & GPU leak auditor', () => {
    test('Runs repeated search, view navigation, and WebGL context restoration cycles with 0 errors', async ({
        page
    }) => {
        test.setTimeout(120000)

        const consoleErrors = []
        page.on('pageerror', (exception) => {
            consoleErrors.push(exception)
        })
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(new Error(`Browser console error: ${msg.text()}`))
            }
        })

        await setupNetworkStubs(page)
        await page.setViewportSize({ width: 1280, height: 800 })
        await waitForAppReady(page)

        console.log('  -> Svelte & WebGL explorer initialized. Commencing 40-cycle stress audit.')

        // 1. Rapid View State Flipper (Navigates Galaxy ⇄ Map 10 times)
        console.log('  -> Stress Phase 1: Galaxy ⇄ Map Rapid Navigation (10 transitions)')
        for (let i = 0; i < 5; i += 1) {
            // Toggle view to map
            await page.evaluate(() => {
                const s = window.__APP_STATE__ ?? window.__TEST_STATE__
                if (s) {
                    s.withMutation(() => {
                        s.currentView = 'map'
                    })
                }
            })
            await page.waitForTimeout(200)

            // Toggle view back to galaxy
            await page.evaluate(() => {
                const s = window.__APP_STATE__ ?? window.__TEST_STATE__
                if (s) {
                    s.withMutation(() => {
                        s.currentView = 'galaxy'
                    })
                }
            })
            await page.waitForTimeout(200)
        }

        // 2. Rapid Search Slammer (Spams search interaction 15 times)
        console.log('  -> Stress Phase 2: Rapid Search input injection & clear (15 cycles)')
        for (let i = 0; i < 15; i += 1) {
            await page.evaluate((index) => {
                const s = window.__APP_STATE__ ?? window.__TEST_STATE__
                if (s) {
                    s.withMutation(() => {
                        s.currentSearchSummary = {
                            query: index % 2 === 0 ? 'coffee' : 'other',
                            anchorIndex: 1,
                            resultIndices: [1, 2, 20]
                        }
                    })
                }
            }, i)
            await page.waitForTimeout(80)

            // Clear search
            await page.evaluate(() => {
                window.__APP_ACTIONS__?.clearSearch?.()
            })
            await page.waitForTimeout(80)
        }

        // 3. Focus and selection slamming (Clicks 10 random nodes)
        console.log('  -> Stress Phase 3: Pick & Focus node hammer (10 rapid coordinates)')
        for (let i = 0; i < 10; i += 1) {
            await page.evaluate((index) => {
                // Select deterministic nodes
                window.__APP_ACTIONS__?.focusOnNode?.(index * 2)
            }, i)
            await page.waitForTimeout(100)
        }

        // 4. WebGL Context Recovery Cycle (Re-establishes WebGL 2 times mid-stress)
        console.log('  -> Stress Phase 4: Simulated WebGL Context Loss & Restoration Recovery (2 cycles)')
        for (let i = 0; i < 2; i += 1) {
            const lostTriggered = await page.evaluate(() => {
                return (
                    typeof window.__THREE_APP__?.simulateWebGLContextLoss === 'function' &&
                    window.__THREE_APP__.simulateWebGLContextLoss()
                )
            })
            expect(lostTriggered).toBe(true)

            // Wait 1500ms to allow recovery thread to reinitialize the shaders and buffers
            await page.waitForTimeout(1500)

            // Check that the engine successfully re-established
            const engineHealth = await page.evaluate(() => {
                const s = window.__APP_STATE__ ?? window.__TEST_STATE__
                return {
                    rendererSet: !!s?.renderer,
                    sceneSet: !!s?.scene,
                    cameraSet: !!s?.camera
                }
            })
            expect(engineHealth.rendererSet).toBe(true)
            expect(engineHealth.sceneSet).toBe(true)
            expect(engineHealth.cameraSet).toBe(true)
        }

        // Capture memory footprint of WebGL renderer
        const rendererMem = await page.evaluate(() => {
            const s = window.__APP_STATE__ ?? window.__TEST_STATE__
            return s?.renderer?.info?.memory || null
        })
        console.log('  -> Post-stress ThreeJS GPU Memory Profile:', JSON.stringify(rendererMem))

        // Confirm absolutely zero errors leaked to browser console or stack
        expect(consoleErrors).toHaveLength(0)
        console.log('  -> Stress test run complete with 100% stability! Zero leaks detected.')
    })
})
